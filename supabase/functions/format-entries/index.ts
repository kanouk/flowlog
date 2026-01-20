import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseISO } from "npm:date-fns@3";
import { formatInTimeZone } from "npm:date-fns-tz@3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIMEZONE = 'Asia/Tokyo';

interface Block {
  content: string | null;
  occurred_at: string;
  images?: string[];
  category?: string;
  is_done?: boolean;
}

interface AISettings {
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  google_api_key: string | null;
  selected_provider: string;
  selected_model: string;
  custom_system_prompt: string | null;
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    event: '出来事',
    thought: 'メモ',
    task: 'タスク',
    read_later: 'あとで読む',
  };
  return labels[category] || category;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { blocks, date } = await req.json() as { blocks: Block[]; date: string };
    
    if (!blocks || blocks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No blocks provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's AI settings
    const authHeader = req.headers.get('Authorization');
    let aiSettings: AISettings | null = null;

    if (authHeader) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: settings } = await supabase
          .from('user_ai_settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (settings) {
          aiSettings = settings as AISettings;
        }
      }
    }

    // Default to Lovable AI
    const provider = aiSettings?.selected_provider || 'lovable';
    const model = aiSettings?.selected_model || 'google/gemini-2.5-flash';

    // Sort blocks by occurred_at (parseISO使用)
    const sortedBlocks = [...blocks].sort(
      (a, b) => parseISO(a.occurred_at).getTime() - parseISO(b.occurred_at).getTime()
    );

    // Format blocks for the prompt (formatInTimeZone使用)
    const blocksText = sortedBlocks.map((block) => {
      const time = formatInTimeZone(parseISO(block.occurred_at), TIMEZONE, 'HH:mm');
      const categoryLabel = block.category ? `[${getCategoryLabel(block.category)}]` : '';
      const doneNote = block.is_done ? '[✓]' : '';
      const imageNote = block.images && block.images.length > 0 
        ? ` [📷${block.images.length}枚]` 
        : '';
      const content = block.content || '';
      return `[${time}] ${categoryLabel}${doneNote}${imageNote} ${content}`.trim();
    }).join('\n');

    const DEFAULT_SYSTEM_PROMPT = `あなたは日記を整形するアシスタントです。ユーザーが一日の中で記録した「出来事」を、読みやすい日記形式に整形してください。

以下のルールに従ってください：
1. 時系列順に並べ替える（入力は既にソート済み）
2. 口語体を自然な文章に軽く整形する（過剰な文学表現は避ける）
3. 朝（5:00-10:59）、昼（11:00-14:59）、夕方（15:00-17:59）、夜（18:00-4:59）でセクション分けする
4. 各セクションは「## 朝」のようなMarkdown見出しで始める
5. 最後に「## 今日の3行まとめ」を追加し、その日の要点を3行でまとめる
6. 元の内容の意味を変えないこと
7. 日本語で出力すること
8. 入力には[出来事]のブロックのみが含まれます。自然な日記文に整形してください

出力はMarkdown形式で返してください。`;

    // Use custom prompt if set, otherwise use default
    const systemPrompt = aiSettings?.custom_system_prompt || DEFAULT_SYSTEM_PROMPT;

    const userPrompt = `以下は${date}のログです。整形してください：

${blocksText}`;

    console.log('Calling AI for formatting...');
    console.log('Provider:', provider);
    console.log('Model:', model);
    console.log('Blocks count:', blocks.length);
    console.log('Date:', date);

    let formattedContent: string;

    try {
      switch (provider) {
        case 'openai':
          if (!aiSettings?.openai_api_key) {
            throw new Error('OpenAI APIキーが設定されていません');
          }
          formattedContent = await callOpenAI(aiSettings.openai_api_key, model, systemPrompt, userPrompt);
          break;
        
        case 'anthropic':
          if (!aiSettings?.anthropic_api_key) {
            throw new Error('Anthropic APIキーが設定されていません');
          }
          formattedContent = await callAnthropic(aiSettings.anthropic_api_key, model, systemPrompt, userPrompt);
          break;
        
        case 'google':
          if (!aiSettings?.google_api_key) {
            throw new Error('Google APIキーが設定されていません');
          }
          formattedContent = await callGoogle(aiSettings.google_api_key, model, systemPrompt, userPrompt);
          break;
        
        default:
          // Lovable AI (default)
          formattedContent = await callLovableAI(model, systemPrompt, userPrompt);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'RATE_LIMIT') {
          return new Response(
            JSON.stringify({ error: 'レート制限に達しました。しばらくしてから再試行してください。' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (error.message === 'CREDITS_EXHAUSTED') {
          return new Response(
            JSON.stringify({ error: 'クレジットが不足しています。' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      throw error;
    }

    if (!formattedContent) {
      throw new Error('No content in AI response');
    }

    // Extract summary (last section after "今日の3行まとめ")
    const summaryMatch = formattedContent.match(/##\s*今日の3行まとめ\s*([\s\S]*?)$/);
    const summary = summaryMatch 
      ? summaryMatch[1].trim().split('\n').filter((l: string) => l.trim()).slice(0, 3).join(' ')
      : '';

    console.log('Successfully formatted entries');

    return new Response(
      JSON.stringify({ 
        formatted_content: formattedContent,
        summary 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in format-entries function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
