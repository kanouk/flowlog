// Ported from supabase/functions/save-image-storage-settings/index.ts; source behaviour retained except documented runtime/security adaptations.
import type { Env } from '../../auth';
import { createServerClient } from '../../database';
import { guardedFetch } from '../../outbound';
import { corsHeaders } from "../_shared/cors.ts";
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
    type ImageStorageProvider = "default" | "gyazo";
    interface SaveImageStorageSettingsBody {
        provider?: unknown;
        gyazo_token?: unknown;
        clear_gyazo_token?: unknown;
    }
    function jsonResponse(body: Record<string, unknown>, status = 200) {
        return new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    function isProvider(value: unknown): value is ImageStorageProvider {
        return value === "default" || value === "gyazo";
    }
    return async (req: Request) => {
        if (req.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }
        if (req.method !== "POST") {
            return jsonResponse({ error: "Method not allowed" }, 405);
        }
        try {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) {
                return jsonResponse({ error: "ログインが必要です" }, 401);
            }
            const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
            const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
            const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) {
                return jsonResponse({ error: "ログインが必要です" }, 401);
            }
            const body = await req.json<LegacyJSON>().catch(() => ({})) as SaveImageStorageSettingsBody;
            if (!isProvider(body.provider)) {
                return jsonResponse({ error: "画像保存先の指定が不正です" }, 400);
            }
            const provider = body.provider;
            const gyazoToken = typeof body.gyazo_token === "string" ? body.gyazo_token.trim() : "";
            const clearGyazoToken = body.clear_gyazo_token === true;
            const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const { data: existing, error: existingError } = await serviceClient
                .from("user_image_storage_settings")
                .select("user_id, gyazo_token")
                .eq("user_id", user.id)
                .maybeSingle();
            if (existingError) {
                console.error("Image storage setting fetch error:", existingError);
                return jsonResponse({ error: "画像保存先設定の確認に失敗しました" }, 500);
            }
            const hasExistingGyazoToken = !!existing?.gyazo_token;
            if (provider === "gyazo" && !gyazoToken && !hasExistingGyazoToken) {
                return jsonResponse({ error: "Gyazo API token を入力してください" }, 422);
            }
            const payload: Record<string, unknown> = {
                user_id: user.id,
                provider,
            };
            if (clearGyazoToken) {
                payload.gyazo_token = null;
            }
            else if (gyazoToken) {
                payload.gyazo_token = gyazoToken;
            }
            const { error: upsertError } = await serviceClient
                .from("user_image_storage_settings")
                .upsert(payload, { onConflict: "user_id" });
            if (upsertError) {
                console.error("Image storage setting save error:", upsertError);
                return jsonResponse({ error: "画像保存先設定の保存に失敗しました" }, 500);
            }
            return jsonResponse({ success: true });
        }
        catch (error) {
            console.error("save-image-storage-settings error:", error);
            return jsonResponse({ error: "画像保存先設定の保存中にエラーが発生しました" }, 500);
        }
    };
}
