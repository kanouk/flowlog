import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    let gyazoData: { url?: string; [key: string]: unknown } = {};
    try {
      gyazoData = JSON.parse(gyazoText);
    } catch {
      console.error("Gyazo upload non-JSON response:", gyazoResponse.status, gyazoText);
    }

    if (!gyazoResponse.ok || !gyazoData.url) {
      console.error("Gyazo upload error:", gyazoResponse.status, gyazoText);
      return jsonResponse({ error: "Gyazoへのアップロードに失敗しました" }, 502);
    }

    return jsonResponse({ url: gyazoData.url });
  } catch (error) {
    console.error("gyazo-upload error:", error);
    return jsonResponse({ error: "画像アップロード中にエラーが発生しました" }, 500);
  }
});
