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
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { success: true, message: '接続成功！OpenAI APIキーは有効です。' };
    } else if (response.status === 401) {
      return { success: false, message: 'APIキーが無効です。キーを確認してください。' };
    } else {
      const errorText = await response.text();
      return { success: false, message: `エラー: ${response.status} - ${errorText}` };
    }
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

    if (response.ok) {
      return { success: true, message: '接続成功！Anthropic APIキーは有効です。' };
    } else if (response.status === 401) {
      return { success: false, message: 'APIキーが無効です。キーを確認してください。' };
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `ステータス: ${response.status}`;
      return { success: false, message: `エラー: ${errorMessage}` };
    }
  } catch (error) {
    return { success: false, message: `接続エラー: ${error instanceof Error ? error.message : 'Unknown'}` };
  }
}

async function testGoogle(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      method: 'GET',
    });

    if (response.ok) {
      return { success: true, message: '接続成功！Google APIキーは有効です。' };
    } else if (response.status === 400 || response.status === 403) {
      return { success: false, message: 'APIキーが無効か、Generative Language APIが有効になっていません。' };
    } else {
      const errorText = await response.text();
      return { success: false, message: `エラー: ${response.status} - ${errorText}` };
    }
  } catch (error) {
    return { success: false, message: `接続エラー: ${error instanceof Error ? error.message : 'Unknown'}` };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as { provider?: string; api_key?: string; model_id?: string };
    
    // Mode 1: Direct provider + api_key test (legacy + dialog test)
    if (body.provider && body.api_key) {
      let result: { success: boolean; message: string };
      switch (body.provider) {
        case 'openai':
          result = await testOpenAI(body.api_key);
          break;
        case 'anthropic':
          result = await testAnthropic(body.api_key);
          break;
        case 'google':
          result = await testGoogle(body.api_key);
          break;
        default:
          result = { success: false, message: '不明なプロバイダーです。' };
      }
      return new Response(
        JSON.stringify(result),
        { status: result.success ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mode 2: Test by registered model_id
    if (body.model_id) {
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

      // Verify user
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

      // Fetch model with service role to get api_key
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: model, error: modelError } = await serviceClient
        .from('user_ai_models')
        .select('provider, model_name, api_key')
        .eq('id', body.model_id)
        .eq('user_id', user.id)
        .single();

      if (modelError || !model) {
        return new Response(
          JSON.stringify({ success: false, message: 'モデルが見つかりません。' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!model.api_key) {
        return new Response(
          JSON.stringify({ success: false, message: 'APIキーが設定されていません。' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let result: { success: boolean; message: string };
      switch (model.provider) {
        case 'openai':
          result = await testOpenAI(model.api_key);
          break;
        case 'anthropic':
          result = await testAnthropic(model.api_key);
          break;
        case 'google':
          result = await testGoogle(model.api_key);
          break;
        default:
          result = { success: false, message: '不明なプロバイダーです。' };
      }

      return new Response(
        JSON.stringify(result),
        { status: result.success ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: 'provider+api_key または model_id が必要です。' }),
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
