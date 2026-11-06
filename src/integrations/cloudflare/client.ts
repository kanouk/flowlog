import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';

// Temporary view adapter: keep existing hook result types while all I/O goes to
// the owner-scoped FlowLog Worker API. No Supabase SDK is loaded at runtime.
type Row = Record<string, unknown>;
type Reply = { data: unknown; error: { message: string;code?:string } | null; count?: number };
type Listener = (event: string, session: Session | null) => void;
const listeners = new Set<Listener>();
async function request(path: string, body?: unknown, key?: string): Promise<Reply> {
  try {
    const form = body instanceof FormData;
    const res = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: body === undefined || form ? undefined : { 'Content-Type': 'application/json', ...(key ? {'Idempotency-Key':key} : {}) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body) });
    const payload = await res.json();
    if (payload.error && res.ok) return {data:null,error:typeof payload.error==='string'?{message:payload.error}:payload.error};
    if(!res.ok && payload.error && typeof payload.error==='object' && typeof payload.error.message==='string')return {data:null,error:payload.error};
    if (!res.ok) return { data: null, error: { message: typeof payload.error === 'string' ? payload.error : payload.message || '隔離環境で処理できませんでした' } };
    return { data: payload.data === undefined ? payload : payload.data, count: payload.count, error: null };
  } catch { return { data: null, error: { message: '隔離環境に接続できませんでした' } }; }
}
async function getSession() {
  const result = await request('/api/session');
  const data = result.data as { user?: { id: string; email: string } } | null;
  const session = data?.user ? { user: { ...data.user, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' },
    access_token: 'cookie-session', refresh_token: '', expires_in: 43200, token_type: 'bearer' } as Session : null;
  return { data: { session }, error: result.error };
}
class Query implements PromiseLike<Reply> {
  private creationKey = crypto.randomUUID();
  private execution?: Promise<Reply>;
  private body: { action: string; filters: Row[]; order: Row[]; [key: string]: unknown } = { action: 'select', filters: [], order: [] };
  constructor(private table: string) {}
  select(columns = '*', options?: { head?: boolean }) { this.body.columns = columns; this.body.head = options?.head; return this; }
  insert(values: unknown) { this.body.action = 'insert'; this.body.values = values; return this; }
  upsert(values: unknown, options?: {onConflict?:string}) { this.body.action='upsert';this.body.values=values;this.body.onConflict=options?.onConflict||'id';return this; }
  update(values: unknown) { this.body.action = 'update'; this.body.values = values; return this; }
  delete() { this.body.action = 'delete'; return this; }
  eq(column: string, value: unknown) { return this.filter(column, 'eq', value); }
  gte(column: string, value: unknown) { return this.filter(column, 'gte', value); }
  gt(column: string, value: unknown) { return this.filter(column, 'gt', value); }
  lt(column: string, value: unknown) { return this.filter(column, 'lt', value); }
  lte(column: string, value: unknown) { return this.filter(column, 'lte', value); }
  in(column: string, value: unknown) { return this.filter(column, 'in', value); }
  is(column: string, value: unknown) { return this.filter(column, 'is', value); }
  not(column: string, operator: string, value: unknown) { return this.filter(column, operator === 'is' && value === null ? 'not-null' : 'unsupported', value); }
  private filter(column: string, op: string, value: unknown) { this.body.filters.push({ column, op, value }); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.body.order.push({ column, ascending: options?.ascending ?? true }); return this; }
  limit(value: number) { this.body.limit = value; return this; }
  or(value: string) { this.body.search = value.match(/ilike\.%([\s\S]*?)%/)?.[1] || ''; return this; }
  single() { this.body.single = true; return this; }
  maybeSingle() { this.body.maybeSingle = true; return this; }
  then<T = Reply, U = never>(resolve?: ((value: Reply) => T | PromiseLike<T>) | null, reject?: ((reason: unknown) => U | PromiseLike<U>) | null): Promise<T | U> {
    this.execution ??= request(`/api/data/${encodeURIComponent(this.table)}`, this.body, this.table === 'blocks' && this.body.action === 'insert' ? this.creationKey : undefined);
    return this.execution.then(resolve, reject);
  }
}
const client = {
  from: (table: string) => new Query(table),
  rpc: (name: string, body: unknown = {}) => request(`/api/rpc/${encodeURIComponent(name)}`, body),
  functions: { invoke: (name: string, options: { body?: unknown } = {}) => request(`/api/functions/${encodeURIComponent(name)}`, options.body || {}) },
  auth: {
    getSession,
    getUser: async () => { const r = await getSession(); return { data: { user: r.data.session?.user || null }, error: r.error }; },
    onAuthStateChange: (listener: Listener) => { listeners.add(listener); return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }; },
    signInWithPassword: async (body: { email: string; password: string }) => {
      const result = await request('/api/auth/sign-in/email', body);
      if (!result.error) { const { data } = await getSession(); for (const listener of listeners) listener('SIGNED_IN', data.session); }
      return result;
    },
    signOut: async () => { const result = await request('/api/auth/sign-out', {}); if (!result.error) for (const l of listeners) l('SIGNED_OUT', null); return result; },
    signUp: async () => ({ error: { message: '新規登録は無効です' } }),
    signInAnonymously: async () => ({ error: { message: '匿名ログインは無効です' } }),
  },
  storage: { from: () => ({
    upload: async (_path: string, file: File) => { const body = new FormData(); body.append('file', file); return request('/api/images', body); },
    getPublicUrl: (key: string) => ({ data: { publicUrl: `${window.location.origin}/media/block-images/${key.split('/').map(encodeURIComponent).join('/')}` } }),
    remove: (paths: string[]) => request('/api/images/delete', { paths }),
  }) },
};
type WorkerRpc = {
  rpc(name: 'diary_generation_status' | 'request_diary_generation', args: { p_date: string }): Promise<Reply>;
  rpc(name: 'set_block_timing', args: { p_id: string; p_action: string; p_period?: string; p_later?: string | null; p_earlier?: string | null }): Promise<Reply>;
};
export const flowlog = client as unknown as SupabaseClient<Database> & WorkerRpc;
export const resetStagingPassword = (token: string, newPassword: string) => request('/api/auth/reset-password', { token, newPassword });
export const postBlock = (values: Row, key: string) => request('/api/data/blocks', {action:'insert', values, single:true}, key);
