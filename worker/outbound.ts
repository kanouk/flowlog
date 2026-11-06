import type { Env } from './auth';
export function guardedFetch(env: Env, delegate: typeof globalThis.fetch = globalThis.fetch): typeof globalThis.fetch {
    return async (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (url.protocol !== 'https:' || url.username || url.password)
            throw new Error('HTTPS destination required');
        if (url.hostname === 'ai.gateway.lovable.dev')
            throw new Error('Explicit AI model configuration required');
        let fixtureReceipt: string | undefined, fixtureUpload = false;
        if ((url.hostname.endsWith('gyazo.com') || url.hostname === 'api.raindrop.io') && !['GET', 'HEAD'].includes(method) && env.EXTERNAL_WRITES_ENABLED !== 'true') {
            const expires = Number(env.GYAZO_REHEARSAL_UNTIL);
            const active = /^[a-f0-9]{64}$/.test(env.GYAZO_REHEARSAL_SHA256 || '') && expires > Date.now() && expires <= Date.now() + 15 * 60_000;
            if (active && url.hostname === 'upload.gyazo.com' && url.pathname === '/api/upload' && method === 'POST' && init?.body instanceof FormData) {
                const image = init.body.get('imagedata');
                if (image instanceof File && image.type === 'image/png' && image.size <= 64 * 1024) {
                    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await image.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
                    fixtureUpload = hash === env.GYAZO_REHEARSAL_SHA256;
                }
            }
            if (active && url.hostname === 'api.gyazo.com' && method === 'DELETE' && /^\/api\/images\/[a-f0-9]{32}$/.test(url.pathname)) {
                const key = '_rehearsal/gyazo/' + url.pathname.split('/').at(-1);
                const receipt = await env.IMAGES.get(key);
                if (receipt) {
                    const value = await receipt.json<{ owner: string; hash: string; expires: number }>();
                    if (value.owner === env.OWNER_ID && value.hash === env.GYAZO_REHEARSAL_SHA256 && value.expires > Date.now()) fixtureReceipt = key;
                }
            }
            if (!fixtureUpload && !fixtureReceipt) throw new Error('External writes are disabled in staging');
        }
        try {
            const response = await delegate(input, init);
            if (response.ok && fixtureUpload) {
                const uploaded = await response.clone().json<{ image_id?: string }>();
                if (!uploaded.image_id || !/^[a-f0-9]{32}$/.test(uploaded.image_id)) throw new Error('Missing fixture image receipt');
                await env.IMAGES.put('_rehearsal/gyazo/' + uploaded.image_id, JSON.stringify({ owner: env.OWNER_ID, hash: env.GYAZO_REHEARSAL_SHA256, expires: Number(env.GYAZO_REHEARSAL_UNTIL) }));
            }
            if (response.ok && fixtureReceipt) await env.IMAGES.delete(fixtureReceipt);
            if (!response.ok && ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com', 'api.firecrawl.dev'].includes(url.hostname))
                return new Response(JSON.stringify({ error: { message: 'Provider request failed', code: 'provider_error' } }), { status: response.status, headers: { 'Content-Type': 'application/json' } });
            return response;
        }
        catch {
            throw new Error('External request failed');
        }
    };
}
