import { Hono } from 'hono';
import { authFor, type Env } from './auth';
import { sha256 } from './crypto';
import browserData, { stripSecrets } from './browser-data';
import { callRpc } from './rpc';
import { dispatchDiary, consumeDiary } from './jobs';
import { createHandler as restHandler } from './ported/api';
import { createHandler as mcpHandler } from './ported/mcp-server';
import { createHandler as ocrHandler } from './ported/ocr-image';
import { createHandler as summarizeHandler } from './ported/summarize-url';
import { createHandler as testAIHandler } from './ported/test-ai-connection';
import { createHandler as gyazoUploadHandler } from './ported/gyazo-upload';
import { createHandler as gyazoDeleteHandler } from './ported/gyazo-delete';
import { createHandler as imageSettingsHandler } from './ported/save-image-storage-settings';
import { createHandler as raindropHandler } from './ported/raindrop-sync';
import { createHandler as formatHandler } from './ported/format-entries';
const app = new Hono<{
    Bindings: Env;
    Variables: {
        owner: string;
        browser: boolean;
    };
}>();
const functions = { 'ocr-image': ocrHandler, 'summarize-url': summarizeHandler, 'test-ai-connection': testAIHandler, 'gyazo-upload': gyazoUploadHandler, 'gyazo-delete': gyazoDeleteHandler, 'save-image-storage-settings': imageSettingsHandler, 'raindrop-sync': raindropHandler, 'format-entries': formatHandler };
const publicOAuth = (path: string) => ['/mcp/oauth/token', '/mcp/oauth/register', '/mcp/oauth/authorize'].includes(path) || path.startsWith('/.well-known/') || path.startsWith('/mcp/.well-known/');
const machinePath = (path: string) => ['/api/docs','/api/openapi.json','/api/health'].includes(path) || path === '/mcp' || path.startsWith('/mcp/') || path.startsWith('/media/block-images/') || /^\/api\/(events|tasks|schedules|memos|read-later|search|entries|blocks|capture|capture-image|image-reference-migrations)(\/|$)/.test(path);
const csp = "default-src 'self'; img-src 'self' https: data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'";
app.use('*', async (c, next) => {
    if (!['staging', 'production'].includes(c.env.ENVIRONMENT) || new URL(c.req.url).origin !== c.env.APP_ORIGIN)
        return c.json({ error: 'Invalid application environment' }, 503);
    const bearer = c.req.header('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
    let tokenOwner = false;
    if (bearer && bearer !== 'cookie-session' && machinePath(c.req.path)) {
        const hash = await sha256(bearer);
        const token = await c.env.DB.prepare('SELECT id,user_id FROM user_api_tokens WHERE token_hash=? AND user_id=?').bind(hash, c.env.OWNER_ID).first<{
            id: string;
            user_id: string;
        }>();
        if (token) {
            tokenOwner = true;
            c.set('owner', token.user_id);
            c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE user_api_tokens SET last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND user_id=?").bind(token.id, token.user_id).run());
        }
    }
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method);
    // Cookie routes require same-origin; authenticated machine APIs and the PKCE
    // exchange work without browser Origin. No global CSRF bypass for Bearer text.
    const statelessMachine=machinePath(c.req.path)&&!c.req.header('Cookie');
    if (unsafe && !tokenOwner && !publicOAuth(c.req.path) && !statelessMachine && c.req.header('Origin') !== c.env.APP_ORIGIN)
        return c.json({ error: 'Origin rejected' }, 403);
    await next();
    c.res = new Response(c.res.body, c.res);
    for (const [key, value] of Object.entries({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Content-Security-Policy': csp }))
        c.header(key, value);
    // Browser responses never grant cross-site credentials; machine OAuth/MCP
    // can retain the original public protocol's CORS headers.
    if (!machinePath(c.req.path) && !publicOAuth(c.req.path))
        c.res.headers.delete('Access-Control-Allow-Origin');
    if(c.req.path==='/mcp'||c.req.path.startsWith('/mcp/'))c.header('Access-Control-Expose-Headers','Mcp-Session-Id, WWW-Authenticate, Link');
    if (unsafe && c.get('owner'))
        c.executionCtx.waitUntil(dispatchDiary(c.env));
});
// Public protocol preflights and challenges carry no owner data. Cookie-only
// browser APIs do not inherit this stateless machine API CORS policy.
app.options('/api/*',c=>machinePath(c.req.path)?restHandler(c.env,null,c.executionCtx)(c.req.raw):c.json({error:'Browser API does not allow cross-origin requests'},403));
const machinePreflight=()=>new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type, mcp-session-id, mcp-protocol-version, idempotency-key'}});
app.options('/mcp',machinePreflight);
app.options('/mcp/*',machinePreflight);
app.options('/media/block-images/*',machinePreflight);
app.get('/api/health', c => c.json({ environment: c.env.ENVIRONMENT, backend: 'cloudflare', functions: 11, externalWrites: c.env.EXTERNAL_WRITES_ENABLED === 'true', diary: 'protected-new-records-or-allowlist' }));
app.get('/api/docs', c => restHandler(c.env, null, c.executionCtx)(c.req.raw));
app.get('/api/openapi.json', c => restHandler(c.env, null, c.executionCtx)(c.req.raw));
app.get('/mcp/health', c => mcpHandler(c.env, null, c.executionCtx)(c.req.raw));
app.get('/api/auth-options', c => c.json({ google: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET) }));
app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
    const permitted = ['/api/auth/sign-in/email', '/api/auth/sign-out', '/api/auth/get-session', '/api/auth/reset-password'];
    if (c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET)
        permitted.push('/api/auth/sign-in/social', '/api/auth/callback/google');
    if (c.req.path === '/api/auth/sign-in/social' && (await c.req.raw.clone().json() as {
        provider?: string;
    }).provider !== 'google')
        return c.json({ error: 'Only Google is allowed' }, 403);
    if (!permitted.includes(c.req.path))
        return c.json({ error: 'Registration, anonymous auth and email delivery are disabled' }, 403);
    if (c.req.path === '/api/auth/sign-in/email') {
        const payload = await c.req.raw.clone().json() as {
            email?: string;
        };
        if (payload.email?.toLowerCase() !== c.env.OWNER_EMAIL.toLowerCase())
            return c.json({ error: 'Invalid login credentials' }, 401);
    }
    return authFor(c.env).handler(c.req.raw);
});
app.all('/.well-known/*', c => mcpHandler(c.env, null, c.executionCtx)(c.req.raw));
app.all('/mcp/*', async (c, next) => { if (publicOAuth(c.req.path))
    return mcpHandler(c.env, null, c.executionCtx)(c.req.raw); return next(); });
// Production can preserve the former unlisted public-image URL contract.
// The bucket, listings, diary data and every mutation remain authenticated.
app.use('/media/block-images/*', async (c,next) => {
    if(c.env.ENVIRONMENT!=='production'||c.env.PUBLIC_IMAGE_DELIVERY!=='true'||!['GET','HEAD'].includes(c.req.method))return next();
    const key=decodeURIComponent(c.req.path.slice('/media/block-images/'.length));
    if(!key.startsWith(c.env.OWNER_ID+'/')||!/^[-_a-f0-9]+\.(jpg|png|webp|gif|avif)$/.test(key.slice(c.env.OWNER_ID.length+1)))return next();
    const object=c.req.method==='HEAD'?await c.env.IMAGES.head(key):await c.env.IMAGES.get(key);
    if(!object||!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(object.httpMetadata?.contentType||''))return c.json({error:'Not found'},404);
    c.header('Content-Type',object.httpMetadata!.contentType!);
    c.header('Content-Length',String(object.size));
    c.header('ETag',object.httpEtag);
    c.header('Access-Control-Allow-Origin','*');
    return c.req.method==='HEAD'?c.body(null):c.body((object as R2ObjectBody).body);
});
app.use('*', async (c, next) => {
    const { response: session, headers } = await authFor(c.env).api.getSession({
        headers: c.req.raw.headers,
        returnHeaders: true,
    });
    if (session?.user.id === c.env.OWNER_ID && session.user.email.toLowerCase() === c.env.OWNER_EMAIL.toLowerCase()) {
        c.set('owner', c.env.OWNER_ID);
        c.set('browser', true);
        await next();
        for (const cookie of headers.getSetCookie()) c.header('Set-Cookie', cookie, { append: true });
        return;
    }
    if (c.get('owner'))
        return next();
    if (c.req.path === '/api/session')
        return c.json({ user: null });
    if (c.req.path.startsWith('/assets/') || ['/', '/auth', '/favicon.ico', '/favicon.png'].includes(c.req.path))
        return c.env.ASSETS.fetch(c.req.raw);
    if(c.req.path==='/mcp'||c.req.path.startsWith('/mcp/'))return mcpHandler(c.env,null,c.executionCtx)(c.req.raw);
    if(machinePath(c.req.path)&&c.req.path.startsWith('/api/'))return restHandler(c.env,null,c.executionCtx)(c.req.raw);
    if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/media/') || c.req.path.startsWith('/mcp'))
        return c.json({ error: 'Authentication required' }, 401);
    return c.redirect('/auth?redirect=' + encodeURIComponent(c.env.APP_ORIGIN + c.req.path + c.req.url.slice(c.req.url.indexOf('?') >= 0 ? c.req.url.indexOf('?') : c.req.url.length)));
});
app.get('/api/session', c => c.json({ user: { id: c.get('owner'), email: c.env.OWNER_EMAIL } }));
app.use('/api/data/*', async (c, next) => c.get('browser') ? next() : c.json({ error: 'Browser session required' }, 403));
app.use('/api/rpc/*', async (c, next) => c.get('browser') ? next() : c.json({ error: 'Browser session required' }, 403));
app.use('/api/functions/*', async (c, next) => c.get('browser') ? next() : c.json({ error: 'Browser session required' }, 403));
app.route('/api', browserData);
app.post('/api/rpc/:name', async (c) => {
    const permitted = ['set_block_timing', 'diary_generation_status', 'request_diary_generation', 'get_user_ai_api_keys_safe', 'get_user_ai_models_safe', 'get_user_ai_settings_safe', 'get_user_image_storage_settings_safe','diary_generation_history','restore_diary_generation'];
    if (!permitted.includes(c.req.param('name')))
        return c.json({ error: 'Unknown browser operation' }, 404);
    const result = await callRpc(c.env, c.get('owner'), c.req.param('name'), await c.req.json());
    return c.json({ ...result, data: stripSecrets(result.data) }, result.error ? 400 : 200);
});
function authenticatedRequest(request: Request) {
    const headers = new Headers(request.headers);
    headers.set('Authorization', 'Bearer cookie-session');
    return new Request(request, { headers });
}
app.post('/api/functions/:name', c => {
    const factory = functions[c.req.param('name') as keyof typeof functions];
    if (!factory)
        return c.json({ error: 'Unknown function' }, 404);
    return factory(c.env, c.get('owner'), c.executionCtx)(authenticatedRequest(c.req.raw));
});
app.post('/api/mcp/oauth/create-code', c => mcpHandler(c.env, c.get('owner'), c.executionCtx)(authenticatedRequest(c.req.raw)));
app.all('/mcp', c => mcpHandler(c.env, c.get('owner'), c.executionCtx)(c.req.raw));
app.all('/mcp/*', c => mcpHandler(c.env, c.get('owner'), c.executionCtx)(c.req.raw));
app.get('/media/block-images/*', async (c) => {
    const key = decodeURIComponent(c.req.path.slice('/media/block-images/'.length));
    if (!key.startsWith(`${c.get('owner')}/`) || key.includes('..'))
        return c.json({ error: 'Not found' }, 404);
    const object = await c.env.IMAGES.get(key);
    if (!object)
        return c.json({ error: 'Not found' }, 404);
    c.header('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    c.header('Access-Control-Allow-Origin','*');
    return c.body(object.body);
});
app.post('/api/images', async (c) => {
    const data = await c.req.parseBody();
    const file = data.file;
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(file.type))
        return c.json({ error: 'Unsupported image' }, 400);
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[file.type];
    const key = `${c.get('owner')}/${crypto.randomUUID()}.${ext}`;
    await c.env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    return c.json({ path: key });
});
app.post('/api/images/delete', async (c) => {
    const { paths } = await c.req.json<{
        paths: string[];
    }>();
    if (!Array.isArray(paths) || paths.length > 100 || !paths.every(p => p.startsWith(`${c.get('owner')}/`) && !p.includes('..')))
        return c.json({ error: 'Invalid image paths' }, 400);
    await c.env.IMAGES.delete(paths);
    return c.json({ success: true });
});
app.all('/api/*', c => restHandler(c.env, c.get('owner'), c.executionCtx)(c.req.raw));
app.get('*', c => c.env.ASSETS.fetch(c.req.raw));
app.onError((_err, c) => c.json({ error: 'The isolated operation failed' }, 400));
export { app };
export default {
    fetch: app.fetch,
    scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => ctx.waitUntil(dispatchDiary(env)),
    queue: (batch: MessageBatch<{
        owner: string;
        date: string;
    }>, env: Env) => consumeDiary(batch, env),
};
