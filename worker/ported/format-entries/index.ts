// Ported from supabase/functions/format-entries/index.ts; source behaviour retained except documented runtime/security adaptations.
import type { Env } from '../../auth';
import { createServerClient } from '../../database';
import { guardedFetch } from '../../outbound';
import { legacyFormatHandler } from "./legacy-handler.ts";
// Explicit boundary type retains the original Deno JSON contracts. Request validation remains in each handler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LegacyJSON = any;
export function createHandler(env: Env, actor: string | null, ctx: Pick<ExecutionContext, 'waitUntil'>, delegate: typeof globalThis.fetch = globalThis.fetch) {
    const fetch = guardedFetch(env, delegate);
    const runtime: Record<string, string | undefined> = { ...env as unknown as Record<string, string>, SUPABASE_URL: env.APP_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: 'worker-owner', SUPABASE_ANON_KEY: 'worker-owner', FLOWLOG_APP_URL: env.APP_ORIGIN, SITE_URL: env.APP_ORIGIN, SUPABASE_SITE_URL: env.APP_ORIGIN, LOVABLE_API_KEY: undefined };
    const Deno = { env: { get: (key: string) => runtime[key] } };
    const createClient = (..._args: unknown[]) => createServerClient(env, env.OWNER_ID, actor);
    const waitUntil = (promise: PromiseLike<unknown>) => ctx.waitUntil(Promise.resolve(promise));
    const console = { log: (..._args: unknown[]) => { }, warn: (..._args: unknown[]) => { }, error: (..._args: unknown[]) => { } };
    return legacyFormatHandler;
}
