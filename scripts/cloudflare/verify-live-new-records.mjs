/** Actual Queue/model generation, only on a new fictional life date. */
import { qaSession } from './qa-session.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const s = await qaSession(), day = '1990-03-02';
async function call(path, body) {
  const r = await fetch(s.base + path, { method: 'POST', headers: { Cookie: s.cookie, Origin: s.base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
const data = (table, body) => call('/api/data/' + table, body);
let entryId, blockId, browser;
try {
  const prior = await data('entries', { action: 'select', filters: [{ column: 'date', op: 'eq', value: day }] });
  assert.equal(prior.data.data.length, 0, 'Fictional rehearsal date must be unused');
  const before = await call('/api/rpc/diary_generation_status', { p_date: day });
  assert.equal(before.data.data.scope_reason, 'awaiting_new_record');
  const snapshot = JSON.parse(await readFile('.migration-backups/source-snapshot.json'));
  const copiedDate = snapshot.entries[0].date;
  const protectedReply = await call('/api/rpc/request_diary_generation', { p_date: copiedDate });
  assert.equal(protectedReply.status, 400, 'Copied diary regeneration remains denied');
  const entry = await data('entries', { action: 'insert', values: { date: day }, single: true });
  assert.equal(entry.status, 200); entryId = entry.data.data.id;
  const block = await data('blocks', { action: 'insert', values: {
    entry_id: entryId, content: '自動生成の動作確認用に作った架空の記録です。朝、テスト用の机を片付けてノートを開いた。',
    category: 'event', occurred_at: day + 'T03:00:00Z', images: [],
  }, single: true });
  assert.equal(block.status, 200); blockId = block.data.data.id;
  const seen = [], started = Date.now(); let status;
  while (Date.now() - started < 180000) {
    const result = await call('/api/rpc/diary_generation_status', { p_date: day });
    assert.equal(result.status, 200); status = result.data.data;
    if (seen.at(-1) !== status.status) { seen.push(status.status); console.log('New-record automatic job:', status.status); }
    if (['succeeded', 'failed'].includes(status.status)) break;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  const saved = await data('entries', { action: 'select', filters: [{ column: 'id', op: 'eq', value: entryId }], single: true });
  const report = { at: new Date().toISOString(), scope: 'new-fictional-date-only', manualGenerationRequestUsed: false,
    status: status?.status, seen, generatedNonempty: !!saved.data.data?.formatted_content?.trim(),
    scorePersisted: Number.isInteger(saved.data.data?.score), copiedDateRequestDenied: true };
  await writeFile('.migration-backups/live-new-record-generation.json', JSON.stringify(report, null, 2), { mode: 0o600 });
  assert.ok(report.status === 'succeeded' && report.generatedNonempty && report.scorePersisted, 'Automatic Queue/model save must succeed');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
  const cookie = s.cookie.split('=');
  await context.addCookies([{ name: cookie[0], value: cookie.slice(1).join('='), url: s.base, httpOnly: true, secure: true }]);
  const page = await context.newPage();
  await page.goto(s.base + '/dashboard?date=' + day);
  await page.getByText('日記更新済み', { exact: true }).waitFor();
  await page.screenshot({ path: '.migration-backups/new-record-generation-success.png', fullPage: true, animations: 'disabled' });
  console.log('PASS new record -> Queue -> selected Gemini -> diary/score save -> UI updated; copied diary rejected.');
} finally {
  if (browser) await browser.close();
  if (entryId) execFileSync('python3', ['scripts/cloudflare/new-record-generation.py', 'cleanup-fixture'], { stdio: 'pipe' });
  if (blockId) await data('blocks', { action: 'delete', filters: [{ column: 'id', op: 'eq', value: blockId }] });
  if (entryId) {
    await data('entries', { action: 'delete', filters: [{ column: 'id', op: 'eq', value: entryId }] });
    execFileSync('python3', ['scripts/cloudflare/new-record-generation.py', 'cleanup-fixture'], { stdio: 'pipe' });
  }
}
