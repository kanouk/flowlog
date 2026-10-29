import { formatScoreDetails, parseScoreResult } from "./score-parser.ts";
import { parseISO } from "npm:date-fns@3";
import { formatInTimeZone } from "npm:date-fns-tz@3";
import {
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { corsHeaders } from "../_shared/cors.ts";

const TIMEZONE = "Asia/Tokyo";

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface AIResult {
  text: string;
  usage: TokenUsage | null;
}

interface OpenAIResponseFormat {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
}

interface AIOptions {
  responseFormat?: OpenAIResponseFormat;
}

export interface Block {
  id: string;
  content: string | null;
  occurred_at: string;
  // ユーザーが時刻を確定済み（回答・手動変更・質問却下）。質問生成・自動時刻変更の対象外
  time_confirmed_at?: string | null;
  images?: string[];
  category?: string;
  is_done?: boolean;
  done_at?: string | null;
  due_at?: string | null;
  due_all_day?: boolean | null;
}

export interface FeatureAIConfig {
  feature_key: string;
  enabled: boolean;
  system_prompt: string | null;
  user_prompt_template: string | null;
  provider: string | null;
  model_name: string | null;
  api_key: string | null;
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    event: "出来事",
    thought: "メモ",
    task: "タスク",
    read_later: "あとで",
  };
  return labels[category] || category;
}

// ========== 生活日基準ヘルパー関数 ==========

/**
 * occurred_at (ISO) → 生活日基準の時刻表示
 * dbh=5 のとき 03:00 → "27:00", 04:59 → "28:59"
 * dbh=0 のときは通常の HH:mm
 */
function formatTimeWithBoundary(
  occurredAt: string,
  dayBoundaryHour: number,
): string {
  const hour = Number(formatInTimeZone(parseISO(occurredAt), TIMEZONE, "H"));
  const minute = formatInTimeZone(parseISO(occurredAt), TIMEZONE, "mm");
  if (dayBoundaryHour > 0 && hour < dayBoundaryHour) {
    return `${24 + hour}:${minute}`;
  }
  return formatInTimeZone(parseISO(occurredAt), TIMEZONE, "HH:mm");
}

/**
 * 生活日基準の時間帯バケットを返す
 * dbh未満の時刻は「夜」として扱う
 */
function buildDayBoundaryContext(dayBoundaryHour: number): string {
  if (dayBoundaryHour === 0) return "";
  const endHour = dayBoundaryHour - 1;
  return `
【生活日の区切り】
- この日記の「1日」は ${
    String(dayBoundaryHour).padStart(2, "0")
  }:00 に始まり、翌日の ${String(endHour).padStart(2, "0")}:59 に終わります。
- 0:00〜${
    String(endHour).padStart(2, "0")
  }:59 は前日の続き（深夜〜明け方）として扱います。
- 例: 1:30 は前日の生活日における 25:30 に相当します。
- 深夜帯のブロックはその生活日の「夜」セクションに含めてください。
`;
}

/**
 * 時刻推測プロンプトを動的生成
 */
async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options: AIOptions = {},
): Promise<AIResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(options.responseFormat
        ? { response_format: options.responseFormat }
        : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (
    data.choices?.[0]?.finish_reason === "length" ||
    data.stop_reason === "max_tokens"
  ) throw new Error("Truncated generation");
  const usage: TokenUsage | null = data.usage
    ? {
      prompt_tokens: data.usage.prompt_tokens || 0,
      completion_tokens: data.usage.completion_tokens || 0,
      total_tokens: data.usage.total_tokens || 0,
    }
    : null;
  return { text: data.choices?.[0]?.message?.content || "", usage };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<AIResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (
    data.choices?.[0]?.finish_reason === "length" ||
    data.stop_reason === "max_tokens"
  ) throw new Error("Truncated generation");
  const usage: TokenUsage | null = data.usage
    ? {
      prompt_tokens: data.usage.input_tokens || 0,
      completion_tokens: data.usage.output_tokens || 0,
      total_tokens: (data.usage.input_tokens || 0) +
        (data.usage.output_tokens || 0),
    }
    : null;
  return { text: data.content?.[0]?.text || "", usage };
}

async function callGoogle(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<AIResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        generationConfig: { maxOutputTokens: 4096 },
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [{
          parts: [{ text: userPrompt }],
        }],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google AI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (data.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    throw new Error("Truncated generation");
  }
  const meta = data.usageMetadata;
  const usage: TokenUsage | null = meta
    ? {
      prompt_tokens: meta.promptTokenCount || 0,
      completion_tokens: meta.candidatesTokenCount || 0,
      total_tokens: meta.totalTokenCount || 0,
    }
    : null;
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || "", usage };
}

async function callLovableAI(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<AIResult> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const response = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    },
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("RATE_LIMIT");
    }
    if (response.status === 402) {
      throw new Error("CREDITS_EXHAUSTED");
    }
    const errorText = await response.text();
    throw new Error(`Lovable AI error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (
    data.choices?.[0]?.finish_reason === "length" ||
    data.stop_reason === "max_tokens"
  ) throw new Error("Truncated generation");
  const usage: TokenUsage | null = data.usage
    ? {
      prompt_tokens: data.usage.prompt_tokens || 0,
      completion_tokens: data.usage.completion_tokens || 0,
      total_tokens: data.usage.total_tokens || 0,
    }
    : null;
  return { text: data.choices?.[0]?.message?.content || "", usage };
}

// AI呼び出し - feature config or Lovable AI default
async function callAIWithConfig(
  featureConfig: FeatureAIConfig | null,
  systemPrompt: string,
  userPrompt: string,
  options: AIOptions = {},
): Promise<AIResult> {
  // 1. Feature config with assigned model + API key
  if (
    featureConfig?.provider && featureConfig?.model_name &&
    featureConfig?.api_key
  ) {
    switch (featureConfig.provider) {
      case "openai":
        return callOpenAI(
          featureConfig.api_key,
          featureConfig.model_name,
          systemPrompt,
          userPrompt,
          options,
        );
      case "anthropic":
        return callAnthropic(
          featureConfig.api_key,
          featureConfig.model_name,
          systemPrompt,
          userPrompt,
        );
      case "google":
        return callGoogle(
          featureConfig.api_key,
          featureConfig.model_name,
          systemPrompt,
          userPrompt,
        );
    }
  }

  // 2. Lovable AI default
  return callLovableAI("google/gemini-2.5-flash", systemPrompt, userPrompt);
}

// Fetch feature AI config via direct server-side queries (no RPC, no key exposure)
export async function getFeatureConfig(
  serviceClient: SupabaseClient,
  userId: string,
  featureKey: string,
  strict = false,
): Promise<FeatureAIConfig | null> {
  try {
    // 1. Get feature settings
    const { data: fs, error: fsError } = await serviceClient
      .from("user_ai_feature_settings")
      .select(
        "feature_key, enabled, system_prompt, user_prompt_template, assigned_model_id",
      )
      .eq("user_id", userId)
      .eq("feature_key", featureKey)
      .maybeSingle();
    if (fsError) throw new Error("Feature config unavailable");
    if (!fs) return null;

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
        .from("user_ai_models")
        .select("provider, model_name, api_key_id")
        .eq("id", fs.assigned_model_id)
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();
      if (model) {
        config.provider = model.provider;
        config.model_name = model.model_name;

        // 3. Get API key (server-side only, never returned to client)
        if (model.api_key_id) {
          const { data: key } = await serviceClient
            .from("user_ai_api_keys")
            .select("api_key")
            .eq("id", model.api_key_id)
            .eq("user_id", userId)
            .single();
          if (key) {
            config.api_key = key.api_key;
          }
        }
      }
    }

    if (
      strict && fs.assigned_model_id && (!config.model_name || !config.api_key)
    ) throw new Error("Assigned model unavailable");
    return config;
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}

function validateDiarySections(
  content: string,
): { ok: boolean; reason?: string } {
  if (!content.trim()) return { ok: false, reason: "empty content" };
  const lines = content.split("\n");
  const sections: { title: string; body: string }[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];

  const pushSection = () => {
    if (!currentTitle) return;
    sections.push({
      title: currentTitle,
      body: currentBody.join("\n").trim(),
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

  if (sections.length === 0) return { ok: false, reason: "no sections found" };
  const hasMainSection = sections.some((s) =>
    s.title !== "今日の3行まとめ" && s.body.length > 0
  );
  if (!hasMainSection) return { ok: false, reason: "missing main sections" };
  return { ok: true };
}

function buildPhotoMarkers(images?: string[]): string {
  return (images || [])
    .filter((url) => typeof url === "string" && /^https?:\/\//.test(url))
    .map((url) => `{{PHOTO:${url}}}`)
    .join("\n");
}

function normalizePhotoMarkerPunctuation(text: string): string {
  const marker = String
    .raw`\{\{PHOTO:(?:https?:\/\/[^}\s]+|[a-zA-Z0-9-]+:\d+)\}\}`;
  const markerGroup = String.raw`((?:${marker}\n\n)+)`;
  return text.replace(
    new RegExp(`([^\\n])\\n\\n${markerGroup}([。！？!?])(?=\\s|$)`, "g"),
    "$1$3\n\n$2",
  );
}

export async function generateDiaryText(
  blocks: Block[],
  date: string,
  dbh: number,
  diaryConfig: FeatureAIConfig | null,
  callAI: typeof callAIWithConfig = callAIWithConfig,
): Promise<{ formatted_content: string; summary: string }> {
  if (diaryConfig?.enabled === false) {
    throw new Error("Diary generation disabled");
  }
  if (blocks.length === 0) return { formatted_content: "", summary: "" };
  const tokenUsages: { phase: string; usage: TokenUsage | null }[] = [];
  const sortedBlocks = [...blocks].sort(
    (a, b) =>
      parseISO(a.occurred_at).getTime() - parseISO(b.occurred_at).getTime(),
  );

  const blocksText = sortedBlocks.map((block) => {
    const time = formatTimeWithBoundary(block.occurred_at, dbh);
    const categoryLabel = block.category
      ? `[${getCategoryLabel(block.category)}]`
      : "";
    let doneNote = "";
    if (block.is_done) {
      if (block.done_at) {
        const doneTime = formatInTimeZone(
          parseISO(block.done_at),
          TIMEZONE,
          "M/d HH:mm",
        );
        doneNote = block.category === "read_later"
          ? `[既読 ${doneTime}]`
          : `[✓ ${doneTime}完了]`;
      } else {
        doneNote = "[✓]";
      }
    }
    let deadlineNote = "";
    if (block.due_at) {
      const dueDate = parseISO(block.due_at);
      if (block.due_all_day) {
        deadlineNote = `[期限: ${
          formatInTimeZone(dueDate, TIMEZONE, "M/d")
        } 終日]`;
      } else {
        deadlineNote = `[期限: ${
          formatInTimeZone(dueDate, TIMEZONE, "M/d HH:mm")
        }]`;
      }
    }
    const imageNote = buildPhotoMarkers(block.images);
    const content = block.content || "";
    const header = `[${time}] ${categoryLabel}${doneNote}${deadlineNote}`
      .trim();
    return imageNote
      ? `${header} ${content || "(画像のみ)"}\n\n${imageNote}`.trim()
      : `${header} ${content}`.trim();
  }).join("\n");

  const nightEndDisplay = dbh > 0
    ? `${String(dbh - 1).padStart(2, "0")}:59（翌${
      String(dbh).padStart(2, "0")
    }:00が翌日の始まり）`
    : "4:59";
  const dayBoundaryDiaryNote = dbh > 0
    ? `
15. ${buildDayBoundaryContext(dbh)}
    深夜帯（0:00〜${
      String(dbh - 1).padStart(2, "0")
    }:59）のブロックは「## 夜」セクションに含める
    「25時」「26時」のような表現を自然に使ってよい`
    : "";

  const DEFAULT_SYSTEM_PROMPT =
    `あなたは日記を整形するアシスタントです。ユーザーが一日の中で記録した「出来事」を、読みやすい日記形式に整形してください。

以下のルールに従ってください：
1. 時系列順に並べ替える（入力は既にソート済み）
2. 口語体を自然な文章に軽く整形する（過剰な文学表現は避ける）
3. 時間帯ごとにセクション分けする：
   - 朝（5:00-10:59）
   - 昼（11:00-14:59）
   - 夕方（15:00-17:59）
   - 夜（18:00-${nightEndDisplay}）
4. 各セクションは「## 朝」のようなMarkdown見出しで始める
5. 具体的な出来事に紐付かない「思ったこと」「感じたこと」「気づき」「内省」がある場合は
   「## 思ったこと」セクションにまとめる
   - 例: 「最近疲れてる気がする」「なんか調子がいい」「○○について考えた」「ふと○○と感じた」
   - このセクションは時間帯セクションの後に配置
   - 該当する内容がない場合は、このセクションは出力しない
6. 「## 今日の3行まとめ」セクションや要約セクションは出力しない
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
12. 写真マーカー {{PHOTO:https://...}} は必ずそのまま出力に含めること。URLを書き換えたり、省略したりしないこと
    - 例: {{PHOTO:https://example.com/photo.jpg}} → そのまま {{PHOTO:https://example.com/photo.jpg}} として出力
    - 「(📷)」「（写真あり）」などに置き換えないこと
13. 写真マーカーは必ず独立行に置き、前後に空行を入れること
    - 複数写真は1行に1つずつ並べること
    - 文末にインラインで付けないこと
    - 良い例: 「ラーメンを食べた\n\n{{PHOTO:https://example.com/ramen.jpg}}\n\nおいしかった」
    - 悪い例: 「ラーメンを食べた {{PHOTO:https://example.com/ramen.jpg}}」${dayBoundaryDiaryNote}

出力はMarkdown形式で返してください。`;

  const DIARY_OUTPUT_GUARD = `
追加の必須ルール（他の指示より優先）:
- 出力にコードフェンス（\`\`\`, \`\`\`markdown, \`\`\`md）を含めない
- セクション見出しは必ず "## " で始める
- "## 今日の3行まとめ" セクションを出力しない
- 3行まとめ、要約、まとめだけのセクションを出力しない
- 写真マーカー {{PHOTO:https://...}} はURLを変えずに必ず残す
- 写真マーカーは独立行に置き、前後に空行を入れる
- 複数写真は1行に1つずつ並べ、文末インラインにしない
- 前置き・注釈・後書き（例:「以下が日記です」）を出力しない
- 本文は見出し配下にのみ書く
- 原文の事実と伏せ字「○○」を保ち、人名・数量・出来事を推測で補完しない
`;

  const diarySystemPrompt = `${
    diaryConfig?.system_prompt || DEFAULT_SYSTEM_PROMPT
  }\n${DIARY_OUTPUT_GUARD}`;

  const dayBoundaryUserNote = dbh > 0
    ? `\n${buildDayBoundaryContext(dbh)}`
    : "";
  const template = diaryConfig?.user_prompt_template?.trim();
  const userPrompt = template
    ? template.replaceAll("{{date}}", date).replaceAll(
      "{{blocks_text}}",
      blocksText,
    ) +
      `\n対象日: ${date}${dayBoundaryUserNote}` +
      (template.includes("{{blocks_text}}") ? "" : `\n\n${blocksText}`)
    : `以下は${date}のログです。整形してください：${dayBoundaryUserNote}\n\n${blocksText}`;

  let formattedContent = "";

  // Normalization: strip code fences, noise, normalize headings
  function normalizeDiaryMarkdown(raw: string): string {
    let text = raw;
    // Remove code fences
    text = text.replace(/^```(?:markdown|md)?\s*$/gm, "").replace(
      /^```\s*$/gm,
      "",
    );
    // Normalize heading levels: # or ### etc → ##
    text = text.replace(/^(#{1,6})\s+/gm, (_match, hashes: string) => {
      if (hashes === "##") return "## ";
      return "## ";
    });
    // Remove leading noise lines (before first ## heading)
    const firstH2 = text.search(/^## /m);
    if (firstH2 > 0) {
      text = text.substring(firstH2);
    }
    // Remove empty sections (## heading followed immediately by another ## or end)
    text = text.replace(/^## .+\n(?=## |\s*$)/gm, "");
    // Remove summary sections even if a custom prompt or model still emits them.
    text = text.replace(
      /^##\s*(?:今日の3行まとめ|3行まとめ|まとめ|要約)\s*\n[\s\S]*?(?=^## |\s*$)/gm,
      "",
    );
    // Keep photo markers as standalone lines with blank lines around them.
    text = text.replace(
      /\s*(\{\{PHOTO:(?:https?:\/\/[^}\s]+|[a-zA-Z0-9-]+:\d+)\}\})\s*/g,
      "\n\n$1\n\n",
    );
    text = normalizePhotoMarkerPunctuation(text);
    // Normalize consecutive blank lines
    text = text.replace(/\n{3,}/g, "\n\n");
    return text.trim();
  }

  {
    const formatResult = await callAI(
      diaryConfig,
      diarySystemPrompt,
      userPrompt,
    );
    tokenUsages.push({
      phase: "Phase 2 (Formatting)",
      usage: formatResult.usage,
    });
    console.log("Phase 2 token usage:", JSON.stringify(formatResult.usage));

    formattedContent = normalizeDiaryMarkdown(formatResult.text);
    let validation = validateDiarySections(formattedContent);

    // Retry once with stronger formatting constraints.
    if (!validation.ok) {
      console.warn(
        `Phase 2 validation failed: ${validation.reason}. Retrying...`,
      );
      const retryPrompt = `${userPrompt}

必須:
1) 先頭から末尾まで純粋なMarkdown本文のみ
2) コードフェンスを絶対に使わない
3) 見出しは "## " のみ
4) "## 今日の3行まとめ"、3行まとめ、要約、まとめセクションを含めない`;

      const retryResult = await callAI(
        diaryConfig,
        diarySystemPrompt,
        retryPrompt,
      );
      tokenUsages.push({
        phase: "Phase 2 (Formatting Retry)",
        usage: retryResult.usage,
      });
      console.log(
        "Phase 2 retry token usage:",
        JSON.stringify(retryResult.usage),
      );
      formattedContent = normalizeDiaryMarkdown(retryResult.text);
      validation = validateDiarySections(formattedContent);
    }

    if (!validation.ok) {
      console.warn(
        `Phase 2 validation failed after retry: ${validation.reason}. Rejecting invalid response.`,
      );
      throw new Error("Invalid diary response");
    }
  }

  if (!formattedContent) {
    throw new Error("Empty diary response");
  }

  // Restore omitted native markers without re-uploading/fetching images.
  const allowedPhotos = new Set(
    sortedBlocks.flatMap((block) => block.images || []),
  );
  formattedContent = formattedContent.replace(
    /\{\{PHOTO:([^}]+)\}\}/g,
    (marker, url) => allowedPhotos.has(url) ? marker : "",
  );
  const missing = sortedBlocks.flatMap((block) => block.images || []).filter(
    (url) => !formattedContent.includes(`{{PHOTO:${url}}}`),
  );
  if (missing.length) {
    formattedContent += "\n\n" +
      [...new Set(missing)].map((url) => `{{PHOTO:${url}}}`).join("\n\n");
  }
  return { formatted_content: formattedContent, summary: "" };
}

const SCORE_RESPONSE_FORMAT: OpenAIResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "score_evaluation_result",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        score: {
          type: "integer",
        },
        deductions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              rule: { type: "string" },
              points: { type: "integer" },
              reason: { type: "string" },
            },
            required: ["rule", "points", "reason"],
          },
        },
        summary: { type: "string" },
      },
      required: ["score", "deductions", "summary"],
    },
  },
};

export async function generateDiaryScore(
  formattedContent: string,
  dbh: number,
  config: FeatureAIConfig | null,
  callAI: typeof callAIWithConfig = callAIWithConfig,
): Promise<{ score?: number; score_details?: string }> {
  if (!config?.enabled || !config.user_prompt_template?.trim()) return {};
  const defaultPrompt = `あなたは行動規範の達成度を評価するアシスタントです。

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
  const system = `${
    config.system_prompt || defaultPrompt
  }\nJSONオブジェクトだけを返す。必須キーはscore, deductions, summary。scoreは0〜100。`;
  const prompt =
    `## 行動規範\n${config.user_prompt_template}\n\n## 今日の日記\n${formattedContent}\n${
      buildDayBoundaryContext(dbh)
    }`;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await callAI(
        config,
        system,
        attempt
          ? prompt + "\n前回の応答は不正でした。JSONだけを返してください。"
          : prompt,
        { responseFormat: SCORE_RESPONSE_FORMAT },
      );
      const parsed = parseScoreResult(response.text);
      if (parsed.ok) {
        return {
          score: parsed.value.score,
          score_details: formatScoreDetails(parsed.value),
        };
      }
    }
  } catch {
    /* Scoring failure must not lose a successfully generated diary. */
  }
  return {};
}
