// Ported from supabase/functions/gyazo-delete/index.ts; source behaviour retained except documented runtime/security adaptations.
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
    function jsonResponse(body: Record<string, unknown>, status = 200) {
        return new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
    function extractGyazoImageId(url: string): string | null {
        const match = url.match(/^https:\/\/i\.gyazo\.com\/([a-zA-Z0-9]+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
        return match?.[1] ?? null;
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
            const body = await req.json<LegacyJSON>().catch(() => ({}));
            const imageId = typeof body.image_id === "string" && body.image_id.trim()
                ? body.image_id.trim()
                : typeof body.url === "string"
                    ? extractGyazoImageId(body.url)
                    : null;
            if (!imageId) {
                return jsonResponse({ error: "Gyazo画像IDを取得できません" }, 400);
            }
            const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const { data: setting, error: settingError } = await serviceClient
                .from("user_image_storage_settings")
                .select("gyazo_token")
                .eq("user_id", user.id)
                .maybeSingle();
            if (settingError) {
                console.error("Gyazo setting fetch error:", settingError);
                return jsonResponse({ error: "画像保存設定の取得に失敗しました" }, 500);
            }
            if (!setting?.gyazo_token) {
                return jsonResponse({ error: "Gyazo API token が設定されていません" }, 422);
            }
            const gyazoResponse = await fetch(`https://api.gyazo.com/api/images/${encodeURIComponent(imageId)}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${setting.gyazo_token}`,
                },
            });
            const responseText = await gyazoResponse.text();
            if (!gyazoResponse.ok) {
                console.error("Gyazo delete error:", gyazoResponse.status, responseText);
                return jsonResponse({ error: "Gyazo画像の削除に失敗しました" }, 502);
            }
            return jsonResponse({ success: true });
        }
        catch (error) {
            console.error("gyazo-delete error:", error);
            return jsonResponse({ error: "画像削除中にエラーが発生しました" }, 500);
        }
    };
}
