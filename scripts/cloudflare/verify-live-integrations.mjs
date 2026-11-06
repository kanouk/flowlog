/** Real staging endpoints; existing clients and copied records remain unchanged. */
import { qaSession } from './qa-session.mjs';
import { randomBytes, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const s = await qaSession(), checks = [], createdEntries = [], createdBlocks = [];
const marker = 'FLOWLOG-STAGING-TEST-' + Date.now(), day = '1992-01-02';
let clientId, token;
async function call(path, body, { machine = false, form = false } = {}) {
  const r = await fetch(s.base + path, { method: 'POST', headers: {
    ...(machine ? token ? { Authorization: 'Bearer ' + token } : {} : { Cookie: s.cookie, Origin: s.base }),
    'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json',
  }, body: form ? new URLSearchParams(body) : JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  return { status: r.status, body: await r.json() };
}
const data = (table, body) => call('/api/data/' + table, body);
function check(name, value) { assert.ok(value, name); checks.push(name); }
async function tool(name, args = {}) {
  const r = await call('/mcp', { jsonrpc: '2.0', id: checks.length + 1, method: 'tools/call', params: { name, arguments: args } }, { machine: true });
  check('MCP ' + name, r.status === 200 && !r.body.error && !!r.body.result?.content?.[0]?.text);
  const value = JSON.parse(r.body.result.content[0].text);
  if (name.startsWith('add_') && value.id) createdBlocks.push(value.id);
  return value;
}
try {
  const models = (await call('/api/rpc/get_user_ai_models_safe', {})).body.data;
  for (const m of models) {
    const r = await call('/api/functions/test-ai-connection', { model_id: m.id });
    check('Model reference ' + m.model_name, r.status === 200 && r.body.success);
  }
  const raindrop = await call('/api/functions/raindrop-sync', { dry_run: true, mode: 'diff' });
  check('Real Raindrop GET rehearsal without importing or changing sync time', raindrop.status === 200 && raindrop.body.success && raindrop.body.dry_run && raindrop.body.imported === 0);
  const before = (await call('/api/rpc/get_user_image_storage_settings_safe', {})).body.data;
  check('R2 remains default storage', before?.[0]?.provider === 'default');
  const saved = await call('/api/functions/save-image-storage-settings', { provider: 'default' });
  const after = (await call('/api/rpc/get_user_image_storage_settings_safe', {})).body.data;
  check('Image settings save keeps stored credential metadata', saved.status === 200 && JSON.stringify(before) === JSON.stringify(after));
  const register = await call('/mcp/oauth/register', { client_name: marker, redirect_uris: ['https://client.example/flowlog-fixture'] }, { machine: true });
  check('Disposable OAuth client registration', register.status === 201 && !!register.body.client_id);
  clientId = register.body.client_id;
  const verifier = randomBytes(48).toString('base64url'), challenge = createHash('sha256').update(verifier).digest('base64url');
  const codeResponse = await call('/api/mcp/oauth/create-code', { client_id: clientId, redirect_uri: 'https://client.example/flowlog-fixture', scope: 'mcp:full', state: marker, code_challenge: challenge, code_challenge_method: 'S256' });
  check('Owner consent code created for disposable client', codeResponse.status === 200 && !!codeResponse.body.redirect_url);
  // Parse only; never navigate or send the code to an external callback.
  const callback = new URL(codeResponse.body.redirect_url);
  check('OAuth callback preserves state', callback.searchParams.get('state') === marker);
  const exchange = { grant_type: 'authorization_code', client_id: clientId, redirect_uri: 'https://client.example/flowlog-fixture', code: callback.searchParams.get('code'), code_verifier: verifier };
  const granted = await call('/mcp/oauth/token', exchange, { machine: true, form: true });
  check('Live PKCE token exchange', granted.status === 200 && !!granted.body.access_token); token = granted.body.access_token;
  const replay = await call('/mcp/oauth/token', exchange, { machine: true, form: true });
  check('Live OAuth code cannot be reused', replay.status === 400 && replay.body.error === 'invalid_grant');
  const init = await call('/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: marker, version: '1' } } }, { machine: true });
  check('OAuth token initializes MCP', init.status === 200 && !!init.body.result?.serverInfo);
  const list = await call('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { machine: true });
  check('Live MCP advertises 14 tools', list.status === 200 && list.body.result.tools.length === 14);
  // Tools without an occurred_at parameter use today. Refuse to write if that
  // date belongs to the owner already; never use a copied diary for a test.
  const today = new Date().toISOString().slice(0, 10);
  for (const date of [day, today]) {
    const existing = await data('entries', { action: 'select', filters: [{ column: 'date', op: 'eq', value: date }] });
    assert.equal(existing.body.data.length, 0, 'MCP fixture day must be unused');
    const entry = await data('entries', { action: 'insert', values: { date }, single: true });
    assert.equal(entry.status, 200); createdEntries.push(entry.body.data.id);
  }
  const event = await tool('add_event', { content: marker, occurred_at: day + 'T03:00:00Z' });
  check('MCP event readback', (await tool('list_events', { date: day })).some(b => b.id === event.id));
  const task = await tool('add_task', { content: marker + ' task' });
  await tool('complete_task', { task_id: task.id, is_done: true });
  check('MCP task completion readback', (await tool('list_tasks', { include_completed: true })).some(b => b.id === task.id && b.is_done));
  const schedule = await tool('add_schedule', { title: marker + ' schedule', starts_at: '2199-01-02T03:00:00Z' });
  check('MCP schedule readback', (await tool('list_schedules', { include_past: true })).some(b => b.id === schedule.id));
  const memo = await tool('add_memo', { content: marker + ' memo' });
  check('MCP memo readback', (await tool('list_memos')).some(b => b.id === memo.id));
  const later = await tool('add_read_later', { url: 'https://example.com/' + marker });
  await tool('mark_as_read', { block_id: later.id, is_read: true });
  check('MCP read status readback', (await tool('list_read_later', { filter: 'read' })).some(b => b.id === later.id && b.is_done));
  check('MCP search finds only fictional marker', (await tool('search_blocks', { query: marker })).length >= 5);
  check('MCP entry lookup uses fictional entry', (await tool('get_entry', { date: day })).date === day);
  await writeFile('.migration-backups/live-integrations-verification.json', JSON.stringify({ at: new Date().toISOString(), checks, passed: checks.length, raindrop: { dryRun: true, imported: 0 }, mcpToolsExercised: 14, callbackNeverVisited: true, existingClientsChanged: false }, null, 2), { mode: 0o600 });
  console.log('PASS', checks.length, 'live model/Raindrop/settings/OAuth/MCP checks.');
} finally {
  for (const id of createdBlocks.reverse()) await data('blocks', { action: 'delete', filters: [{ column: 'id', op: 'eq', value: id }] });
  for (const id of createdEntries.reverse()) {
    const remaining = await data('blocks', { action: 'select', filters: [{ column: 'entry_id', op: 'eq', value: id }] });
    if (remaining.body.data.length === 0) await data('entries', { action: 'delete', filters: [{ column: 'id', op: 'eq', value: id }] });
  }
  if (clientId) await data('user_api_tokens', { action: 'delete', filters: [{ column: 'name', op: 'eq', value: 'OAuth: ' + clientId }] });
}
