import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseISO } from "npm:date-fns@3";
import { formatInTimeZone, fromZonedTime } from "npm:date-fns-tz@3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIMEZONE = 'Asia/Tokyo';

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface AIResult {
  text: string;
  usage: TokenUsage | null;
}

interface Block {
  id: string;
  content: string | null;
  occurred_at: string;
  images?: string[];
  category?: string;
  is_done?: boolean;
  done_at?: string | null;
  due_at?: string | null;
  due_all_day?: boolean | null;
}

interface FeatureAIConfig {
  feature_key: string;
  enabled: boolean;
  system_prompt: string | null;
  user_prompt_template: string | null;
  provider: string | null;
  model_name: string | null;
  api_key: string | null;
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
    read_later: 'あとで',
  };
  return labels[category] || category;
}

// ========== 生活日基準ヘルパー関数 ==========

/**
 * occurred_at (ISO) → 生活日基準の時刻表示
 * dbh=5 のとき 03:00 → "27:00", 04:59 → "28:59"
 * dbh=0 のときは通常の HH:mm
 */
function formatTimeWithBoundary(occurredAt: string, dayBoundaryHour: number): string {
  const hour = Number(formatInTimeZone(parseISO(occurredAt), TIMEZONE, 'H'));
  const minute = formatInTimeZone(parseISO(occurredAt), TIMEZONE, 'mm');
  if (dayBoundaryHour > 0 && hour < dayBoundaryHour) {
    return `${24 + hour}:${minute}`;
  }
  return formatInTimeZone(parseISO(occurredAt), TIMEZONE, 'HH:mm');
}

/**
 * 生活日基準の時間帯バケットを返す
 * dbh未満の時刻は「夜」として扱う
 */
function getTimeBucketWithBoundary(occurredAt: string, dayBoundaryHour: number): '朝' | '昼' | '夕方' | '夜' {
  const hour = Number(formatInTimeZone(parseISO(occurredAt), TIMEZONE, 'H'));
  if (dayBoundaryHour > 0 && hour < dayBoundaryHour) {
    return '夜'; // dbh未満は前日の夜の延長
  }
  if (hour >= 5 && hour <= 10) return '朝';
  if (hour >= 11 && hour <= 14) return '昼';
  if (hour >= 15 && hour <= 17) return '夕方';
  return '夜';
}

/**
 * プロンプト用の生活日説明テキストを生成
 */
function buildDayBoundaryContext(dayBoundaryHour: number): string {
  if (dayBoundaryHour === 0) return '';
  const endHour = dayBoundaryHour - 1;
  return `
【生活日の区切り】
- この日記の「1日」は ${String(dayBoundaryHour).padStart(2, '0')}:00 に始まり、翌日の ${String(endHour).padStart(2, '0')}:59 に終わります。
- 0:00〜${String(endHour).padStart(2, '0')}:59 は前日の続き（深夜〜明け方）として扱います。
- 例: 1:30 は前日の生活日における 25:30 に相当します。
- 深夜帯のブロックはその生活日の「夜」セクションに含めてください。
`;
}

/**
 * 時刻推測プロンプトを動的生成
 */
function buildTimeAnalysisPrompt(dayBoundaryHour: number): string {
  const boundaryContext = dayBoundaryHour > 0 ? `
### 生活日の区切りについて（重要）
${buildDayBoundaryContext(dayBoundaryHour)}
- 深夜の出来事（0:00〜${String(dayBoundaryHour - 1).padStart(2, '0')}:59）は「この生活日の夜の延長」として扱ってください。
- 推測時刻は実時刻の HH:mm で返してください（例: 深夜1時半なら "01:30"）。
- 「25時に寝た」は "01:00" として返してください（翌calendar dayの実時刻）。
` : `
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
`;

  return `あなたは日記の各ブロックの実際の発生時刻を推測するアシスタントです。

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
${boundaryContext}
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
}

async function callOpenAI(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<AIResult> {
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
  const usage: TokenUsage | null = data.usage ? {
    prompt_tokens: data.usage.prompt_tokens || 0,
    completion_tokens: data.usage.completion_tokens || 0,
    total_tokens: data.usage.total_tokens || 0,
  } : null;
  return { text: data.choices?.[0]?.message?.content || '', usage };
}

async function callAnthropic(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<AIResult> {
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
  const usage: TokenUsage | null = data.usage ? {
    prompt_tokens: data.usage.input_tokens || 0,
    completion_tokens: data.usage.output_tokens || 0,
    total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
  } : null;
  return { text: data.content?.[0]?.text || '', usage };
}

async function callGoogle(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<AIResult> {
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
  const meta = data.usageMetadata;
  const usage: TokenUsage | null = meta ? {
    prompt_tokens: meta.promptTokenCount || 0,
    completion_tokens: meta.candidatesTokenCount || 0,
    total_tokens: meta.totalTokenCount || 0,
  } : null;
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '', usage };
}

async function callLovableAI(model: string, systemPrompt: string, userPrompt: string): Promise<AIResult> {
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
  const usage: TokenUsage | null = data.usage ? {
    prompt_tokens: data.usage.prompt_tokens || 0,
    completion_tokens: data.usage.completion_tokens || 0,
    total_tokens: data.usage.total_tokens || 0,
  } : null;
  return { text: data.choices?.[0]?.message?.content || '', usage };
}

// AI呼び出し - feature config or Lovable AI default
async function callAIWithConfig(
  featureConfig: FeatureAIConfig | null,
  systemPrompt: string,
  userPrompt: string,
): Promise<AIResult> {
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

// Fetch feature AI config via direct server-side queries (no RPC, no key exposure)
async function getFeatureConfig(
  serviceClient: any,
  userId: string,
  featureKey: string,
): Promise<FeatureAIConfig | null> {
  try {
    // 1. Get feature settings
    const { data: fs, error: fsError } = await serviceClient
      .from('user_ai_feature_settings')
      .select('feature_key, enabled, system_prompt, user_prompt_template, assigned_model_id')
      .eq('user_id', userId)
      .eq('feature_key', featureKey)
      .single();
    if (fsError || !fs) return null;

    const config: FeatureAIConfig = {
      feature_key: fs.feature_key,
      enabled: fs.enabled,
      system_prompt: fs.system_prompt,
      user_prompt_template: fs.user_prompt_template,
      provider: null,
      model_name: null,
      api_key: null,
    };

    // 2. Get assigned model
    if (fs.assigned_model_id) {
      const { data: model } = await serviceClient
        .from('user_ai_models')
        .select('provider, model_name, api_key_id')
        .eq('id', fs.assigned_model_id)
        .eq('is_active', true)
        .single();
      if (model) {
        config.provider = model.provider;
        config.model_name = model.model_name;

        // 3. Get API key (server-side only, never returned to client)
        if (model.api_key_id) {
          const { data: key } = await serviceClient
            .from('user_ai_api_keys')
            .select('api_key')
            .eq('id', model.api_key_id)
            .single();
          if (key) {
            config.api_key = key.api_key;
          }
        }
      }
    }

    return config;
  } catch {
    return null;
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

// 時刻をJSTのHH:mm形式のISO文字列に変換（dayBoundaryHour対応）
function createOccurredAtFromTime(date: string, timeStr: string, dayBoundaryHour: number = 0): string {
  const [hours] = timeStr.split(':').map(Number);
  // dbh > 0 かつ推測時刻が dbh 未満 → 翌calendar dayの時刻
  if (dayBoundaryHour > 0 && hours < dayBoundaryHour) {
    const baseDate = new Date(`${date}T00:00:00Z`);
    baseDate.setUTCDate(baseDate.getUTCDate() + 1);
    const nextDateStr = baseDate.toISOString().split('T')[0];
    return fromZonedTime(`${nextDateStr}T${timeStr}:00`, TIMEZONE).toISOString();
  }
  return fromZonedTime(`${date}T${timeStr}:00`, TIMEZONE).toISOString();
}

function normalizeDiaryMarkdown(raw: string): string {
  let text = (raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  // Remove surrounding code fences if present.
  text = text.replace(/^\s*```(?:markdown|md|text)?\s*\n?/i, '').trimStart();
  text = text.replace(/\n?\s*```\s*$/i, '').trimEnd();

  const lines = text.split('\n').map((line) => line.replace(/\s+$/, ''));
  const hasHeading = lines.some((line) => /^##\s+/.test(line.trim()));

  // Drop noisy preamble lines before first section heading.
  if (hasHeading) {
    const firstHeadingIndex = lines.findIndex((line) => /^##\s+/.test(line.trim()));
    text = lines.slice(firstHeadingIndex).join('\n');
  } else {
    text = lines.join('\n');
  }

  // Normalize heading level to "## ".
  text = text
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*#{1,6}\s*(.+?)\s*$/);
      if (!match) return line;
      return `## ${match[1]}`;
    })
    .join('\n');

  // Remove extra blank lines.
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

function validateDiarySections(content: string): { ok: boolean; reason?: string } {
  if (!content.trim()) return { ok: false, reason: 'empty content' };
  const lines = content.split('\n');
  const sections: { title: string; body: string }[] = [];
  let currentTitle = '';
  let currentBody: string[] = [];

  const pushSection = () => {
    if (!currentTitle) return;
    sections.push({
      title: currentTitle,
      body: currentBody.join('\n').trim(),
    });
  };

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      pushSection();
      currentTitle = heading[1].trim();
      currentBody = [];
      continue;
    }
    if (currentTitle) currentBody.push(line);
  }
  pushSection();

  if (sections.length === 0) return { ok: false, reason: 'no sections found' };
  const hasSummary = sections.some((s) => s.title === '今日の3行まとめ');
  if (!hasSummary) return { ok: false, reason: 'missing 3-line summary section' };
  const hasMainSection = sections.some((s) => s.title !== '今日の3行まとめ' && s.body.length > 0);
  if (!hasMainSection) return { ok: false, reason: 'missing main sections' };
  return { ok: true };
}

function getTimeBucket(occurredAt: string): '朝' | '昼' | '夕方' | '夜' {
  const hour = Number(formatInTimeZone(parseISO(occurredAt), TIMEZONE, 'H'));
  if (hour >= 5 && hour <= 10) return '朝';
  if (hour >= 11 && hour <= 14) return '昼';
  if (hour >= 15 && hour <= 17) return '夕方';
  return '夜';
}

function buildFallbackDiary(sortedBlocks: Block[]): string {
  const sections: Record<'朝' | '昼' | '夕方' | '夜' | '思ったこと', string[]> = {
    朝: [],
    昼: [],
    夕方: [],
    夜: [],
    思ったこと: [],
  };

  for (const block of sortedBlocks) {
    const content = (block.content || '').trim();
    const imageNote = block.images && block.images.length > 0
      ? ` {{PHOTO:${block.id}:${block.images.length}}}`
      : '';
    const line = `${content || '写真を記録した'}${imageNote}`.trim();

    if (block.category === 'thought') {
      sections['思ったこと'].push(`- ${line}`);
    } else {
      sections[getTimeBucket(block.occurred_at)].push(`- ${line}`);
    }
  }

  const orderedTitles: Array<'朝' | '昼' | '夕方' | '夜' | '思ったこと'> = ['朝', '昼', '夕方', '夜', '思ったこと'];
  const bodyParts: string[] = [];

  for (const title of orderedTitles) {
    const items = sections[title];
    if (items.length === 0) continue;
    bodyParts.push(`## ${title}\n${items.join('\n')}`);
  }

  const summaryCandidates = Object.values(sections)
    .flat()
    .map((line) => line.replace(/^-+\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3);

  while (summaryCandidates.length < 3) {
    summaryCandidates.push('一日の記録を整理した。');
  }

  bodyParts.push(`## 今日の3行まとめ\n${summaryCandidates.slice(0, 3).join('\n')}`);
  return bodyParts.join('\n\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { blocks, date, dayBoundaryHour = 0 } = await req.json() as { blocks: Block[]; date: string; dayBoundaryHour?: number };
    
    if (!blocks || blocks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No blocks provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    let supabase: ReturnType<typeof createClient> | null = null;
    let userId: string | null = null;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    if (authHeader) {
      supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        userId = user.id;
      }
    }

    // Fetch feature configs for all 3 phases
    let timeConfig: FeatureAIConfig | null = null;
    let diaryConfig: FeatureAIConfig | null = null;
    let scoreConfig: FeatureAIConfig | null = null;

    if (userId) {
      [timeConfig, diaryConfig, scoreConfig] = await Promise.all([
        getFeatureConfig(serviceClient, userId, 'time_inference'),
        getFeatureConfig(serviceClient, userId, 'diary_format'),
        getFeatureConfig(serviceClient, userId, 'score_evaluation'),
      ]);
    }

    // ========== Phase 1: 時刻推測 ==========
    console.log('Phase 1: Time inference...');
    
    const dbh = dayBoundaryHour || 0;

    const timeAnalysisInput = blocks.map((block, index) => {
      const currentTime = formatInTimeZone(parseISO(block.occurred_at), TIMEZONE, 'HH:mm');
      const lifeTime = dbh > 0 ? formatTimeWithBoundary(block.occurred_at, dbh) : currentTime;
      const timeDisplay = dbh > 0 && lifeTime !== currentTime
        ? `生活日時刻: ${lifeTime} (実時刻: ${currentTime})`
        : `現在時刻: ${currentTime}`;
      return `[${index}] ${timeDisplay}, 内容: ${block.content || '(画像のみ)'}`;
    }).join('\n');

    const timeSystemPrompt = timeConfig?.system_prompt || buildTimeAnalysisPrompt(dbh);
    const dayBoundaryNote = dbh > 0 ? `\n${buildDayBoundaryContext(dbh)}` : '';
    const timeAnalysisPrompt = `以下は${date}のブロックです。各ブロックの実際の発生時刻を推測してください：${dayBoundaryNote}

${timeAnalysisInput}

JSON形式で回答してください。`;

    const timeUpdates: TimeUpdate[] = [];
    const questions: TimeQuestion[] = [];
    const tokenUsages: { phase: string; usage: TokenUsage | null }[] = [];

    try {
      const timeAnalysisResult = await callAIWithConfig(timeConfig, timeSystemPrompt, timeAnalysisPrompt);
      tokenUsages.push({ phase: 'Phase 1 (Time inference)', usage: timeAnalysisResult.usage });
      console.log('Phase 1 token usage:', JSON.stringify(timeAnalysisResult.usage));
      
      const jsonMatch = timeAnalysisResult.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysisResult = JSON.parse(jsonMatch[0]);
        
        if (analysisResult.results && Array.isArray(analysisResult.results)) {
          for (const result of analysisResult.results) {
            const blockIndex = result.index;
            const block = blocks[blockIndex];
            
            if (!block) continue;
            
            if (result.confidence === 'none' && result.question) {
              questions.push({
                block_id: block.id,
                content_preview: (block.content || '').substring(0, 50),
                question: result.question,
              });
            } else if (result.inferred_time && (result.confidence === 'high' || result.confidence === 'medium')) {
              const currentTime = formatInTimeZone(parseISO(block.occurred_at), TIMEZONE, 'HH:mm');
              
              const [currentH, currentM] = currentTime.split(':').map(Number);
              const [inferredH, inferredM] = result.inferred_time.split(':').map(Number);
              const currentMinutes = currentH * 60 + currentM;
              const inferredMinutes = inferredH * 60 + inferredM;
              
              if (Math.abs(currentMinutes - inferredMinutes) >= 30) {
                const newOccurredAt = createOccurredAtFromTime(date, result.inferred_time, dbh);
                
                if (supabase) {
                  const { error: updateError } = await supabase
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
    }

    console.log('Time updates:', timeUpdates.length);
    console.log('Questions:', questions.length);

    // ========== Phase 2: 日記整形 ==========
    console.log('Phase 2: Formatting diary...');

    const sortedBlocks = [...blocks].sort(
      (a, b) => parseISO(a.occurred_at).getTime() - parseISO(b.occurred_at).getTime()
    );

    const blocksText = sortedBlocks.map((block) => {
      const time = formatInTimeZone(parseISO(block.occurred_at), TIMEZONE, 'HH:mm');
      const categoryLabel = block.category ? `[${getCategoryLabel(block.category)}]` : '';
      let doneNote = '';
      if (block.is_done) {
        if (block.done_at) {
          const doneTime = formatInTimeZone(parseISO(block.done_at), TIMEZONE, 'M/d HH:mm');
          doneNote = block.category === 'read_later' ? `[既読 ${doneTime}]` : `[✓ ${doneTime}完了]`;
        } else {
          doneNote = '[✓]';
        }
      }
      let deadlineNote = '';
      if ((block as any).due_at) {
        const dueDate = parseISO((block as any).due_at);
        if ((block as any).due_all_day) {
          deadlineNote = `[期限: ${formatInTimeZone(dueDate, TIMEZONE, 'M/d')} 終日]`;
        } else {
          deadlineNote = `[期限: ${formatInTimeZone(dueDate, TIMEZONE, 'M/d HH:mm')}]`;
        }
      }
      const imageNote = block.images && block.images.length > 0 
        ? ` {{PHOTO:${block.id}:${block.images.length}}}` 
        : '';
      const content = block.content || '';
      return `[${time}] ${categoryLabel}${doneNote}${deadlineNote}${imageNote} ${content}`.trim();
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

    const DIARY_OUTPUT_GUARD = `
追加の必須ルール（他の指示より優先）:
- 出力にコードフェンス（\`\`\`, \`\`\`markdown, \`\`\`md）を含めない
- セクション見出しは必ず "## " で始める
- 前置き・注釈・後書き（例:「以下が日記です」）を出力しない
- 本文は見出し配下にのみ書く
`;

    const diarySystemPrompt = `${diaryConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT}\n${DIARY_OUTPUT_GUARD}`;

    const userPrompt = `以下は${date}のログです。整形してください：

${blocksText}`;

    console.log('Blocks count:', blocks.length);
    console.log('Date:', date);

    let formattedContent = '';

    // Normalization: strip code fences, noise, normalize headings
    function normalizeDiaryMarkdown(raw: string): string {
      let text = raw;
      // Remove code fences
      text = text.replace(/^```(?:markdown|md)?\s*$/gm, '').replace(/^```\s*$/gm, '');
      // Normalize heading levels: # or ### etc → ##
      text = text.replace(/^(#{1,6})\s+/gm, (_match, hashes: string) => {
        if (hashes === '##') return '## ';
        return '## ';
      });
      // Remove leading noise lines (before first ## heading)
      const firstH2 = text.search(/^## /m);
      if (firstH2 > 0) {
        text = text.substring(firstH2);
      }
      // Remove empty sections (## heading followed immediately by another ## or end)
      text = text.replace(/^## .+\n(?=## |\s*$)/gm, '');
      // Normalize consecutive blank lines
      text = text.replace(/\n{3,}/g, '\n\n');
      return text.trim();
    }

    // Validation: check structure
    function validateDiarySections(content: string): { ok: boolean; reason?: string } {
      const sectionMatches = content.match(/^## .+/gm);
      if (!sectionMatches || sectionMatches.length === 0) {
        return { ok: false, reason: 'セクション見出しが見つかりません' };
      }
      if (!content.includes('## 今日の3行まとめ')) {
        return { ok: false, reason: '「## 今日の3行まとめ」が含まれていません' };
      }
      return { ok: true };
    }

    // Fallback: generate from blocks using fixed template
    function buildFallbackDiary(sortedBlks: Block[], dateStr: string): string {
      const timeSlots: Record<string, string[]> = { '朝': [], '昼': [], '夕方': [], '夜': [] };
      for (const block of sortedBlks) {
        const hour = parseInt(formatInTimeZone(parseISO(block.occurred_at), TIMEZONE, 'HH'));
        const content = block.content || '(画像のみ)';
        const imageNote = block.images?.length ? ` {{PHOTO:${block.id}:${block.images.length}}}` : '';
        const line = `${content}${imageNote}`;
        if (hour >= 5 && hour < 11) timeSlots['朝'].push(line);
        else if (hour >= 11 && hour < 15) timeSlots['昼'].push(line);
        else if (hour >= 15 && hour < 18) timeSlots['夕方'].push(line);
        else timeSlots['夜'].push(line);
      }
      let result = '';
      for (const [slot, lines] of Object.entries(timeSlots)) {
        if (lines.length > 0) {
          result += `## ${slot}\n${lines.join('\n')}\n\n`;
        }
      }
      result += `## 今日の3行まとめ\n${dateStr}の記録です。\n出来事を振り返りました。\nお疲れさまでした。`;
      return result;
    }

    try {
      const formatResult = await callAIWithConfig(diaryConfig, diarySystemPrompt, userPrompt);
      tokenUsages.push({ phase: 'Phase 2 (Formatting)', usage: formatResult.usage });
      console.log('Phase 2 token usage:', JSON.stringify(formatResult.usage));

      formattedContent = normalizeDiaryMarkdown(formatResult.text);
      let validation = validateDiarySections(formattedContent);

      // Retry once with stronger formatting constraints.
      if (!validation.ok) {
        console.warn(`Phase 2 validation failed: ${validation.reason}. Retrying...`);
        const retryPrompt = `${userPrompt}

必須:
1) 先頭から末尾まで純粋なMarkdown本文のみ
2) コードフェンスを絶対に使わない
3) 見出しは "## " のみ
4) 最後に必ず "## 今日の3行まとめ" を含める`;

        const retryResult = await callAIWithConfig(diaryConfig, diarySystemPrompt, retryPrompt);
        tokenUsages.push({ phase: 'Phase 2 (Formatting Retry)', usage: retryResult.usage });
        console.log('Phase 2 retry token usage:', JSON.stringify(retryResult.usage));
        formattedContent = normalizeDiaryMarkdown(retryResult.text);
        validation = validateDiarySections(formattedContent);
      }

      if (!validation.ok) {
        console.warn(`Phase 2 validation failed after retry: ${validation.reason}. Using fallback formatter.`);
        formattedContent = buildFallbackDiary(sortedBlocks, date);
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
      formattedContent = buildFallbackDiary(sortedBlocks, date);
    }

    // Extract summary
    const summaryMatch = formattedContent.match(/##\s*今日の3行まとめ\s*([\s\S]*?)$/);
    const summary = summaryMatch 
      ? summaryMatch[1].trim().split('\n').filter((l: string) => l.trim()).slice(0, 3).join(' ')
      : '';

    console.log('Successfully formatted entries');

    // ========== Phase 3: スコアリング ==========
    let score: number | undefined;
    let scoreDetails: string | undefined;

    // Determine if scoring is enabled from new config only
    const scoreEnabled = scoreConfig?.enabled ?? false;
    const behaviorRules = scoreConfig?.user_prompt_template;

    if (scoreEnabled && behaviorRules) {
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

      const scoreSystemPrompt = scoreConfig?.system_prompt || SCORE_PROMPT;

      const scoreUserPrompt = `## 行動規範
${behaviorRules}

## 今日の日記
${formattedContent}

上記の日記を行動規範と照らし合わせて、100点からの減点方式でスコアを算出してください。`;

      try {
        const scoreAIResult = await callAIWithConfig(scoreConfig, scoreSystemPrompt, scoreUserPrompt);
        tokenUsages.push({ phase: 'Phase 3 (Scoring)', usage: scoreAIResult.usage });
        console.log('Phase 3 token usage:', JSON.stringify(scoreAIResult.usage));
        
        const scoreJsonMatch = scoreAIResult.text.match(/\{[\s\S]*\}/);
        if (scoreJsonMatch) {
          const scoreResult = JSON.parse(scoreJsonMatch[0]);
          score = Math.max(0, Math.min(100, scoreResult.score || 100));
          
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
      }
    }

    // トークン使用量の合計
    const totalUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    for (const t of tokenUsages) {
      if (t.usage) {
        totalUsage.prompt_tokens += t.usage.prompt_tokens;
        totalUsage.completion_tokens += t.usage.completion_tokens;
        totalUsage.total_tokens += t.usage.total_tokens;
      }
    }
    console.log('Total token usage:', JSON.stringify(totalUsage));

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

    if (score !== undefined) {
      responseData.score = score;
      responseData.score_details = scoreDetails;
    }

    if (timeUpdates.length > 0) {
      responseData.time_updates = timeUpdates;
    }

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
