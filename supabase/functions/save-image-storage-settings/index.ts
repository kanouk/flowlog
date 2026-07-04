import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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

serve(async (req) => {
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

    const body = await req.json().catch(() => ({})) as SaveImageStorageSettingsBody;
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
    } else if (gyazoToken) {
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
  } catch (error) {
    console.error("save-image-storage-settings error:", error);
    return jsonResponse({ error: "画像保存先設定の保存中にエラーが発生しました" }, 500);
  }
});
