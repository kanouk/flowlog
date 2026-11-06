// Ported from supabase/functions/ocr-image/index.ts; source behaviour retained except documented runtime/security adaptations.
import type { Env } from '../../auth';
import { createServerClient } from '../../database';
import { guardedFetch } from '../../outbound';
import { streamOCRRequest } from '../../ocr-images';
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
    interface FeatureAIConfig {
        feature_key: string;
        enabled: boolean;
        system_prompt: string | null;
        user_prompt_template: string | null;
        provider: string | null;
        model_name: string | null;
        api_key: string | null;
    }
    return async (req: Request) => {
        if (req.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }
        try {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) {
                return new Response(JSON.stringify({ error: "Authorization required" }), {
                    status: 401,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
            const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
            const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
            // Verify user
            const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) {
                return new Response(JSON.stringify({ error: "Unauthorized" }), {
                    status: 401,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            const { block_id, image_urls } = await req.json<LegacyJSON>();
            if (!block_id || !image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
                return new Response(JSON.stringify({ error: "block_id and image_urls are required" }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            // Verify block ownership
            const { data: block, error: blockError } = await supabase
                .from("blocks")
                .select("id, user_id")
                .eq("id", block_id)
                .eq("user_id", user.id)
                .single();
            if (blockError || !block) {
                return new Response(JSON.stringify({ error: "Block not found or access denied" }), {
                    status: 404,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            // Get feature config via direct server-side queries (no RPC)
            const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            let featureConfig: FeatureAIConfig | null = null;
            try {
                const { data: fs } = await serviceClient
                    .from('user_ai_feature_settings')
                    .select('feature_key, enabled, system_prompt, user_prompt_template, assigned_model_id')
                    .eq('user_id', user.id)
                    .eq('feature_key', 'ocr')
                    .single();
                if (fs) {
                    featureConfig = {
                        feature_key: fs.feature_key,
                        enabled: fs.enabled,
                        system_prompt: fs.system_prompt,
                        user_prompt_template: fs.user_prompt_template,
                        provider: null,
                        model_name: null,
                        api_key: null,
                    };
                    if (fs.assigned_model_id) {
                        const { data: model } = await serviceClient
                            .from('user_ai_models')
                            .select('provider, model_name, api_key_id')
                            .eq('id', fs.assigned_model_id)
                            .eq('is_active', true)
                            .single();
                        if (model) {
                            featureConfig.provider = model.provider;
                            featureConfig.model_name = model.model_name;
                            if (model.api_key_id) {
                                const { data: key } = await serviceClient
                                    .from('user_ai_api_keys')
                                    .select('api_key')
                                    .eq('id', model.api_key_id)
                                    .single();
                                if (key)
                                    featureConfig.api_key = key.api_key;
                            }
                        }
                    }
                }
            }
            catch { /* ignore */ }
            const DEFAULT_OCR_SYSTEM_PROMPT = "あなたは画像からテキストを抽出するOCRアシスタントです。画像内のテキストを正確に読み取り、原文のまま出力してください。レイアウトや改行もできるだけ再現してください。テキストがない画像の場合は、画像の内容を簡潔に日本語で説明してください。";
            const systemPrompt = featureConfig?.system_prompt || DEFAULT_OCR_SYSTEM_PROMPT;
            // Build multimodal content
            if (featureConfig?.enabled === false)
                throw new Error('OCRは無効です');
            const imagePrompt = image_urls.length > 1
                ? "これらの画像内のテキストを正確に読み取り、そのまま出力してください。複数画像がある場合は順番に出力してください。テキストがない場合は画像の内容を簡潔に説明してください。"
                : "この画像内のテキストを正確に読み取り、そのまま出力してください。テキストがない場合は画像の内容を簡潔に説明してください。";
            // Determine which provider/model/key to use
            let useProvider = 'lovable';
            let useModel = 'google/gemini-2.5-flash';
            let useApiKey: string | null = null;
            // Feature config with assigned model + API key
            if (featureConfig?.provider && featureConfig?.model_name && featureConfig?.api_key) {
                useProvider = featureConfig.provider;
                useModel = featureConfig.model_name;
                useApiKey = featureConfig.api_key;
            }
            // Default: Lovable AI
            const aiResponse = await streamOCRRequest(env, user.id, useProvider, useModel, useApiKey, systemPrompt, imagePrompt, image_urls, fetch);
            if (!aiResponse.ok) {
                if (aiResponse.status === 429) {
                    return new Response(JSON.stringify({ error: "レート制限に達しました。しばらく待ってから再試行してください。" }), {
                        status: 429,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }
                if (aiResponse.status === 402) {
                    return new Response(JSON.stringify({ error: "AI利用のクレジットが不足しています。" }), {
                        status: 402,
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                }
                const errorText = await aiResponse.text();
                console.error("AI error:", aiResponse.status, errorText);
                throw new Error(`AI error: ${aiResponse.status}`);
            }
            const aiData = await aiResponse.json<LegacyJSON>();
            let extractedText = '';
            if (useProvider === 'anthropic') {
                extractedText = (aiData.content || []).filter((part: {
                    type: string;
                }) => part.type === 'text').map((part: {
                    text: string;
                }) => part.text).join('');
            }
            else if (useProvider === 'google' && useApiKey) {
                extractedText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            }
            else {
                extractedText = aiData.choices?.[0]?.message?.content || '';
            }
            // Save to database
            const { error: updateError } = await serviceClient
                .from("blocks")
                .update({ extracted_text: extractedText })
                .eq("id", block_id);
            if (updateError) {
                console.error("Error saving extracted text:", updateError);
                throw new Error("Failed to save extracted text");
            }
            return new Response(JSON.stringify({ extracted_text: extractedText }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
        catch (e) {
            console.error("ocr-image error:", e);
            return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
    };
}
