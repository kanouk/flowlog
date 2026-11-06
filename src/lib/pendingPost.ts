// Keep the exact prepared payload and post ID until the server confirms it.
// A lost response must not turn a retry into a new post with a new timestamp.
type Row = Record<string, unknown>;
type Pending = { key: string; values?: Row };
const preparing = new Map<string, Promise<Pending>>();
const memory = new Map<string, Pending>();
export async function pendingPost(intent: unknown, prepare: () => Promise<Row>): Promise<{ storageKey: string; post: Pending }> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(intent)));
  const storageKey = 'flowlog.pending-post.' + Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, '0')).join('');
  let work = preparing.get(storageKey);
  if (!work) {
    work = (async () => {
      let post = memory.get(storageKey);
      if (!post) {
        const saved = localStorage.getItem(storageKey);
        post = saved ? JSON.parse(saved) as Pending : { key: 'ui:' + crypto.randomUUID() };
        memory.set(storageKey, post);
        localStorage.setItem(storageKey, JSON.stringify(post));
      }
      if (!post.values) {
        post.values = await prepare();
        localStorage.setItem(storageKey, JSON.stringify(post));
      }
      return post;
    })();
    preparing.set(storageKey, work);
    void work.finally(() => preparing.delete(storageKey)).catch(() => {});
  }
  return { storageKey, post: await work };
}
export function confirmPost(storageKey: string, key: string) {
  const saved = localStorage.getItem(storageKey);
  if (saved && (JSON.parse(saved) as Pending).key === key) localStorage.removeItem(storageKey);
  if (memory.get(storageKey)?.key === key) memory.delete(storageKey);
}
