import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

interface UrlMetadata {
  url: string;
  title: string;
  summary: string;
  fetched_at: string;
  error?: boolean;
  error_message?: string;
}

async function callOpenAI(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

async function callGoogle(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [{
        parts: [{ text: userPrompt }]
      }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google AI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callLovableAI(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY is not configured');
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }
    if (response.status === 402) {
      throw new Error('CREDITS_EXHAUSTED');
    }
    const errorText = await response.text();
    throw new Error(`Lovable AI error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// AI call: feature config > Lovable AI default
async function callAIWithConfig(
  featureConfig: FeatureAIConfig | null,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  // 1. Feature config with assigned model + API key
  if (featureConfig?.provider && featureConfig?.model_name && featureConfig?.api_key) {
    switch (featureConfig.provider) {
      case 'openai':
        return callOpenAI(featureConfig.api_key, featureConfig.model_name, systemPrompt, userPrompt);
      case 'anthropic':
        return callAnthropic(featureConfig.api_key, featureConfig.model_name, systemPrompt, userPrompt);
      case 'google':
        return callGoogle(featureConfig.api_key, featureConfig.model_name, systemPrompt, userPrompt);
    }
  }

  // 2. Lovable AI default
  return callLovableAI('google/gemini-2.5-flash', systemPrompt, userPrompt);
}

// Unsupported domains
const UNSUPPORTED_DOMAINS = [
  'x.com', 'twitter.com', 'instagram.com', 'facebook.com', 'linkedin.com', 'tiktok.com',
];

function isUnsupportedUrl(url: string): { unsupported: boolean; domain?: string } {
  try {
    const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    const hostname = parsedUrl.hostname.replace(/^www\./, '');
    for (const domain of UNSUPPORTED_DOMAINS) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return { unsupported: true, domain };
      }
    }
    return { unsupported: false };
  } catch {
    return { unsupported: false };
  }
}

async function fetchWithFirecrawl(url: string): Promise<{ markdown: string; title: string }> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    throw new Error('Firecrawlコネクタが設定されていません');
  }

  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
    formattedUrl = `https://${formattedUrl}`;
  }

  const { unsupported, domain } = isUnsupportedUrl(formattedUrl);
  if (unsupported) {
    throw new Error(`UNSUPPORTED_SITE:${domain}`);
  }

  console.log('Fetching URL with Firecrawl:', formattedUrl);

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: formattedUrl,
      formats: ['markdown'],
      onlyMainContent: true,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Firecrawl API error:', data);
    if (data.error && data.error.includes('not currently supported')) {
      throw new Error('UNSUPPORTED_SITE:このサイト');
    }
    throw new Error(data.error || `ページの取得に失敗しました (${response.status})`);
  }

  if (!data.success || !data.data) {
    throw new Error('ページの内容を取得できませんでした');
  }

  return {
    markdown: data.data.markdown || '',
    title: data.data.metadata?.title || formattedUrl,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, blockId } = await req.json() as { url: string; blockId: string };

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URLが指定されていません' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!blockId) {
      return new Response(
        JSON.stringify({ success: false, error: 'blockIdが指定されていません' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    if (authHeader) {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: '認証が必要です' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get feature config via direct server-side queries (no RPC)
    let featureConfig: FeatureAIConfig | null = null;
    try {
      const { data: fs } = await serviceClient
        .from('user_ai_feature_settings')
        .select('feature_key, enabled, system_prompt, user_prompt_template, assigned_model_id')
        .eq('user_id', userId)
        .eq('feature_key', 'url_summary')
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
              if (key) featureConfig.api_key = key.api_key;
            }
          }
        }
      }
    } catch { /* ignore */ }

    console.log('Summarizing URL:', url);

    const { markdown, title } = await fetchWithFirecrawl(url);

    if (!markdown || markdown.trim().length === 0) {
      throw new Error('ページの内容が空です');
    }

    const maxContentLength = 8000;
    const truncatedContent = markdown.length > maxContentLength 
      ? markdown.substring(0, maxContentLength) + '\n\n... (以下省略)'
      : markdown;

    const defaultSummarizePrompt = `あなたはウェブページの内容を簡潔にまとめるアシスタントです。
以下のルールに従ってください：
1. ページの主要な内容を日本語で3-5行にまとめる
2. 重要なポイントを簡潔に整理する
3. 専門用語は必要に応じて簡潔に説明を加える
4. 客観的な要約を心がける
5. 箇条書きは使わず、自然な文章でまとめる
6. マークダウン記法は使わず、プレーンテキストで出力する`;

    // System prompt: feature config > default
    const systemPrompt = featureConfig?.system_prompt || defaultSummarizePrompt;

    const userPrompt = `以下のウェブページの内容を要約してください：

タイトル: ${title}

内容:
${truncatedContent}`;

    console.log('Calling AI for summarization...');

    let summary: string;

    try {
      summary = await callAIWithConfig(featureConfig, systemPrompt, userPrompt);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'RATE_LIMIT') {
          return new Response(
            JSON.stringify({ success: false, error: 'レート制限に達しました。しばらくしてから再試行してください。' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (error.message === 'CREDITS_EXHAUSTED') {
          return new Response(
            JSON.stringify({ success: false, error: 'クレジットが不足しています。' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      throw error;
    }

    if (!summary) {
      throw new Error('要約の生成に失敗しました');
    }

    const urlMetadata: UrlMetadata = {
      url,
      title,
      summary: summary.trim(),
      fetched_at: new Date().toISOString(),
    };

    const { error: updateError } = await serviceClient
      .from('blocks')
      .update({ url_metadata: urlMetadata })
      .eq('id', blockId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error updating block:', updateError);
      throw new Error('ブロックの更新に失敗しました');
    }

    console.log('Successfully summarized URL');

    return new Response(
      JSON.stringify({ 
        success: true, 
        url_metadata: urlMetadata 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in summarize-url function:', error);
    
    if (error instanceof Error && error.message.startsWith('UNSUPPORTED_SITE:')) {
      const site = error.message.replace('UNSUPPORTED_SITE:', '');
      const errorMetadata: UrlMetadata = {
        url: '',
        title: '',
        summary: '',
        fetched_at: new Date().toISOString(),
        error: true,
        error_message: `${site}はサマリー取得に対応していません`
      };
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `${site}はサマリー取得に対応していません`,
          code: 'UNSUPPORTED_SITE',
          url_metadata: errorMetadata
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : '要約の生成に失敗しました' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
