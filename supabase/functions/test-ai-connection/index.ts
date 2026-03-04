import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function testOpenAI(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (response.ok) return { success: true, message: '接続成功！OpenAI APIキーは有効です。' };
    if (response.status === 401) return { success: false, message: 'APIキーが無効です。キーを確認してください。' };
    const errorText = await response.text();
    return { success: false, message: `エラー: ${response.status} - ${errorText}` };
  } catch (error) {
    return { success: false, message: `接続エラー: ${error instanceof Error ? error.message : 'Unknown'}` };
  }
}

async function testAnthropic(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });
    if (response.ok) return { success: true, message: '接続成功！Anthropic APIキーは有効です。' };
    if (response.status === 401) return { success: false, message: 'APIキーが無効です。キーを確認してください。' };
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `ステータス: ${response.status}`;
    return { success: false, message: `エラー: ${errorMessage}` };
  } catch (error) {
    return { success: false, message: `接続エラー: ${error instanceof Error ? error.message : 'Unknown'}` };
  }
}

async function testGoogle(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, { method: 'GET' });
    if (response.ok) return { success: true, message: '接続成功！Google APIキーは有効です。' };
    if (response.status === 400 || response.status === 403) return { success: false, message: 'APIキーが無効か、Generative Language APIが有効になっていません。' };
    const errorText = await response.text();
    return { success: false, message: `エラー: ${response.status} - ${errorText}` };
  } catch (error) {
    return { success: false, message: `接続エラー: ${error instanceof Error ? error.message : 'Unknown'}` };
  }
}

function testProvider(provider: string, apiKey: string) {
  switch (provider) {
    case 'openai': return testOpenAI(apiKey);
    case 'anthropic': return testAnthropic(apiKey);
    case 'google': return testGoogle(apiKey);
    default: return Promise.resolve({ success: false, message: '不明なプロバイダーです。' });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as { provider?: string; api_key?: string; model_id?: string; api_key_id?: string };

    // Mode 1: Direct provider + api_key test
    if (body.provider && body.api_key) {
      const result = await testProvider(body.provider, body.api_key);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Modes 2 & 3 require auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: '認証が必要です。' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, message: '認証に失敗しました。' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Mode 2: Test by api_key_id
    if (body.api_key_id) {
      const { data: keyRecord, error } = await serviceClient
        .from('user_ai_api_keys')
        .select('provider, api_key')
        .eq('id', body.api_key_id)
        .eq('user_id', user.id)
        .single();

      if (error || !keyRecord) {
        return new Response(
          JSON.stringify({ success: false, message: 'APIキーが見つかりません。' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = await testProvider(keyRecord.provider, keyRecord.api_key);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mode 3: Test by model_id (resolve api_key via api_key_id)
    if (body.model_id) {
      const { data: model, error: modelError } = await serviceClient
        .from('user_ai_models')
        .select('provider, api_key_id')
        .eq('id', body.model_id)
        .eq('user_id', user.id)
        .single();

      if (modelError || !model) {
        return new Response(
          JSON.stringify({ success: false, message: 'モデルが見つかりません。' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!model.api_key_id) {
        return new Response(
          JSON.stringify({ success: false, message: 'APIキーが設定されていません。' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: keyRecord, error: keyError } = await serviceClient
        .from('user_ai_api_keys')
        .select('provider, api_key')
        .eq('id', model.api_key_id)
        .single();

      if (keyError || !keyRecord) {
        return new Response(
          JSON.stringify({ success: false, message: 'APIキーが見つかりません。' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = await testProvider(keyRecord.provider, keyRecord.api_key);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ success: false, message: 'provider+api_key、api_key_id、または model_id が必要です。' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in test-ai-connection:', error);
    return new Response(
      JSON.stringify({ success: false, message: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
