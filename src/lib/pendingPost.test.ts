import { beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

beforeEach(() => { localStorage.clear(); vi.resetModules(); vi.stubGlobal('crypto', webcrypto); });

it('keeps the key and exact prepared timestamp across a lost response and a page reload', async () => {
  let helpers = await import('./pendingPost');
  const first = await helpers.pendingPost({user:'owner',content:'fixture'}, async () => ({content:'fixture',occurred_at:'1999-01-01T03:00:00Z'}));
  vi.resetModules(); helpers = await import('./pendingPost');
  const retry = await helpers.pendingPost({user:'owner',content:'fixture'}, async () => {throw Error('must reuse prepared payload');});
  expect(retry.post).toEqual(first.post);
  helpers.confirmPost(retry.storageKey,retry.post.key);
  const distinct = await helpers.pendingPost({user:'owner',content:'fixture'},async()=>({content:'fixture',occurred_at:'1999-01-02T03:00:00Z'}));
  expect(distinct.post.key).not.toBe(first.post.key);
});

it('concurrent UI callbacks share the same preparation and key', async () => {
  const {pendingPost} = await import('./pendingPost');
  const prepare = vi.fn(async()=>({content:'concurrent fixture'}));
  const results = await Promise.all(Array.from({length:8},()=>pendingPost({user:'owner',content:'concurrent fixture'},prepare)));
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(new Set(results.map(r=>r.post.key)).size).toBe(1);
});

it('keeps successful rows pending until the whole batch is acknowledged, with separate IDs for identical lines', async () => {
  const {pendingPost,confirmPost} = await import('./pendingPost');
  const first = await pendingPost({user:'owner',batchKey:'batch:0',content:'same line'},async()=>({content:'same line'}));
  const second = await pendingPost({user:'owner',batchKey:'batch:1',content:'same line'},async()=>({content:'same line'}));
  expect(first.post.key).not.toBe(second.post.key);
  const retry = await pendingPost({user:'owner',batchKey:'batch:0',content:'same line'},async()=>{throw Error('already prepared');});
  expect(retry.post.key).toBe(first.post.key);
  confirmPost(first.storageKey,first.post.key); confirmPost(second.storageKey,second.post.key);
  expect(localStorage.length).toBe(0);
});

it('never shares a pending post with another owner or changed input', async () => {
  const {pendingPost} = await import('./pendingPost');
  const prepare = async()=>({content:'fixture'});
  const rows = await Promise.all([pendingPost({user:'a',text:'one'},prepare),pendingPost({user:'b',text:'one'},prepare),pendingPost({user:'a',text:'two'},prepare)]);
  expect(new Set(rows.map(r=>r.post.key)).size).toBe(3);
});
