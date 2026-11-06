import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './auth';
import { columns } from './columns';
import { seal, unseal } from './crypto';
type Row = Record<string, unknown>;
export function databaseError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { code: /Protected block/.test(message) ? 'PT409' : /UNIQUE constraint failed/i.test(message) ? '23505' : /FOREIGN KEY constraint/i.test(message) ? '23503' : /constraint|Content or images|image attachments|Invalid (?:or future|schedule|tag|day boundary|AI provider|image provider)/i.test(message) ? '23514' : 'DATABASE_OPERATION_FAILED', message: /Protected block/.test(message) ? '本人が確定した項目はアプリで編集してください' : 'Owned database operation failed' };
}
type Result = {
    data: unknown;
    error: {
        message: string;
        code?: string;
    } | null;
    count?: number;
};
const privateColumns = {
    user_ai_api_keys: ['id', 'user_id', 'provider', 'name', 'api_key', 'created_at', 'updated_at'],
    user_image_storage_settings: ['id', 'user_id', 'provider', 'gyazo_token', 'created_at', 'updated_at'],
    oauth_authorization_codes: ['id', 'user_id', 'code', 'code_challenge', 'code_challenge_method', 'redirect_uri', 'client_id', 'scope', 'state', 'expires_at', 'created_at'],
};
export const serverColumns: Record<string, readonly string[]> = { ...columns, ...privateColumns };
const secrets = new Set(['api_key', 'token', 'gyazo_token', 'openai_api_key', 'anthropic_api_key', 'google_api_key']);
const booleans = new Set(['is_done', 'is_all_day', 'due_all_day', 'is_active', 'enabled', 'auto_ocr', 'score_enabled']);
const objects = new Set(['images', 'url_metadata', 'event_timing', 'timeline_placement']);
const valueFor = (value: unknown): string | number | null => value == null ? null : typeof value === 'object' ? JSON.stringify(value) : typeof value === 'boolean' ? +value : typeof value === 'number' ? value : String(value);
export async function unpack(env: Env, row: Row): Promise<Row> {
    const output = { ...row };
    for (const [key, value] of Object.entries(output)) {
        if (typeof value === 'string' && secrets.has(key) && value)
            output[key] = await unseal(env, value);
        else if (booleans.has(key) && value != null)
            output[key] = !!value;
        else if (objects.has(key) && typeof value === 'string')
            output[key] = JSON.parse(value);
    }
    return output;
}
export class Query implements PromiseLike<Result> {
    private action = 'select';
    private projection = '*';
    private values: Row[] = [];
    private filters: {
        field: string;
        op: string;
        value: unknown;
    }[] = [];
    private sorting: string[] = [];
    private maximum = 10000;
    private offset = 0;
    private one = false;
    private maybe = false;
    private head = false;
    private conflict = '';
    constructor(private env: Env, private owner: string, private table: string) { }
    private field(field: string) {
        if (field.includes('->>')) {
            const [base, key] = field.split('->>');
            if (!serverColumns[this.table]?.includes(base) || !/^[a-z_]+$/i.test(key))
                throw new Error('Invalid JSON selector');
            return `json_extract(${base}, '$.${key}')`;
        }
        if (!serverColumns[this.table]?.includes(field))
            throw new Error('Invalid column');
        return field;
    }
    select(value = '*', options?: {
        head?: boolean;
    }) { this.projection = value; this.head = !!options?.head; return this; }
    insert(value: Row | Row[]) { this.action = 'insert'; this.values = Array.isArray(value) ? value : [value]; return this; }
    upsert(value: Row | Row[], options?: {
        onConflict?: string;
    }) { this.insert(value); this.conflict = options?.onConflict || 'id'; return this; }
    update(value: Row) { this.action = 'update'; this.values = [value]; return this; }
    delete() { this.action = 'delete'; return this; }
    eq(field: string, value: unknown) { return this.filter(field, '=', value); }
    neq(field: string, value: unknown) { return this.filter(field, '!=', value); }
    gte(field: string, value: unknown) { return this.filter(field, '>=', value); }
    gt(field: string, value: unknown) { return this.filter(field, '>', value); }
    lt(field: string, value: unknown) { return this.filter(field, '<', value); }
    lte(field: string, value: unknown) { return this.filter(field, '<=', value); }
    is(field: string, value: unknown) { return this.filter(field, 'IS', value); }
    not(field: string, operator: string, value: unknown) { if (operator !== 'is' || value !== null)
        throw new Error('Unsupported exclusion'); return this.filter(field, 'IS NOT', null); }
    in(field: string, value: unknown) { return this.filter(field, 'IN', value); }
    ilike(field: string, value: unknown) { return this.filter(field, 'LIKE', value); }
    or(value: string) { this.filters.push({ field: '', op: 'OR', value }); return this; }
    private filter(field: string, op: string, value: unknown) { this.filters.push({ field, op, value }); return this; }
    order(field: string, options: {
        ascending?: boolean;
        nullsFirst?: boolean;
    } = {}) { this.sorting.push(`${this.field(field)} ${options.ascending === false ? 'DESC' : 'ASC'} NULLS ${options.nullsFirst ? 'FIRST' : 'LAST'}`); return this; }
    limit(value: number) { this.maximum = Math.min(10000, Math.max(0, value)); return this; }
    range(start: number, end: number) { this.offset = start; return this.limit(end - start + 1); }
    single() { this.one = true; return this; }
    maybeSingle() { this.maybe = true; return this; }
    private async run(): Promise<Result> {
        try {
            if (!serverColumns[this.table])
                throw new Error('Unknown table');
            const where = ['user_id = ?'];
            const params: (string | number | null)[] = [this.owner];
            for (const f of this.filters) {
                if (f.op === 'OR') {
                    const parts = String(f.value).split(',');
                    const clauses = parts.map(part => {
                        const [field, operator, ...rest] = part.split('.');
                        if (!['ilike', 'eq'].includes(operator))
                            throw new Error('Unsupported OR');
                        params.push(rest.join('.'));
                        return `${this.field(field)} ${operator === 'ilike' ? 'LIKE' : '='} ?`;
                    });
                    where.push('(' + clauses.join(' OR ') + ')');
                }
                else if (f.op === 'IN') {
                    if (!Array.isArray(f.value) || f.value.length > 500)
                        throw new Error('Invalid membership');
                    where.push(`${this.field(f.field)} IN (${f.value.map(() => '?').join(',') || 'NULL'})`);
                    params.push(...f.value.map(valueFor));
                }
                else {
                    const timestamp = ['created_at', 'updated_at', 'occurred_at', 'done_at', 'starts_at', 'ends_at', 'due_at', 'last_synced_at', 'expires_at'].includes(f.field) && f.value != null && ['=', '!=', '>=', '>', '<', '<='].includes(f.op);
                    where.push(timestamp ? `julianday(${this.field(f.field)}) ${f.op} julianday(?)` : `${this.field(f.field)} ${f.value == null && f.op === '=' ? 'IS' : f.op} ?`);
                    params.push(valueFor(f.value));
                }
            }
            let nested = false;
            let projection = this.projection;
            if (projection.includes('entries!inner(')) {
                nested = true;
                projection = projection.slice(0, projection.indexOf('entries!inner(')).replace(/,\s*$/, '');
            }
            if (projection !== '*')
                projection = projection.split(',').map(f => this.field(f.trim())).join(',');
            const whereSql = where.join(' AND ');
            let rows: Row[] = [], count = 0;
            if (this.action === 'select') {
                if (this.head) {
                    count = (await this.env.DB.prepare(`SELECT count(*) AS n FROM ${this.table} WHERE ${whereSql}`).bind(...params).first<{
                        n: number;
                    }>())?.n || 0;
                }
                else {
                    const query = `SELECT ${projection} FROM ${this.table} WHERE ${whereSql}${this.sorting.length ? ' ORDER BY ' + this.sorting.join(',') : ''} LIMIT ? OFFSET ?`;
                    rows = (await this.env.DB.prepare(query).bind(...params, this.maximum, this.offset).all<Row>()).results;
                    count = rows.length;
                }
            }
            else if (this.action === 'delete') {
                if (!this.filters.length)
                    throw new Error('Explicit deletion target required');
                rows = (await this.env.DB.prepare(`DELETE FROM ${this.table} WHERE ${whereSql} RETURNING *`).bind(...params).all<Row>()).results;
            }
            else {
                const statements: D1PreparedStatement[] = [];
                for (const original of this.values) {
                    const row = { ...original };
                    if (row.user_id != null && row.user_id !== this.owner)
                        throw new Error('Owner mismatch');
                    if (this.action === 'insert') {
                        row.id ??= crypto.randomUUID();
                        row.user_id = this.owner;
                    }
                    if (!Object.keys(row).every(k => serverColumns[this.table].includes(k)))
                        throw new Error('Invalid write field');
                    for (const key of Object.keys(row))
                        if (secrets.has(key) && typeof row[key] === 'string' && row[key])
                            row[key] = await seal(this.env, row[key] as string);
                    if (this.action === 'update' && serverColumns[this.table].includes('updated_at'))
                        row.updated_at = new Date().toISOString();
                    const keys = Object.keys(row), values = keys.map(k => valueFor(row[k]));
                    if (this.action === 'insert') {
                        let suffix = '';
                        if (this.conflict) {
                            const conflict = this.conflict.split(',').map(f => this.field(f.trim())).join(',');
                            const mutable = keys.filter(k => !['id', 'user_id', 'created_at'].includes(k));
                            const updates = mutable.map(k => `${k}=excluded.${k}`);
                            if (serverColumns[this.table].includes('updated_at') && !mutable.includes('updated_at'))
                                updates.push("updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')");
                            suffix = ` ON CONFLICT(${conflict}) DO ${updates.length ? 'UPDATE SET ' + updates.join(',') : 'NOTHING'}`;
                        }
                        statements.push(this.env.DB.prepare(`INSERT INTO ${this.table} (${keys.join(',')}) VALUES (${keys.map(() => '?')})${suffix} RETURNING *`).bind(...values));
                    }
                    else {
                        if (!this.filters.length || keys.some(k => ['id', 'user_id', 'created_at', 'revision'].includes(k)))
                            throw new Error('Immutable field or missing target');
                        statements.push(this.env.DB.prepare(`UPDATE ${this.table} SET ${keys.map(k => `${k}=?`).join(',')} WHERE ${whereSql} RETURNING *`).bind(...values, ...params));
                    }
                }
                if (statements.length)
                    rows = (await this.env.DB.batch(statements)).flatMap(r => r.results as Row[]);
            }
            const decoded = await Promise.all(rows.map(r => unpack(this.env, r)));
            if (nested)
                for (const row of decoded)
                    row.entries = await this.env.DB.prepare('SELECT id,date,formatted_content FROM entries WHERE id=? AND user_id=?').bind(row.entry_id, this.owner).first();
            if (this.one && decoded.length !== 1 || this.maybe && decoded.length > 1)
                return { data: null, error: { code: 'PGRST116', message: 'Expected one owned record' } };
            return { data: this.head ? null : this.one || this.maybe ? decoded[0] || null : decoded, count: this.action === 'select' ? count : decoded.length, error: null };
        }
        catch (error) {
            return { data: null, error: databaseError(error) };
        }
    }
    then<T = Result, U = never>(resolve?: ((value: Result) => T | PromiseLike<T>) | null, reject?: ((reason: unknown) => U | PromiseLike<U>) | null): Promise<T | U> { return this.run().then(resolve, reject); }
}
export function createServerClient(env: Env, owner: string, authenticatedOwner: string | null = owner) {
    const client = {
        from: (table: string) => new Query(env, owner, table),
        auth: { getUser: async () => ({ data: { user: authenticatedOwner ? { id: authenticatedOwner, email: env.OWNER_EMAIL } : null }, error: authenticatedOwner ? null : { message: 'Unauthorized' } }) },
        rpc: async (name: string, args: Row = {}) => (await import('./rpc')).callRpc(env, owner, name, args),
        storage: { from: () => ({
                upload: async (path: string, blob: Blob) => {
                    if (!path.startsWith(owner + '/') || path.includes('..'))
                        return { data: null, error: { message: 'Invalid image path' } };
                    await env.IMAGES.put(path, blob.stream(), { httpMetadata: { contentType: blob.type } });
                    return { data: { path }, error: null };
                },
                getPublicUrl: (path: string) => ({ data: { publicUrl: env.APP_ORIGIN + '/media/block-images/' + path } }),
            }) },
    };
    return client as unknown as SupabaseClient;
}
