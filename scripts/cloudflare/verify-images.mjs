import { qaSession } from './qa-session.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const dir = new URL('../../.migration-backups/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('image-manifest.json', dir)));
const session = await qaSession();
assert.match(session.base, /^https:\/\/flowlog-staging\.[a-z0-9-]+\.workers\.dev$/);
let cursor = 0, done = 0, bytes = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  for (;;) {
    const i = cursor++;
    if (i >= manifest.length) return;
    const row = manifest[i];
    const response = await fetch(session.base + '/media/block-images/' + row.object_key, { headers: { Cookie: session.cookie } });
    assert.ok(response.ok, 'Authenticated image request failed: ' + response.status);
    assert.ok((response.headers.get('cache-control') || '').includes('no-store'));
    assert.equal(response.headers.get('content-type')?.split(';')[0], row.mime);
    const hash = createHash('sha256'); let size = 0;
    for await (const chunk of response.body) { hash.update(chunk); size += chunk.length; }
    assert.equal(size, row.size, 'Image size mismatch');
    assert.equal(hash.digest('hex'), row.sha256, 'Image hash mismatch');
    bytes += size; done++;
    if (done % 50 === 0) console.log('Verified private R2 images:', done);
  }
}));
const reportPath = new URL('copy-verification.json', dir);
const report = JSON.parse(await readFile(reportPath));
report.images = { count: done, bytes, all_hashes_matched: true };
await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log('All private R2 image hashes match:', done);
