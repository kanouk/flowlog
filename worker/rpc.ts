import { setBlockTiming } from './block-timing';
import type { Env } from './auth';
import { createBlocks, CreationError, requireCreationKey } from './create-block';
import { createServerClient, unpack, databaseError } from './database';
type Row = Record<string, unknown>;
type Result = {
    data: unknown;
    error: {
        code?: string;
        message: string;
    } | null;
};
export async function lifeDate(env: Env, owner: string, time: string) {
    const hour = (await env.DB.prepare('SELECT day_boundary_hour FROM user_ai_settings WHERE user_id=?').bind(owner).first<{
        day_boundary_hour: number;
    }>())?.day_boundary_hour || 0;
    return new Date(Date.parse(time) + (9 - hour) * 3600000).toISOString().slice(0, 10);
}
export async function callRpc(env: Env, owner: string, name: string, args: Row): Promise<Result> {
    const db = createServerClient(env, owner);
    try {
        if (args.p_user_id && args.p_user_id !== owner)
            return { data: null, error: { code: '42501', message: 'Owner mismatch' } };
        if (name === 'set_block_timing') return await setBlockTiming(env, owner, args);
        if (name === 'create_event_api') {
            const req = args.p_request as Row;
            const key = requireCreationKey(args.p_key);
            // Keep existing pre-migration receipt snapshots valid without rewriting them.
            const old = await env.DB.prepare('SELECT request,response FROM event_api_receipts WHERE user_id=? AND key=?').bind(owner, key).first<{ request: string; response: string }>();
            if (old) {
                const canonical = JSON.stringify(Object.fromEntries(Object.entries(req).sort(([a], [b]) => a.localeCompare(b))));
                if (old.request !== canonical) throw new CreationError('Idempotency key conflict', 409);
                return {data: {...JSON.parse(old.response), replayed: true}, error: null};
            }
            const result = await createBlocks(env, owner, key, [{...req, category: 'event'}]);
            return {data: {block: result.blocks[0], date: result.dates[0], replayed: result.replayed}, error: null};
        }
        if (name === 'update_block_api') {
            const expected = args.p_expected as Row, updates = args.p_updates as Row;
            const permitted = ['content', 'images', 'occurred_at', 'event_timing', 'category', 'tag', 'is_done', 'done_at', 'starts_at', 'ends_at', 'is_all_day', 'due_at', 'due_all_day', 'priority', 'extracted_text'];
            if (!expected || !updates || !Object.keys(updates).every(k => permitted.includes(k)))
                return { data: null, error: { code: '23514', message: 'Invalid block update' } };
            const where = 'id=? AND user_id=? AND content IS ? AND json(images) IS json(?) AND julianday(occurred_at)=julianday(?) AND entry_id=? AND revision=?';
            const params = [String(args.p_block_id), owner, expected.content == null ? null : String(expected.content), expected.images == null ? null : JSON.stringify(expected.images), String(expected.occurred_at), String(expected.entry_id), Number(expected.revision)];
            const keys = Object.keys(updates);
            if (!keys.length)
                return { data: null, error: { code: '23514', message: 'No fields' } };
            const values = keys.map(k => updates[k] == null ? null : typeof updates[k] === 'object' ? JSON.stringify(updates[k]) : typeof updates[k] === 'boolean' ? Number(updates[k]) : updates[k] as string | number);
            // Match the published PostgreSQL RPC: a photo edit never reassigns entry_id.
            const changed = await env.DB.prepare(`UPDATE blocks SET ${keys.map(k => `${k}=?`).join(',')} WHERE ${where} RETURNING *`).bind(...values, ...params).first<Row>();
            const current = changed ? await env.DB.prepare('SELECT * FROM blocks WHERE id=? AND user_id=?').bind(String(args.p_block_id), owner).first<Row>() : null;
            return { data: current ? await unpack(env, current) : null, error: null };
        }
        if (name === 'get_user_ai_api_keys_safe') {
            const { data, error } = await db.from('user_ai_api_keys').select('*');
            return { data: (data || []).map(r => ({ id: r.id, user_id: r.user_id, provider: r.provider, name: r.name, created_at: r.created_at, updated_at: r.updated_at, key_hint: r.api_key ? '****' + String(r.api_key).slice(-4) : '****', has_key: !!r.api_key })), error };
        }
        if (name === 'get_user_ai_models_safe') {
            const { data, error } = await db.from('user_ai_models').select('*').order('sort_order');
            const { data: keys } = await db.from('user_ai_api_keys').select('id,name');
            return { data: (data || []).map(r => ({ ...r, api_key_name: keys?.find(k => k.id === r.api_key_id)?.name || null })), error };
        }
        if (name === 'get_user_image_storage_settings_safe') {
            const { data, error } = await db.from('user_image_storage_settings').select('*').maybeSingle();
            return { data: [{ provider: data?.provider || 'default', has_gyazo_token: !!data?.gyazo_token, gyazo_token_hint: data?.gyazo_token ? '••••' + String(data.gyazo_token).slice(-4) : null }], error };
        }
        if (name === 'get_user_ai_settings_safe') {
            const { data, error } = await db.from('user_ai_settings').select('*').maybeSingle();
            if (!data)
                return { data: [], error };
            const { openai_api_key, anthropic_api_key, google_api_key, ...safe } = data;
            return { data: [{ ...safe, has_openai_key: !!openai_api_key, has_anthropic_key: !!anthropic_api_key, has_google_key: !!google_api_key }], error };
        }
        return (await import('./jobs')).jobRpc(env, owner, name, args);
    }
    catch (error) {
        return { data: null, error: error instanceof CreationError ? {code: 'PT'+error.status, message:error.message} : databaseError(error) };
    }
}
