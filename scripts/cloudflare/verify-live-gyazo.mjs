/** Run only after explicit authorization for one fictional upload/delete. */
import { qaSession } from './qa-session.mjs';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
if (process.argv.includes('--prepare')) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const encoded = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 120;
      const g = canvas.getContext('2d'); g.fillStyle = 'white'; g.fillRect(0, 0, 600, 120);
      g.fillStyle = 'black'; g.font = 'bold 28px sans-serif'; g.fillText('FLOWLOG STAGING TEST', 28, 75);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await writeFile('.migration-backups/gyazo-rehearsal.png', Buffer.from(encoded, 'base64'), { mode: 0o600 });
  } finally { await browser.close(); }
  console.log('Prepared only the approved fictional image.');
  process.exit(0);
}
const s = await qaSession(); let uploadedURL, deleted = false, providerChanged = false;
async function call(path, body) {
  const form = body instanceof FormData;
  const r = await fetch(s.base + path, { method: 'POST', headers: { Cookie: s.cookie, Origin: s.base, ...(form ? {} : { 'Content-Type': 'application/json' }) }, body: form ? body : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  return { status: r.status, body: await r.json() };
}
try {
  const before = (await call('/api/rpc/get_user_image_storage_settings_safe', {})).body.data[0];
  assert.equal(before.provider, 'default'); assert.ok(before.has_gyazo_token);
  const changed = await call('/api/functions/save-image-storage-settings', { provider: 'gyazo' });
  assert.equal(changed.status, 200); providerChanged = true;
  const form = new FormData(); form.append('image', new File([await readFile('.migration-backups/gyazo-rehearsal.png')], 'FLOWLOG-STAGING-TEST.png', { type: 'image/png' }));
  const upload = await call('/api/functions/gyazo-upload', form);
  assert.equal(upload.status, 200, 'One approved Gyazo fixture upload must succeed');
  uploadedURL = upload.body.url;
  assert.match(uploadedURL, /^https:\/\/i\.gyazo\.com\/[a-f0-9]{32}\.png$/);
  await writeFile('.migration-backups/gyazo-rehearsal-receipt.json', JSON.stringify({ uploadedURL, at: new Date().toISOString(), deleted: false }), { mode: 0o600 });
  const readback = await fetch(uploadedURL); assert.equal(readback.status, 200);
  const original = await readFile('.migration-backups/gyazo-rehearsal.png');
  assert.ok(Buffer.from(await readback.arrayBuffer()).equals(original), 'Only approved fixture bytes are present on Gyazo');
  const remove = await call('/api/functions/gyazo-delete', { url: uploadedURL });
  assert.equal(remove.status, 200); assert.ok(remove.body.success); deleted = true;
  await writeFile('.migration-backups/gyazo-rehearsal-receipt.json', JSON.stringify({ uploadedURL, at: new Date().toISOString(), deleted: true }), { mode: 0o600 });
  await writeFile('.migration-backups/live-gyazo-verification.json', JSON.stringify({ at: new Date().toISOString(), uploaded: 1, deleted: 1, bytesMatch: true, scope: 'explicitly-approved-fictional-image-only', existingImagesTouched: 0, receiptLimitedDelete: true }), { mode: 0o600 });
  console.log('PASS one approved fictional Gyazo image uploaded, bytes checked, and deleted.');
} finally {
  if (uploadedURL && !deleted) {
    const cleanup = await call('/api/functions/gyazo-delete', { url: uploadedURL });
    if (cleanup.status !== 200) console.error('Fixture cleanup pending; private receipt retained.');
  }
  if (providerChanged) {
    const restored = await call('/api/functions/save-image-storage-settings', { provider: 'default' });
    assert.equal(restored.status, 200, 'Restore R2 as the default image storage');
  }
}
