import { inferEventTiming, type EventTiming } from '../src/lib/blockTiming';
import { Hono } from 'hono';
import { createBlocks, CreationError } from './create-block';
import type { Env } from './auth';
import { Query as OwnedQuery, serverColumns } from './database';
type Row = Record<string, unknown>;
type Filter = {
    column: string;
    op: string;
    value: unknown;
};
type Query = {
    action: string;
    columns?: string;
    filters?: Filter[];
    order?: {
        column: string;
        ascending: boolean;
    }[];
    limit?: number;
    values?: Row | Row[];
    single?: boolean;
    maybeSingle?: boolean;
    head?: boolean;
    search?: string;
    onConflict?: string;
};
const secretFields = new Set(['api_key', 'token', 'token_hash', 'gyazo_token', 'openai_api_key', 'anthropic_api_key', 'google_api_key']);
export function stripSecrets(value: unknown): unknown {
    if (Array.isArray(value))
        return value.map(stripSecrets);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).filter(([k]) => !secretFields.has(k)).map(([k, v]) => [k, stripSecrets(v)]));
    return value;
}
const app = new Hono<{
    Bindings: Env;
    Variables: {
        owner: string;
    };
}>();
app.post('/data/:table', async (c) => {
    const table = c.req.param('table');
    if (!serverColumns[table] || ['oauth_authorization_codes', 'user_image_storage_settings'].includes(table))
        return c.json({ error: 'Unknown browser resource' }, 404);
    const q = await c.req.json<Query>();
    if (!['select', 'insert', 'upsert', 'update', 'delete'].includes(q.action))
        return c.json({ error: 'Invalid action' }, 400);
    if (q.action === 'select' && q.columns && q.columns !== '*' && q.columns.split(',').some(k => secretFields.has(k.trim())))
        return c.json({ error: 'Secret projection is forbidden' }, 403);
    const rows = Array.isArray(q.values) ? q.values : [q.values || {}];
    if (rows.length > 100)
        return c.json({ error: 'Too many records' }, 400);
    if (q.action !== 'select')
        for (const row of rows) {
            if (row.user_id != null && row.user_id !== c.get('owner'))
                return c.json({ error: 'Owner mismatch' }, 403);
            if (Object.keys(row).some(k => !serverColumns[table].includes(k)))
                return c.json({ error: 'Unknown field' }, 400);
            if (q.action === 'update' && Object.keys(row).some(k => ['id', 'user_id', 'created_at', 'revision', 'event_timing', 'timeline_placement', 'content_confirmed_at', ...(table === 'entries' ? ['date'] : [])].includes(k)))
                return c.json({ error: 'Immutable field' }, 400);
            if (table === 'user_api_tokens' && q.action === 'insert' && (typeof row.token_hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.token_hash)))
                return c.json({ error: 'SHA256 token hash required' }, 400);
            if (table === 'user_ai_models' && row.api_key_id) {
                const key = await c.env.DB.prepare('SELECT provider FROM user_ai_api_keys WHERE id=? AND user_id=?').bind(String(row.api_key_id), c.get('owner')).first<{
                    provider: string;
                }>();
                if (!key || row.provider && row.provider !== key.provider)
                    return c.json({ error: 'Owned matching API key required' }, 400);
            }
            if (table === 'user_ai_feature_settings' && row.assigned_model_id && !await c.env.DB.prepare('SELECT id FROM user_ai_models WHERE id=? AND user_id=?').bind(String(row.assigned_model_id), c.get('owner')).first())
                return c.json({ error: 'Owned model required' }, 400);
        }
    if (table === 'blocks' && q.action === 'insert') {
        // Creation returns the saved snapshot even when a later edit/delete changed the row.
        try {
            if ((q.single || q.maybeSingle) && rows.length !== 1) return c.json({error:'Expected one block'},400);
            const created = await createBlocks(c.env, c.get('owner'), c.req.header('Idempotency-Key'), rows, undefined, true);
            const data = q.single || q.maybeSingle ? created.blocks[0] : created.blocks;
            if (q.single && created.blocks.length !== 1) return c.json({error:'Expected one block'},400);
            return c.json({data, error:null, count:created.blocks.length, replayed:created.replayed});
        } catch(error) {
            return c.json({error: error instanceof CreationError ? error.message : 'Creation failed'}, error instanceof CreationError ? error.status : 400);
        }
    }
    if (table === 'blocks' && q.action === 'update') {
        const row = rows[0];
        if ('time_confirmed_at' in row)
            return c.json({ error: 'Use the timing operation to answer or dismiss a question' }, 400);
        if ('content' in row || 'occurred_at' in row) {
            const id = q.filters?.find(f => f.column === 'id' && f.op === 'eq')?.value;
            if (rows.length !== 1 || typeof id !== 'string') return c.json({ error: 'One block is required' }, 400);
            const current = await c.env.DB.prepare(`SELECT b.content,b.occurred_at,b.event_timing,b.time_confirmed_at,b.revision,b.category,
                a.day_boundary_hour FROM blocks b LEFT JOIN user_ai_settings a ON a.user_id=b.user_id
                WHERE b.id=? AND b.user_id=?`).bind(id,c.get('owner')).first();
            if (!current) return c.json({ error: 'Block not found' }, 404);
            q.filters = [...q.filters!, { column: 'revision', op: 'eq', value: current.revision }];
            if ('content' in row && row.content !== current.content) {
                row.content_confirmed_at = new Date().toISOString();
                const previous = current.event_timing ? JSON.parse(String(current.event_timing)) as EventTiming : null;
                if (!current.time_confirmed_at && previous?.origin !== 'human' && previous?.origin !== 'external' &&
                    ['event','thought'].includes(String(row.category ?? current.category)) && typeof row.occurred_at !== 'string') {
                    const hour = Number(current.day_boundary_hour || 0);
                    const date = new Date(Date.parse(String(current.occurred_at)) + (9-hour)*3600000).toISOString().slice(0,10);
                    row.event_timing = inferEventTiming(row.content as string | null,date,hour,Date.now());
                }
            }
        }
        if (typeof row.occurred_at === 'string') {
            row.time_confirmed_at = new Date().toISOString();
            row.event_timing = { kind: 'exact', origin: 'human', at: row.occurred_at };
            row.timeline_placement = null;
        }
    }
    let query = new OwnedQuery(c.env, c.get('owner'), table);
    if (q.action === 'upsert') {
        if (table !== 'user_external_tokens' || q.onConflict !== 'user_id,service')
            return c.json({ error: 'Unsupported upsert' }, 400);
        query = query.upsert(q.values || {}, { onConflict: q.onConflict });
    }
    else if (q.action === 'insert')
        query = query.insert(q.values || {});
    else if (q.action === 'update')
        query = query.update((q.values || {}) as Row);
    else if (q.action === 'delete')
        query = query.delete();
    else
        query = query.select(q.columns || '*', { head: q.head });
    for (const filter of q.filters || []) {
        switch (filter.op) {
            case 'eq':
                query = query.eq(filter.column, filter.value);
                break;
            case 'gte':
                query = query.gte(filter.column, filter.value);
                break;
            case 'gt':
                query = query.gt(filter.column, filter.value);
                break;
            case 'lt':
                query = query.lt(filter.column, filter.value);
                break;
            case 'lte':
                query = query.lte(filter.column, filter.value);
                break;
            case 'in':
                query = query.in(filter.column, filter.value as unknown[]);
                break;
            case 'is':
                query = query.is(filter.column, filter.value);
                break;
            case 'not-null':
                query = query.not(filter.column, 'is', null);
                break;
            default: return c.json({ error: 'Invalid filter' }, 400);
        }
    }
    if (q.search) {
        if (!['entries', 'blocks'].includes(table))
            return c.json({ error: 'Invalid search' }, 400);
        const escaped = q.search.replace(/[%_,().]/g, ' ');
        query = query.or(table === 'blocks' ? `content.ilike.%${escaped}%,url_metadata->>summary.ilike.%${escaped}%` : `formatted_content.ilike.%${escaped}%,summary.ilike.%${escaped}%`);
    }
    for (const order of q.order || [])
        query = query.order(order.column, { ascending: order.ascending });
    if (q.limit != null)
        query = query.limit(q.limit);
    if (q.action !== 'select')
        query = query.select(q.columns || '*');
    if (q.single)
        query = query.single();
    else if (q.maybeSingle)
        query = query.maybeSingle();
    const result = await query;
    return c.json({ ...result, data: stripSecrets(result.data) }, result.error ? 400 : 200);
});
export default app;
