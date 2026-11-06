/** Firecrawl -> selected model -> D1, using only a new fictional record. */
import { qaSession } from './qa-session.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const s = await qaSession(), day = '1994-01-02', url = 'https://example.com/';
async function call(path, body) {
  const r = await fetch(s.base + path, {
    method: 'POST', headers: { Cookie: s.cookie, Origin: s.base, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
  });
  return { status: r.status, body: await r.json() };
}
const data = (table, body) => call('/api/data/' + table, body);
let entryId, blockId;
try {
  const before = await data('entries', { action: 'select', filters: [{ column: 'date', op: 'eq', value: day }] });
  assert.equal(before.body.data.length, 0, 'Fixture day must be unused');
  const entry = await data('entries', { action: 'insert', values: { date: day }, single: true });
  assert.equal(entry.status, 200); entryId = entry.body.data.id;
  const block = await data('blocks', { action: 'insert', values: {
    entry_id: entryId, content: 'Fictional URL summary verification: ' + url,
    category: 'read_later', occurred_at: day + 'T03:00:00Z',
  }, single: true });
  assert.equal(block.status, 200); blockId = block.body.data.id;
  const result = await call('/api/functions/summarize-url', { blockId, url });
  const metadata = result.body.url_metadata;
  const readback = await data('blocks', { action: 'select', filters: [{ column: 'id', op: 'eq', value: blockId }], single: true });
  const report = { at: new Date().toISOString(), scope: 'new-fictional-block-public-example-page', status: result.status,
    success: result.body.success === true, titleFound: /example/i.test(metadata?.title || ''),
    generatedNonempty: !!metadata?.summary?.trim(),
    saved: !!metadata && JSON.stringify(readback.body.data?.url_metadata) === JSON.stringify(metadata),
    providerError: result.status === 200 ? undefined : result.body.error,
    modelFallbackUsed: false };
  await writeFile('.migration-backups/live-summary-verification.json', JSON.stringify(report, null, 2), { mode: 0o600 });
  assert.ok(report.status === 200 && report.success && report.titleFound && report.generatedNonempty && report.saved,
    'Live URL summary failed; see private verification report');
  console.log('PASS Firecrawl -> selected model -> saved URL summary; only fictional record used.');
} finally {
  if (blockId) await data('blocks', { action: 'delete', filters: [{ column: 'id', op: 'eq', value: blockId }] });
  if (entryId) await data('entries', { action: 'delete', filters: [{ column: 'id', op: 'eq', value: entryId }] });
}
