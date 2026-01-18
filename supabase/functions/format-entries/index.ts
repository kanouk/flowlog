import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseISO } from "npm:date-fns@3";
import { formatInTimeZone } from "npm:date-fns-tz@3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIMEZONE = 'Asia/Tokyo';

interface Block {
  content: string;
  occurred_at: string;
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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Sort blocks by occurred_at (parseISO使用)
    const sortedBlocks = [...blocks].sort(
      (a, b) => parseISO(a.occurred_at).getTime() - parseISO(b.occurred_at).getTime()
    );

    // Format blocks for the prompt (formatInTimeZone使用)
    const blocksText = sortedBlocks.map((block) => {
      const time = formatInTimeZone(parseISO(block.occurred_at), TIMEZONE, 'HH:mm');
      return `[${time}] ${block.content}`;
    }).join('\n');

    const systemPrompt = `あなたは思考ログを整形するアシスタントです。ユーザーが一日の中で書き留めた短いメモやつぶやきを、読みやすい日記形式に整形してください。

以下のルールに従ってください：
1. 時系列順に並べ替える（入力は既にソート済み）
2. 口語体を自然な文章に軽く整形する（過剰な文学表現は避ける）
3. 朝（5:00-10:59）、昼（11:00-14:59）、夕方（15:00-17:59）、夜（18:00-4:59）でセクション分けする
4. 各セクションは「## 朝」のようなMarkdown見出しで始める
5. 最後に「## 今日の3行まとめ」を追加し、その日の要点を3行でまとめる
6. 元の内容の意味を変えないこと
7. 日本語で出力すること

出力はMarkdown形式で返してください。`;

    const userPrompt = `以下は${date}のログです。整形してください：

${blocksText}`;

    console.log('Calling AI gateway for formatting...');
    console.log('Blocks count:', blocks.length);
    console.log('Date:', date);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'レート制限に達しました。しばらくしてから再試行してください。' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'クレジットが不足しています。' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const formattedContent = data.choices?.[0]?.message?.content;

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
