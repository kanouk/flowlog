import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseISO } from "npm:date-fns@3";
import { formatInTimeZone, fromZonedTime } from "npm:date-fns-tz@3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIMEZONE = 'Asia/Tokyo';

interface Block {
  id: string;
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
  // Score feature
  score_enabled: boolean;
  behavior_rules: string | null;
}

interface TimeInferenceResult {
  block_id: string;
  inferred_time: string | null;
  confidence: 'high' | 'medium' | 'none';
  reason?: string;
  question?: string;
}

interface TimeUpdate {
  block_id: string;
  old_time: string;
  new_time: string;
  reason: string;
}

interface TimeQuestion {
  block_id: string;
  content_preview: string;
  question: string;
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

// AI呼び出しの共通ラッパー
async function callAI(
  provider: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  aiSettings: AISettings | null
): Promise<string> {
  switch (provider) {
    case 'openai':
      if (!aiSettings?.openai_api_key) {
        throw new Error('OpenAI APIキーが設定されていません');
      }
      return callOpenAI(aiSettings.openai_api_key, model, systemPrompt, userPrompt);
    
    case 'anthropic':
      if (!aiSettings?.anthropic_api_key) {
        throw new Error('Anthropic APIキーが設定されていません');
      }
      return callAnthropic(aiSettings.anthropic_api_key, model, systemPrompt, userPrompt);
    
    case 'google':
      if (!aiSettings?.google_api_key) {
        throw new Error('Google APIキーが設定されていません');
      }
      return callGoogle(aiSettings.google_api_key, model, systemPrompt, userPrompt);
    
    default:
      return callLovableAI(model, systemPrompt, userPrompt);
  }
}

// 時刻推測プロンプト
const TIME_ANALYSIS_PROMPT = `あなたは日記の各ブロックの実際の発生時刻を推測するアシスタントです。

各ブロックの内容を分析し、実際に起きた時刻を推測してください。

## 時間の手がかり例

### 明示的な時刻表現
- 「10時に」「午後3時」「朝8時」→ その時刻
- 「正午に」→ 12:00
- 「深夜に」→ 00:00-02:00

### 食事・生活リズム
- 「朝ごはん」「朝食」→ 07:00-09:00
- 「ランチ」「昼ごはん」「昼食」→ 12:00-13:00
- 「おやつ」「3時のおやつ」→ 15:00
- 「夕食」「夕ごはん」「晩ごはん」→ 18:00-20:00
- 「夜食」→ 22:00-00:00

### 行動パターン
- 「起床」「起きた」「目覚めた」→ 06:00-08:00
- 「出勤」「会社に向かう」→ 08:00-09:00
- 「帰宅」「家に帰った」→ 18:00-20:00
- 「就寝」「寝る」「おやすみ」→ 22:00-00:00

### 相対表現
- 「その後」「それから」→ 前のブロックの30分〜1時間後
- 「さっき」→ 現在より30分前程度

### 時間帯表現
- 「朝」「午前中」→ 08:00-11:00
- 「昼」「お昼」→ 12:00-13:00
- 「午後」→ 14:00-17:00
- 「夕方」→ 17:00-19:00
- 「夜」→ 19:00-23:00

### 深夜時刻表記（非常に重要）
日本語では前日の延長として深夜を表現することがある。これらはその日の最後（23:59）として扱う：

- 「24時」「25時」「26時」「27時」「28時」→ 23:59（その日の終わり）
  - 例: 「25時半に寝た」→ 翌日1:30ではなく、その日の23:59として記録
  - 例: 「26時まで起きてた」→ その日の23:59

- 「深夜1時」「深夜2時」「深夜3時」（就寝文脈）→ 23:59
  - 例: 「深夜2時に寝た」→ その日の23:59
  - 注意: 起床の文脈なら早朝扱い（「深夜2時に目が覚めた」→ 02:00）

- 「明け方」「夜中」「夜更かし」（就寝・活動終了文脈）→ 23:59

### 深夜時刻の判断基準
1. 「寝た」「就寝」「おやすみ」「終わった」「まで起きてた」→ その日の終わりとして23:59
2. 「起きた」「目覚めた」「スタート」「から始めた」→ その日の始まりとして02:00-04:00
3. 文脈から「前日の延長」と判断できる場合 → 23:59

## 出力形式

JSON形式で回答してください：
{
  "results": [
    { 
      "index": 0, 
      "inferred_time": "08:00", 
      "confidence": "high", 
      "reason": "朝ごはんという記述から朝8時頃と推測" 
    },
    { 
      "index": 1, 
      "inferred_time": "14:00", 
      "confidence": "medium", 
      "reason": "その後という記述から前のブロックの後と推測" 
    },
    { 
      "index": 2, 
      "inferred_time": null, 
      "confidence": "none", 
      "question": "これはいつ頃のことですか？" 
    }
  ]
}

## 注意事項
- confidence は "high"（明確な手がかりあり）、"medium"（推測可能）、"none"（手がかりなし）
- confidence が "none" の場合、inferred_time は null、question を設定
- 現在の occurred_at より大幅に異なる推測のみ報告（±30分以内なら変更不要）
- inferred_time は "HH:mm" 形式（例: "08:00", "14:30"）`;

// 時刻をJSTのHH:mm形式のISO文字列に変換
function createOccurredAtFromTime(date: string, timeStr: string): string {
  // date: "2024-01-15", timeStr: "08:30"
  const [hours, minutes] = timeStr.split(':').map(Number);
  const jstDate = new Date(`${date}T${timeStr}:00`);
  // JST時刻をUTCに変換
  const utcDate = fromZonedTime(jstDate, TIMEZONE);
  return utcDate.toISOString();
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

    // Get user's AI settings and supabase client
    const authHeader = req.headers.get('Authorization');
    let aiSettings: AISettings | null = null;
    let supabase: ReturnType<typeof createClient> | null = null;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    if (authHeader) {
      supabase = createClient(supabaseUrl, supabaseAnonKey, {
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

    // ========== Phase 1: 時刻推測 ==========
    console.log('Phase 1: Time inference...');
    
    // 時刻推測用のブロックテキストを生成
    const timeAnalysisInput = blocks.map((block, index) => {
      const currentTime = formatInTimeZone(parseISO(block.occurred_at), TIMEZONE, 'HH:mm');
      return `[${index}] 現在時刻: ${currentTime}, 内容: ${block.content || '(画像のみ)'}`;
    }).join('\n');

    const timeAnalysisPrompt = `以下は${date}のブロックです。各ブロックの実際の発生時刻を推測してください：

${timeAnalysisInput}

JSON形式で回答してください。`;

    let timeUpdates: TimeUpdate[] = [];
    let questions: TimeQuestion[] = [];

    try {
      const timeAnalysisResponse = await callAI(provider, model, TIME_ANALYSIS_PROMPT, timeAnalysisPrompt, aiSettings);
      
      // JSONを抽出
      const jsonMatch = timeAnalysisResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysisResult = JSON.parse(jsonMatch[0]);
        
        if (analysisResult.results && Array.isArray(analysisResult.results)) {
          for (const result of analysisResult.results) {
            const blockIndex = result.index;
            const block = blocks[blockIndex];
            
            if (!block) continue;
            
            if (result.confidence === 'none' && result.question) {
              // 質問が必要
              questions.push({
                block_id: block.id,
                content_preview: (block.content || '').substring(0, 50),
                question: result.question,
              });
            } else if (result.inferred_time && (result.confidence === 'high' || result.confidence === 'medium')) {
              // 時刻を更新
              const currentTime = formatInTimeZone(parseISO(block.occurred_at), TIMEZONE, 'HH:mm');
              
              // 30分以上の差がある場合のみ更新
              const [currentH, currentM] = currentTime.split(':').map(Number);
              const [inferredH, inferredM] = result.inferred_time.split(':').map(Number);
              const currentMinutes = currentH * 60 + currentM;
              const inferredMinutes = inferredH * 60 + inferredM;
              
              if (Math.abs(currentMinutes - inferredMinutes) >= 30) {
                const newOccurredAt = createOccurredAtFromTime(date, result.inferred_time);
                
                // DBを更新
                if (supabase) {
                  // deno-lint-ignore no-explicit-any
                  const { error: updateError } = await (supabase as any)
                    .from('blocks')
                    .update({ occurred_at: newOccurredAt })
                    .eq('id', block.id);
                  
                  if (!updateError) {
                    timeUpdates.push({
                      block_id: block.id,
                      old_time: currentTime,
                      new_time: result.inferred_time,
                      reason: result.reason || '',
                    });
                    // ローカルのブロックも更新
                    block.occurred_at = newOccurredAt;
                  }
                }
              }
            }
          }
        }
      }
    } catch (timeError) {
      console.error('Time inference error:', timeError);
      // 時刻推測に失敗しても日記生成は続行
    }

    console.log('Time updates:', timeUpdates.length);
    console.log('Questions:', questions.length);

    // ========== Phase 2: 日記整形 ==========
    console.log('Phase 2: Formatting diary...');

    // Sort blocks by occurred_at (parseISO使用)
    const sortedBlocks = [...blocks].sort(
      (a, b) => parseISO(a.occurred_at).getTime() - parseISO(b.occurred_at).getTime()
    );

    // Format blocks for the prompt (formatInTimeZone使用)
    // Use structured photo markers with block ID for reliable frontend mapping
    const blocksText = sortedBlocks.map((block) => {
      const time = formatInTimeZone(parseISO(block.occurred_at), TIMEZONE, 'HH:mm');
      const categoryLabel = block.category ? `[${getCategoryLabel(block.category)}]` : '';
      const doneNote = block.is_done ? '[✓]' : '';
      const imageNote = block.images && block.images.length > 0 
        ? ` {{PHOTO:${block.id}:${block.images.length}}}` 
        : '';
      const content = block.content || '';
      return `[${time}] ${categoryLabel}${doneNote}${imageNote} ${content}`.trim();
    }).join('\n');

    const DEFAULT_SYSTEM_PROMPT = `あなたは日記を整形するアシスタントです。ユーザーが一日の中で記録した「出来事」を、読みやすい日記形式に整形してください。

以下のルールに従ってください：
1. 時系列順に並べ替える（入力は既にソート済み）
2. 口語体を自然な文章に軽く整形する（過剰な文学表現は避ける）
3. 時間帯ごとにセクション分けする：
   - 朝（5:00-10:59）
   - 昼（11:00-14:59）
   - 夕方（15:00-17:59）
   - 夜（18:00-4:59）
4. 各セクションは「## 朝」のようなMarkdown見出しで始める
5. 具体的な出来事に紐付かない「思ったこと」「感じたこと」「気づき」「内省」がある場合は
   「## 思ったこと」セクションにまとめる
   - 例: 「最近疲れてる気がする」「なんか調子がいい」「○○について考えた」「ふと○○と感じた」
   - このセクションは時間帯セクションの後、3行まとめの前に配置
   - 該当する内容がない場合は、このセクションは出力しない
6. 最後に「## 今日の3行まとめ」を追加し、その日の要点を3行でまとめる
7. 元の内容の意味を変えないこと
8. 日本語で出力すること
9. 入力には[出来事]のブロックのみが含まれます。自然な日記文に整形してください
10. 時刻の表記は「12:30に」のような正確な時刻ではなく、自然な表現を使うこと
   - 5:00-8:00 → 「早朝」「朝早く」
   - 8:00-10:00 → 「朝」「午前中」
   - 11:00-13:00 → 「お昼頃」「昼前」
   - 14:00-17:00 → 「午後」「昼過ぎ」
   - 17:00-19:00 → 「夕方」
   - 19:00-22:00 → 「夜」「夜に」
   - 22:00-1:00 → 「深夜」「夜遅く」
11. 具体的な時刻は避け、流れが自然になる表現を使う（例：「その後」「しばらくして」「〜の後」）
12. 写真マーカー {{PHOTO:xxx:N}} は必ずそのまま出力に含めること。形式を変えないこと
    - 例: {{PHOTO:abc123:2}} → そのまま {{PHOTO:abc123:2}} として出力
    - 「(📷)」「（写真あり）」などに置き換えないこと
13. 写真マーカーは文章の中に自然に配置すること（改行して別の行にしない）
    - 良い例: 「ラーメン屋でラーメンを食べた {{PHOTO:abc123:1}}」
    - 良い例: 「いろいろな風景を見た {{PHOTO:def456:3}}」
    - 悪い例: 「ラーメンを食べた\n{{PHOTO:abc123:1}}」（別の行に配置）
    - 写真マーカーはその出来事を説明する文の末尾に配置すること

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
      formattedContent = await callAI(provider, model, systemPrompt, userPrompt, aiSettings);
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

    // ========== Phase 3: スコアリング（損失回避版） ==========
    let score: number | undefined;
    let scoreDetails: string | undefined;

    if (aiSettings?.score_enabled && aiSettings.behavior_rules) {
      console.log('Phase 3: Scoring diary...');
      
      const SCORE_PROMPT = `あなたは行動規範の達成度を評価するアシスタントです。

## 重要な原則
- 基準点は100点です
- ルール違反があれば減点します
- ルールを守れていても加点はしません（100点が最高）
- 日記に言及がないルールは「守れた」と判断し減点しません

## 文脈判断（非常に重要）
- 「昨日」「先日」「前日」「以前」「一昨日」などの過去の出来事は評価対象外です
- 評価対象は「今日」行ったことのみです
- 過去の振り返りや反省は減点しません
- 文脈から明確に今日の行動でないものは無視してください

例：
- 「昨日は25時に寝てしまった」→ 減点しない（昨日の話）
- 「今日は23時に寝た」→ 減点対象
- 「最近夜更かしが多い」→ 減点しない（今日の具体的行動ではない）
- 「昨日遅くまで仕事した疲れで」→ 減点しない（昨日の話）

## 評価方法
各ルールについて：
- 明確に違反している → 減点（違反の程度に応じて -5 〜 -25点）
- 守れている/言及なし → 減点なし

## 出力形式 (JSON)
{
  "score": 85,
  "deductions": [
    { "rule": "22時までに就寝する", "points": -15, "reason": "23時就寝と記載あり" }
  ],
  "summary": "就寝時間以外はよく守れました。明日は早めに寝ましょう。"
}

必ずJSON形式で回答してください。`;

      const scoreUserPrompt = `## 行動規範
${aiSettings.behavior_rules}

## 今日の日記
${formattedContent}

上記の日記を行動規範と照らし合わせて、100点からの減点方式でスコアを算出してください。`;

      try {
        const scoreResponse = await callAI(provider, model, SCORE_PROMPT, scoreUserPrompt, aiSettings);
        
        // JSONを抽出
        const scoreJsonMatch = scoreResponse.match(/\{[\s\S]*\}/);
        if (scoreJsonMatch) {
          const scoreResult = JSON.parse(scoreJsonMatch[0]);
          score = Math.max(0, Math.min(100, scoreResult.score || 100));
          
          // 詳細を構築
          const deductions = scoreResult.deductions || [];
          if (deductions.length > 0) {
            const deductionLines = deductions.map((d: { rule: string; points: number; reason: string }) => 
              `・${d.rule}: ${d.points}点\n  → ${d.reason}`
            ).join('\n');
            scoreDetails = `減点内訳:\n${deductionLines}\n\n💬 ${scoreResult.summary || ''}`;
          } else {
            scoreDetails = scoreResult.summary || 'すべてのルールを守れました！';
          }
          
          console.log('Score calculated:', score);
        }
      } catch (scoreError) {
        console.error('Score calculation error:', scoreError);
        // スコア計算に失敗しても日記は返す
      }
    }

    // レスポンスを構築
    const responseData: {
      formatted_content: string;
      summary: string;
      time_updates?: TimeUpdate[];
      needs_clarification?: boolean;
      questions?: TimeQuestion[];
      score?: number;
      score_details?: string;
    } = {
      formatted_content: formattedContent,
      summary,
    };

    // スコアがあれば追加
    if (score !== undefined) {
      responseData.score = score;
      responseData.score_details = scoreDetails;
    }

    // 時刻更新があれば追加
    if (timeUpdates.length > 0) {
      responseData.time_updates = timeUpdates;
    }

    // 質問があれば追加
    if (questions.length > 0) {
      responseData.needs_clarification = true;
      responseData.questions = questions;
    }

    return new Response(
      JSON.stringify(responseData),
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
