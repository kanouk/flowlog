import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FeatureAIConfig {
  feature_key: string;
  enabled: boolean;
  system_prompt: string | null;
  user_prompt_template: string | null;
  provider: string | null;
  model_name: string | null;
  api_key: string | null;
}

serve(async (req) => {
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

    const { block_id, image_urls } = await req.json();

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

    // Get feature config for OCR
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    let featureConfig: FeatureAIConfig | null = null;
    try {
      const { data } = await serviceClient.rpc('get_feature_ai_config', {
        p_user_id: user.id,
        p_feature_key: 'ocr',
      });
      if (data && (data as unknown[]).length > 0) {
        featureConfig = (data as unknown[])[0] as FeatureAIConfig;
      }
    } catch { /* ignore */ }

    const DEFAULT_OCR_SYSTEM_PROMPT = "あなたは画像からテキストを抽出するOCRアシスタントです。画像内のテキストを正確に読み取り、原文のまま出力してください。レイアウトや改行もできるだけ再現してください。テキストがない画像の場合は、画像の内容を簡潔に日本語で説明してください。";

    const systemPrompt = featureConfig?.system_prompt || DEFAULT_OCR_SYSTEM_PROMPT;

    // Build multimodal content
    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
    for (const url of image_urls) {
      userContent.push({ type: "image_url", image_url: { url } });
    }
    userContent.push({
      type: "text",
      text: image_urls.length > 1
        ? "これらの画像内のテキストを正確に読み取り、そのまま出力してください。複数画像がある場合は順番に出力してください。テキストがない場合は画像の内容を簡潔に説明してください。"
        : "この画像内のテキストを正確に読み取り、そのまま出力してください。テキストがない場合は画像の内容を簡潔に説明してください。",
    });

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

    let aiResponse: Response;

    if (useProvider === 'openai' && useApiKey) {
      aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${useApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: useModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
      });
    } else if (useProvider === 'google' && useApiKey) {
      // Google multimodal - convert to Gemini format
      const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
      for (const url of image_urls) {
        parts.push({ text: `[画像URL: ${url}]` });
      }
      parts.push({ text: userContent[userContent.length - 1].text! });
      
      aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${useApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts }],
        }),
      });
    } else {
      // Lovable AI (default)
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
      }
      aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: useModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
      });
    }

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

    const aiData = await aiResponse.json();
    let extractedText = '';
    
    if (useProvider === 'google' && useApiKey) {
      extractedText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
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
  } catch (e) {
    console.error("ocr-image error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
