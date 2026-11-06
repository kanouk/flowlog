import { inferEventTiming } from '../src/lib/blockTiming';
import type { Env } from './auth';
import { columns } from './columns';
import { unpack } from './database';
import { isTimestamp, validateImages } from './ported/api/native-images';

type Row = Record<string, unknown>;
export class CreationError extends Error {
  constructor(message: string, public status: 400 | 409 | 428) { super(message); }
}
export function requireCreationKey(key: unknown): string {
  if (key == null || key === '') throw new CreationError('Idempotency-Key (or idempotency_key) is required. Reuse it when retrying the same post.', 428);
  if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new CreationError('Invalid Idempotency-Key', 400);
  return key;
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
export const creationRequest = (value: unknown) => JSON.stringify(stable(value));
export type CreatedBlocks = { blocks: Row[]; dates: string[]; replayed: boolean };
export async function readCreation(env: Env, owner: string, key: string, request: string): Promise<CreatedBlocks | null> {
  const receipt = await env.DB.prepare('SELECT request,response FROM block_create_receipts WHERE user_id=? AND key=?').bind(owner, key).first<{ request: string; response: string }>();
  if (!receipt) return null;
  if (receipt.request !== request) throw new CreationError('Idempotency key conflict: use a new key for a different post', 409);
  return { ...JSON.parse(receipt.response), replayed: true };
}
const allowed = new Set(['id', 'user_id', 'entry_id', 'content', 'images', 'category', 'occurred_at', 'tag', 'source', 'priority', 'starts_at', 'ends_at', 'is_all_day', 'due_at', 'due_all_day']);
function normalize(row: Row, owner: string): Row {
  if (Object.keys(row).some(k => !allowed.has(k)) || row.user_id != null && row.user_id !== owner) throw new CreationError('Invalid creation fields or owner', 400);
  const r: Row = { category: 'event', content: null, images: [], tag: null, source: null, priority: 0, starts_at: null, ends_at: null, is_all_day: false, due_at: null, due_all_day: false, ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) };
  delete r.user_id;
  delete r.entry_id; // transport reference, not the identity of the post
  if (!['event', 'task', 'schedule', 'thought', 'read_later'].includes(String(r.category))) throw new CreationError('Invalid category', 400);
  if (r.content !== null && typeof r.content !== 'string') throw new CreationError('Invalid content', 400);
  const imageError = validateImages(r.images);
  if (imageError) throw new CreationError(imageError, 400);
  if (r.occurred_at != null && !isTimestamp(r.occurred_at)) throw new CreationError('Invalid occurred_at', 400);
  return r;
}
export async function createBlocks(env: Env, owner: string, rawKey: unknown, input: Row[], fingerprint?: unknown, browser = false): Promise<CreatedBlocks> {
  const key = requireCreationKey(rawKey);
  if (!input.length || input.length > 100) throw new CreationError('Expected 1-100 blocks', 400);
  const rows = input.map(r => normalize(r, owner));
  const request = creationRequest(fingerprint ?? rows);
  const previous = await readCreation(env, owner, key, request);
  if (previous) return previous;
  const legacy = await env.DB.prepare('SELECT request,response FROM event_api_receipts WHERE user_id=? AND key=?').bind(owner, key).first<{request:string;response:string}>();
  if (legacy) {
    if (input.length !== 1 || creationRequest([normalize({...JSON.parse(legacy.request),category:'event'},owner)]) !== request) throw new CreationError('Idempotency key conflict',409);
    const old = JSON.parse(legacy.response);
    return {blocks:[old.block],dates:[old.date],replayed:true};
  }
  const hour = (await env.DB.prepare('SELECT day_boundary_hour FROM user_ai_settings WHERE user_id=?').bind(owner).first<{ day_boundary_hour: number }>())?.day_boundary_hour || 0;
  const statements: D1PreparedStatement[] = [];
  const ids: string[] = [], dates: string[] = [];
  for (const [index, logical] of rows.entries()) {
    const row: Row = { ...logical, occurred_at: logical.occurred_at || new Date().toISOString() };
    const date = new Date(Date.parse(String(row.occurred_at)) + (9 - hour) * 3600000).toISOString().slice(0, 10);
    if (input[index].entry_id != null) {
      const entry = await env.DB.prepare('SELECT date FROM entries WHERE id=? AND user_id=?').bind(String(input[index].entry_id), owner).first<{ date: string }>();
      if (!entry || entry.date !== date) throw new CreationError('Entry does not match the owned life date', 400);
    }
    if (browser && row.content) row.content_confirmed_at = new Date().toISOString();
    if (row.category === 'event' || row.category === 'thought') {
      row.event_timing = !browser && logical.occurred_at
        ? { kind: 'exact', origin: 'external', at: row.occurred_at }
        : inferEventTiming(row.content as string | null, date, hour, Date.now());
    }
    const id = String(row.id || crypto.randomUUID());
    delete row.id;
    ids.push(id); dates.push(date);
    statements.push(env.DB.prepare('INSERT INTO entries(id,user_id,date) VALUES(?,?,?) ON CONFLICT(user_id,date) DO NOTHING').bind(crypto.randomUUID(), owner, date));
    const fields = Object.keys(row);
    const values = fields.map(k => row[k] == null ? null : typeof row[k] === 'object' ? JSON.stringify(row[k]) : typeof row[k] === 'boolean' ? +row[k] : row[k] as string | number);
    statements.push(env.DB.prepare(`INSERT INTO blocks(id,user_id,entry_id,${fields.join(',')}) SELECT ?,?,id,${fields.map(() => '?')} FROM entries WHERE user_id=? AND date=?`).bind(id, owner, ...values, owner, date));
  }
  const booleanFields = new Set(['is_done', 'is_all_day', 'due_all_day']);
  const jsonFields = columns.blocks.map(k => `'${k}',${['images', 'url_metadata', 'event_timing', 'timeline_placement'].includes(k) ? `json(${k})` : booleanFields.has(k) ? `CASE WHEN ${k} IS NULL THEN NULL ELSE json(CASE WHEN ${k} THEN 'true' ELSE 'false' END) END` : k}`).join(',');
  const idList = JSON.stringify(ids);
  const selection = 'SELECT * FROM blocks WHERE user_id=? AND id IN (SELECT value FROM json_each(?)) ORDER BY (SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE value=blocks.id)';
  // Receipt uniqueness and every new block commit in the SAME D1 transaction.
  // A concurrent loser rolls back its inserts, then reads the winner's snapshot.
  statements.push(env.DB.prepare(`INSERT INTO block_create_receipts(user_id,key,request,response) SELECT ?,?,?,json_object('blocks',json_group_array(json_object(${jsonFields})),'dates',json(?),'replayed',json('false')) FROM (${selection})`).bind(owner, key, request, JSON.stringify(dates), owner, idList, idList));
  statements.push(env.DB.prepare(selection).bind(owner, idList, idList));
  try {
    const result = await env.DB.batch(statements);
    return { blocks: await Promise.all(result.at(-1)!.results.map(r => unpack(env, r as Row))), dates, replayed: false };
  } catch (error) {
    const saved = await readCreation(env, owner, key, request);
    if (saved) return saved;
    throw error;
  }
}
