// Ported from supabase/functions/gyazo-upload/index.ts; source behaviour retained except documented runtime/security adaptations.
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
            const formData = await req.formData();
            const file = formData.get("image");
            if (!(file instanceof File)) {
                return jsonResponse({ error: "画像ファイルが必要です" }, 400);
            }
            const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const { data: setting, error: settingError } = await serviceClient
                .from("user_image_storage_settings")
                .select("provider, gyazo_token")
                .eq("user_id", user.id)
                .maybeSingle();
            if (settingError) {
                console.error("Gyazo setting fetch error:", settingError);
                return jsonResponse({ error: "画像保存設定の取得に失敗しました" }, 500);
            }
            if (setting?.provider !== "gyazo" || !setting?.gyazo_token) {
                return jsonResponse({ error: "Gyazo API token が設定されていません" }, 422);
            }
            const gyazoForm = new FormData();
            gyazoForm.append("imagedata", file, file.name || "image.png");
            gyazoForm.append("access_policy", "anyone");
            const gyazoResponse = await fetch("https://upload.gyazo.com/api/upload", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${setting.gyazo_token}`,
                },
                body: gyazoForm,
            });
            const gyazoText = await gyazoResponse.text();
            let gyazoData: {
                url?: string;
                [key: string]: unknown;
            } = {};
            try {
                gyazoData = JSON.parse(gyazoText);
            }
            catch {
                console.error("Gyazo upload non-JSON response:", gyazoResponse.status, gyazoText);
            }
            if (!gyazoResponse.ok || !gyazoData.url) {
                console.error("Gyazo upload error:", gyazoResponse.status, gyazoText);
                return jsonResponse({ error: "Gyazoへのアップロードに失敗しました" }, 502);
            }
            return jsonResponse({ url: gyazoData.url });
        }
        catch (error) {
            console.error("gyazo-upload error:", error);
            return jsonResponse({ error: "画像アップロード中にエラーが発生しました" }, 500);
        }
    };
}
