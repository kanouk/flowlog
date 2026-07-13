import { Hono, type Context } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { corsHeaders } from "../_shared/cors.ts";
import { waitUntil } from "../_shared/edge-runtime.ts";

// ベースパスを設定（Edge Functionのパス）
const app = new Hono().basePath("/api");

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ===== CORS =====
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      },
    });
  }
  await next();
  c.header("Access-Control-Allow-Origin", "*");
});

// ===== 認証ヘルパー =====
async function authenticateUser(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  
  const token = authHeader.slice(7);
  
  // SHA-256ハッシュを計算
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: tokenData, error } = await supabase
    .from("user_api_tokens")
    .select("user_id")
    .eq("token_hash", tokenHash)
    .single();
  
  if (error || !tokenData) {
    return null;
  }
  
  // 最終使用日時をバックグラウンド更新
  waitUntil(
    supabase
      .from("user_api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .then(() => undefined),
  );
  
  return tokenData.user_id;
}

// ===== 認証ミドルウェア =====
app.use("/events/*", authMiddleware);
app.use("/tasks/*", authMiddleware);
app.use("/schedules/*", authMiddleware);
app.use("/memos/*", authMiddleware);
app.use("/read-later/*", authMiddleware);
app.use("/search", authMiddleware);
app.use("/entries/*", authMiddleware);
app.use("/blocks/*", authMiddleware);
app.use("/image-reference-migrations", authMiddleware);

async function authMiddleware(c: Context, next: () => Promise<void>) {
  const userId = await authenticateUser(c.req.header("Authorization"));
  if (!userId) {
    return c.json({ 
      success: false, 
      error: "Unauthorized",
      error_description: "Bearer token required",
    }, 401, {
      "WWW-Authenticate": 'Bearer realm="FlowLog API"',
    });
  }
  c.set("userId", userId);
  await next();
}

// ルートパスにも認証を適用（直接呼び出し用）
app.get("/events", authMiddlewareInline, listEvents);
app.post("/events", authMiddlewareInline, addEvent);
app.get("/tasks", authMiddlewareInline, listTasks);
app.post("/tasks", authMiddlewareInline, addTask);
app.patch("/tasks/:id/complete", authMiddlewareInline, completeTask);
app.patch("/tasks/:id/priority", authMiddlewareInline, updateTaskPriority);
app.get("/schedules", authMiddlewareInline, listSchedules);
app.post("/schedules", authMiddlewareInline, addSchedule);
app.get("/memos", authMiddlewareInline, listMemos);
app.post("/memos", authMiddlewareInline, addMemo);
app.get("/read-later", authMiddlewareInline, listReadLater);
app.post("/read-later", authMiddlewareInline, addReadLater);
app.patch("/read-later/:id/read", authMiddlewareInline, markAsReadHandler);
app.get("/search", authMiddlewareInline, search);
app.get("/entries/:date", authMiddlewareInline, getEntryHandler);
app.patch("/blocks/:id", authMiddlewareInline, updateBlock);
app.delete("/blocks/:id", authMiddlewareInline, deleteBlock);
app.post("/image-reference-migrations", authMiddlewareInline, migrateImageReferences);

async function authMiddlewareInline(c: Context, next: () => Promise<void>) {
  const userId = await authenticateUser(c.req.header("Authorization"));
  if (!userId) {
    return c.json({ 
      success: false, 
      error: "Unauthorized",
      error_description: "Bearer token required",
    }, 401, {
      "WWW-Authenticate": 'Bearer realm="FlowLog API"',
    });
  }
  c.set("userId", userId);
  await next();
}

// ===== ヘルパー関数 =====

function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

async function getBlocksHelper(
  userId: string,
  category: string,
  options: {
    date?: string;
    start_date?: string;
    end_date?: string;
    tag?: string;
    limit?: number;
    include_completed?: boolean;
    include_past?: boolean;
    filter?: string;
  }
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  let query = supabase
    .from("blocks")
    .select("*")
    .eq("user_id", userId)
    .eq("category", category)
    .order("occurred_at", { ascending: false })
    .limit(options.limit || 50);
  
  // 日付フィルタ
  if (options.date) {
    const startOfDay = `${options.date}T00:00:00.000Z`;
    const endOfDay = `${options.date}T23:59:59.999Z`;
    query = query.gte("occurred_at", startOfDay).lte("occurred_at", endOfDay);
  } else if (options.start_date || options.end_date) {
    if (options.start_date) {
      query = query.gte("occurred_at", `${options.start_date}T00:00:00.000Z`);
    }
    if (options.end_date) {
      query = query.lte("occurred_at", `${options.end_date}T23:59:59.999Z`);
    }
  }
  
  // タグフィルタ
  if (options.tag) {
    query = query.eq("tag", options.tag);
  }
  
  // タスク用: 完了済みを含めるか
  if (category === "task" && !options.include_completed) {
    query = query.eq("is_done", false);
  }
  
  // スケジュール用: 過去を含めるか
  if (category === "schedule" && !options.include_past) {
    query = query.gte("starts_at", new Date().toISOString());
  }
  
  // あとで用: フィルタ
  if (category === "read_later" && options.filter && options.filter !== "all") {
    if (options.filter === "read") {
      query = query.eq("is_done", true);
    } else if (options.filter === "unread") {
      query = query.eq("is_done", false);
    }
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch blocks: ${error.message}`);
  }
  
  return data;
}

async function addBlockHelper(
  userId: string,
  block: {
    category: string;
    content: string;
    tag?: string;
    occurred_at?: string;
    starts_at?: string;
    ends_at?: string;
    is_all_day?: boolean;
    priority?: number;
    due_at?: string;
    due_all_day?: boolean;
  }
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // エントリーを取得または作成
  const date = block.occurred_at 
    ? block.occurred_at.split("T")[0] 
    : getTodayDate();
  
  let { data: entry } = await supabase
    .from("entries")
    .select("id")
    .eq("user_id", userId)
    .eq("date", date)
    .single();
  
  if (!entry) {
    const { data: newEntry, error: entryError } = await supabase
      .from("entries")
      .insert({ user_id: userId, date })
      .select("id")
      .single();
    
    if (entryError) {
      throw new Error(`Failed to create entry: ${entryError.message}`);
    }
    entry = newEntry;
  }
  
  const insertData: Record<string, unknown> = {
      user_id: userId,
      entry_id: entry.id,
      category: block.category,
      content: block.content,
      tag: block.tag,
      occurred_at: block.occurred_at || new Date().toISOString(),
      starts_at: block.starts_at,
      ends_at: block.ends_at,
      is_all_day: block.is_all_day || false,
      priority: block.priority || 0,
    };
  if (block.due_at !== undefined) insertData.due_at = block.due_at;
  if (block.due_all_day !== undefined) insertData.due_all_day = block.due_all_day;

  const { data, error } = await supabase
    .from("blocks")
    .insert(insertData)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to add block: ${error.message}`);
  }
  
  return data;
}

async function searchBlocksHelper(
  userId: string,
  options: {
    query: string;
    category?: string;
    tag?: string;
    limit?: number;
  }
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  let query = supabase
    .from("blocks")
    .select("*")
    .eq("user_id", userId)
    .ilike("content", `%${options.query}%`)
    .order("occurred_at", { ascending: false })
    .limit(options.limit || 20);
  
  if (options.category) {
    query = query.eq("category", options.category);
  }
  
  if (options.tag) {
    query = query.eq("tag", options.tag);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to search blocks: ${error.message}`);
  }
  
  return data;
}

async function expandPhotoMarkersForContent(userId: string, content: string | null): Promise<string | null> {
  if (!content) return content;

  const legacyIds = Array.from(content.matchAll(/\{\{PHOTO:([a-zA-Z0-9-]+):(\d+)\}\}/g)).map((match) => match[1]);
  const blocksById = new Map<string, { images?: string[] }>();

  if (legacyIds.length > 0) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase
      .from("blocks")
      .select("id, images")
      .eq("user_id", userId)
      .in("id", [...new Set(legacyIds)]);

    if (!error && data) {
      data.forEach((block: { id: string; images?: string[] | null }) => blocksById.set(block.id, { images: block.images || [] }));
    }
  }

  return content
    .replace(/\{\{PHOTO:(https?:\/\/[^}\s]+)\}\}/g, (_match, url) => `\n\n${url}\n\n`)
    .replace(/\{\{PHOTO:([a-zA-Z0-9-]+):(\d+)\}\}/g, (match, blockId) => {
      const images = blocksById.get(blockId)?.images || [];
      return images.length > 0 ? `\n\n${images.join('\n')}\n\n` : match;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ===== ルートハンドラー =====

// ヘルスチェック
app.get("/health", (c) => {
  return c.json({ success: true, message: "FlowLog API is running" });
});

// ===== API ドキュメント =====
app.get("/docs", (c) => {
  const docs = {
    name: "FlowLog REST API",
    version: "1.0",
    base_url: `${supabaseUrl}/functions/v1/api`,
    authentication: {
      type: "Bearer Token",
      header: "Authorization: Bearer YOUR_API_TOKEN",
      description: "APIトークンはFlowLog設定画面から発行できます。/health と /docs 以外の全エンドポイントに認証が必要です。",
    },
    endpoints: [
      {
        method: "GET", path: "/health",
        description: "ヘルスチェック（認証不要）",
      },
      {
        method: "GET", path: "/docs",
        description: "このAPIドキュメント（認証不要）",
      },
      {
        method: "GET", path: "/events",
        description: "出来事一覧を取得",
        query: { date: "string? (YYYY-MM-DD)", start_date: "string?", end_date: "string?", tag: "string?", limit: "number? (default 50)" },
      },
      {
        method: "POST", path: "/events",
        description: "出来事を追加",
        body: { content: "string (required)", occurred_at: "string? (ISO8601)", tag: "string?" },
      },
      {
        method: "GET", path: "/tasks",
        description: "タスク一覧を取得",
        query: { include_completed: "boolean? (default false)", tag: "string?", limit: "number?" },
      },
      {
        method: "POST", path: "/tasks",
        description: "タスクを追加",
        body: { content: "string (required)", tag: "string?", priority: "number? (0-3)", due_at: "string? (ISO8601)", due_all_day: "boolean?" },
      },
      {
        method: "PATCH", path: "/tasks/:id/complete",
        description: "タスクの完了/未完了を切り替え",
        body: { is_done: "boolean? (default true)" },
      },
      {
        method: "PATCH", path: "/tasks/:id/priority",
        description: "タスクの優先度を変更",
        body: { priority: "number (required, 0-3)" },
      },
      {
        method: "GET", path: "/schedules",
        description: "予定一覧を取得",
        query: { include_past: "boolean? (default false)", start_date: "string?", end_date: "string?", limit: "number?" },
      },
      {
        method: "POST", path: "/schedules",
        description: "予定を追加",
        body: { title: "string (required)", starts_at: "string (required, ISO8601)", ends_at: "string?", is_all_day: "boolean?", details: "string?", tag: "string?" },
      },
      {
        method: "GET", path: "/memos",
        description: "メモ一覧を取得",
        query: { date: "string?", start_date: "string?", end_date: "string?", tag: "string?", limit: "number?" },
      },
      {
        method: "POST", path: "/memos",
        description: "メモを追加",
        body: { content: "string (required)", tag: "string?" },
      },
      {
        method: "GET", path: "/read-later",
        description: "あとで一覧を取得",
        query: { filter: "string? (all|read|unread, default all)", tag: "string?", limit: "number?" },
      },
      {
        method: "POST", path: "/read-later",
        description: "あとでに追加",
        body: { url: "string (required)", comment: "string?", tag: "string?" },
      },
      {
        method: "PATCH", path: "/read-later/:id/read",
        description: "既読/未読を切り替え",
        body: { is_read: "boolean? (default true)" },
      },
      {
        method: "GET", path: "/search",
        description: "ブロックを横断検索",
        query: { query: "string (required)", category: "string?", tag: "string?", limit: "number?" },
      },
      {
        method: "GET", path: "/entries/:date",
        description: "指定日のエントリーを取得。formatted_content 内の写真マーカーはURL文字列へ展開されます。",
        params: { date: "string (YYYY-MM-DD)" },
      },
      {
        method: "PATCH", path: "/blocks/:id",
        description: "ブロックを更新",
        body: { content: "string?", tag: "string?", occurred_at: "string?", priority: "number?", is_done: "boolean?", starts_at: "string?", ends_at: "string?", is_all_day: "boolean?", due_at: "string?", due_all_day: "boolean?" },
      },
      {
        method: "DELETE", path: "/blocks/:id",
        description: "ブロックを削除",
      },
    ],
  };
  return c.json(docs);
});

// ===== OpenAPI 3.0.3 Specification =====
app.get("/openapi.json", (c) => {
  const baseUrl = `${supabaseUrl}/functions/v1/api`;
  const spec = {
    openapi: "3.0.3",
    info: {
      title: "FlowLog API",
      description: "FlowLog REST API – 出来事・タスク・予定・メモ・あとで読むの管理",
      version: "1.0.0",
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "FlowLog設定画面で発行したAPIトークン",
        },
      },
      schemas: {
        Block: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            entry_id: { type: "string", format: "uuid" },
            user_id: { type: "string", format: "uuid" },
            category: { type: "string", enum: ["event", "task", "schedule", "thought", "read_later"] },
            content: { type: "string", nullable: true },
            tag: { type: "string", nullable: true },
            priority: { type: "integer", nullable: true, minimum: 0, maximum: 3 },
            is_done: { type: "boolean" },
            done_at: { type: "string", format: "date-time", nullable: true },
            occurred_at: { type: "string", format: "date-time" },
            starts_at: { type: "string", format: "date-time", nullable: true },
            ends_at: { type: "string", format: "date-time", nullable: true },
            is_all_day: { type: "boolean", nullable: true },
            due_at: { type: "string", format: "date-time", nullable: true },
            due_all_day: { type: "boolean", nullable: true },
            images: { type: "array", items: { type: "string" }, nullable: true },
            url_metadata: { type: "object", nullable: true },
            extracted_text: { type: "string", nullable: true },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Entry: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            user_id: { type: "string", format: "uuid" },
            date: { type: "string", format: "date" },
            summary: { type: "string", nullable: true },
            formatted_content: { type: "string", nullable: true, description: "AI整形済み本文。写真マーカーはAPI返却時に実URL文字列へ展開されます。" },
            score: { type: "integer", nullable: true },
            score_details: { type: "string", nullable: true },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        SuccessListResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "array", items: { $ref: "#/components/schemas/Block" } },
          },
        },
        SuccessCreateResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                message: { type: "string" },
              },
            },
          },
        },
        SuccessMessageResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: { type: "string" },
            error_description: { type: "string" },
          },
        },
      },
      parameters: {
        dateQuery: { name: "date", in: "query", schema: { type: "string", format: "date" }, description: "YYYY-MM-DD" },
        startDateQuery: { name: "start_date", in: "query", schema: { type: "string", format: "date" } },
        endDateQuery: { name: "end_date", in: "query", schema: { type: "string", format: "date" } },
        tagQuery: { name: "tag", in: "query", schema: { type: "string" } },
        limitQuery: { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
      },
    },
    paths: {
      "/health": {
        get: {
          summary: "ヘルスチェック",
          security: [],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" } } } } } } },
        },
      },
      "/docs": {
        get: {
          summary: "APIドキュメント（JSON）",
          security: [],
          responses: { "200": { description: "OK" } },
        },
      },
      "/openapi.json": {
        get: {
          summary: "OpenAPI仕様",
          security: [],
          responses: { "200": { description: "OK" } },
        },
      },
      "/events": {
        get: {
          summary: "出来事一覧を取得",
          parameters: [
            { $ref: "#/components/parameters/dateQuery" },
            { $ref: "#/components/parameters/startDateQuery" },
            { $ref: "#/components/parameters/endDateQuery" },
            { $ref: "#/components/parameters/tagQuery" },
            { $ref: "#/components/parameters/limitQuery" },
          ],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessListResponse" } } } }, "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } } },
        },
        post: {
          summary: "出来事を追加",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["content"], properties: { content: { type: "string" }, occurred_at: { type: "string", format: "date-time" }, tag: { type: "string" } } } } },
          },
          responses: { "200": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessCreateResponse" } } } } },
        },
      },
      "/tasks": {
        get: {
          summary: "タスク一覧を取得",
          parameters: [
            { name: "include_completed", in: "query", schema: { type: "boolean", default: false } },
            { $ref: "#/components/parameters/tagQuery" },
            { $ref: "#/components/parameters/limitQuery" },
          ],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessListResponse" } } } } },
        },
        post: {
          summary: "タスクを追加",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["content"], properties: { content: { type: "string" }, tag: { type: "string" }, priority: { type: "integer", minimum: 0, maximum: 3 }, due_at: { type: "string", format: "date-time" }, due_all_day: { type: "boolean" } } } } },
          },
          responses: { "200": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessCreateResponse" } } } } },
        },
      },
      "/tasks/{id}/complete": {
        patch: {
          summary: "タスクの完了/未完了を切り替え",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { is_done: { type: "boolean", default: true } } } } } },
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessMessageResponse" } } } } },
        },
      },
      "/tasks/{id}/priority": {
        patch: {
          summary: "タスクの優先度を変更",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["priority"], properties: { priority: { type: "integer", minimum: 0, maximum: 3 } } } } } },
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessMessageResponse" } } } } },
        },
      },
      "/schedules": {
        get: {
          summary: "予定一覧を取得",
          parameters: [
            { name: "include_past", in: "query", schema: { type: "boolean", default: false } },
            { $ref: "#/components/parameters/startDateQuery" },
            { $ref: "#/components/parameters/endDateQuery" },
            { $ref: "#/components/parameters/limitQuery" },
          ],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessListResponse" } } } } },
        },
        post: {
          summary: "予定を追加",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["title", "starts_at"], properties: { title: { type: "string" }, starts_at: { type: "string", format: "date-time" }, ends_at: { type: "string", format: "date-time" }, is_all_day: { type: "boolean" }, details: { type: "string" }, tag: { type: "string" } } } } },
          },
          responses: { "200": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessCreateResponse" } } } } },
        },
      },
      "/memos": {
        get: {
          summary: "メモ一覧を取得",
          parameters: [
            { $ref: "#/components/parameters/dateQuery" },
            { $ref: "#/components/parameters/startDateQuery" },
            { $ref: "#/components/parameters/endDateQuery" },
            { $ref: "#/components/parameters/tagQuery" },
            { $ref: "#/components/parameters/limitQuery" },
          ],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessListResponse" } } } } },
        },
        post: {
          summary: "メモを追加",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["content"], properties: { content: { type: "string" }, tag: { type: "string" } } } } },
          },
          responses: { "200": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessCreateResponse" } } } } },
        },
      },
      "/read-later": {
        get: {
          summary: "あとで読む一覧を取得",
          parameters: [
            { name: "filter", in: "query", schema: { type: "string", enum: ["all", "read", "unread"], default: "all" } },
            { $ref: "#/components/parameters/tagQuery" },
            { $ref: "#/components/parameters/limitQuery" },
          ],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessListResponse" } } } } },
        },
        post: {
          summary: "あとで読むに追加",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" }, comment: { type: "string" }, tag: { type: "string" } } } } },
          },
          responses: { "200": { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessCreateResponse" } } } } },
        },
      },
      "/read-later/{id}/read": {
        patch: {
          summary: "既読/未読を切り替え",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { is_read: { type: "boolean", default: true } } } } } },
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessMessageResponse" } } } } },
        },
      },
      "/search": {
        get: {
          summary: "ブロックを横断検索",
          parameters: [
            { name: "query", in: "query", required: true, schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string", enum: ["event", "task", "schedule", "thought", "read_later"] } },
            { $ref: "#/components/parameters/tagQuery" },
            { $ref: "#/components/parameters/limitQuery" },
          ],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessListResponse" } } } } },
        },
      },
      "/entries/{date}": {
        get: {
          summary: "指定日のエントリーを取得",
          description: "formatted_content 内の写真マーカーはAPI返却時に実URL文字列へ展開されます。",
          parameters: [{ name: "date", in: "path", required: true, schema: { type: "string", format: "date" }, description: "YYYY-MM-DD" }],
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { $ref: "#/components/schemas/Entry" } } } } } },
          },
        },
      },
      "/blocks/{id}": {
        patch: {
          summary: "ブロックを更新",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", properties: { content: { type: "string" }, tag: { type: "string" }, occurred_at: { type: "string", format: "date-time" }, priority: { type: "integer" }, is_done: { type: "boolean" }, starts_at: { type: "string", format: "date-time" }, ends_at: { type: "string", format: "date-time" }, is_all_day: { type: "boolean" }, due_at: { type: "string", format: "date-time" }, due_all_day: { type: "boolean" } } } } },
          },
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessMessageResponse" } } } } },
        },
        delete: {
          summary: "ブロックを削除",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessMessageResponse" } } } } },
        },
      },
    },
  };
  return c.json(spec);
});

// Events
async function listEvents(c: Context) {
  try {
    const userId = c.get("userId");
    const { date, start_date, end_date, tag, limit } = c.req.query();
    
    const data = await getBlocksHelper(userId, "event", {
      date,
      start_date,
      end_date,
      tag,
      limit: limit ? parseInt(limit) : undefined,
    });
    
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

async function addEvent(c: Context) {
  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    
    if (!body.content) {
      return c.json({ success: false, error: "content is required" }, 400);
    }
    
    const block = await addBlockHelper(userId, {
      category: "event",
      content: body.content,
      occurred_at: body.occurred_at,
      tag: body.tag,
    });
    
    return c.json({ 
      success: true, 
      data: { id: block.id, message: "出来事を追加しました" } 
    });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

// Tasks
async function listTasks(c: Context) {
  try {
    const userId = c.get("userId");
    const { include_completed, tag, limit } = c.req.query();
    
    const data = await getBlocksHelper(userId, "task", {
      include_completed: include_completed === "true",
      tag,
      limit: limit ? parseInt(limit) : undefined,
    });
    
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

async function addTask(c: Context) {
  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    
    if (!body.content) {
      return c.json({ success: false, error: "content is required" }, 400);
    }
    
    const block = await addBlockHelper(userId, {
      category: "task",
      content: body.content,
      tag: body.tag,
      priority: body.priority,
      due_at: body.due_at,
      due_all_day: body.due_all_day,
    });
    
    return c.json({ 
      success: true, 
      data: { id: block.id, message: "タスクを追加しました" } 
    });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

async function completeTask(c: Context) {
  try {
    const userId = c.get("userId");
    const taskId = c.req.param("id");
    const body = await c.req.json();
    const isDone = body.is_done !== false;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { error } = await supabase
      .from("blocks")
      .update({ 
        is_done: isDone,
        done_at: isDone ? new Date().toISOString() : null
      })
      .eq("id", taskId)
      .eq("user_id", userId)
      .eq("category", "task");
    
    if (error) {
      throw new Error(`Failed to update task: ${error.message}`);
    }
    
    return c.json({ 
      success: true, 
      message: isDone ? "タスクを完了にしました" : "タスクを未完了に戻しました" 
    });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

async function updateTaskPriority(c: Context) {
  try {
    const userId = c.get("userId");
    const taskId = c.req.param("id");
    const body = await c.req.json();
    
    if (body.priority === undefined) {
      return c.json({ success: false, error: "priority is required" }, 400);
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { error } = await supabase
      .from("blocks")
      .update({ priority: body.priority })
      .eq("id", taskId)
      .eq("user_id", userId)
      .eq("category", "task");
    
    if (error) {
      throw new Error(`Failed to update priority: ${error.message}`);
    }
    
    return c.json({ success: true, message: "優先度を更新しました" });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

// Schedules
async function listSchedules(c: Context) {
  try {
    const userId = c.get("userId");
    const { include_past, start_date, end_date, limit } = c.req.query();
    
    const data = await getBlocksHelper(userId, "schedule", {
      include_past: include_past === "true",
      start_date,
      end_date,
      limit: limit ? parseInt(limit) : undefined,
    });
    
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

async function addSchedule(c: Context) {
  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    
    if (!body.title || !body.starts_at) {
      return c.json({ success: false, error: "title and starts_at are required" }, 400);
    }
    
    const content = body.details 
      ? `${body.title}\n\n${body.details}` 
      : body.title;
    
    const block = await addBlockHelper(userId, {
      category: "schedule",
      content,
      occurred_at: body.starts_at,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      is_all_day: body.is_all_day,
      tag: body.tag,
    });
    
    return c.json({ 
      success: true, 
      data: { id: block.id, message: "予定を追加しました" } 
    });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

// Memos
async function listMemos(c: Context) {
  try {
    const userId = c.get("userId");
    const { date, start_date, end_date, tag, limit } = c.req.query();
    
    const data = await getBlocksHelper(userId, "thought", {
      date,
      start_date,
      end_date,
      tag,
      limit: limit ? parseInt(limit) : undefined,
    });
    
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

async function addMemo(c: Context) {
  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    
    if (!body.content) {
      return c.json({ success: false, error: "content is required" }, 400);
    }
    
    const block = await addBlockHelper(userId, {
      category: "thought",
      content: body.content,
      tag: body.tag,
    });
    
    return c.json({ 
      success: true, 
      data: { id: block.id, message: "メモを追加しました" } 
    });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

// Read Later
async function listReadLater(c: Context) {
  try {
    const userId = c.get("userId");
    const { filter, tag, limit } = c.req.query();
    
    const data = await getBlocksHelper(userId, "read_later", {
      filter: filter || "all",
      tag,
      limit: limit ? parseInt(limit) : undefined,
    });
    
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

async function addReadLater(c: Context) {
  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    
    if (!body.url) {
      return c.json({ success: false, error: "url is required" }, 400);
    }
    
    const content = body.comment 
      ? `${body.url}\n\n${body.comment}` 
      : body.url;
    
    const block = await addBlockHelper(userId, {
      category: "read_later",
      content,
      tag: body.tag,
    });
    
    return c.json({ 
      success: true, 
      data: { id: block.id, message: "あとでリストに追加しました" } 
    });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

async function markAsReadHandler(c: Context) {
  try {
    const userId = c.get("userId");
    const blockId = c.req.param("id");
    const body = await c.req.json();
    const isRead = body.is_read !== false;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { error } = await supabase
      .from("blocks")
      .update({ 
        is_done: isRead,
        done_at: isRead ? new Date().toISOString() : null
      })
      .eq("id", blockId)
      .eq("user_id", userId)
      .eq("category", "read_later");
    
    if (error) {
      throw new Error(`Failed to update read status: ${error.message}`);
    }
    
    return c.json({ 
      success: true, 
      message: isRead ? "既読にしました" : "未読に戻しました" 
    });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

// Search
async function search(c: Context) {
  try {
    const userId = c.get("userId");
    const { query: searchQuery, category, tag, limit } = c.req.query();
    
    if (!searchQuery) {
      return c.json({ success: false, error: "query is required" }, 400);
    }
    
    const data = await searchBlocksHelper(userId, {
      query: searchQuery,
      category,
      tag,
      limit: limit ? parseInt(limit) : undefined,
    });
    
    return c.json({ success: true, data });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

// Entry
async function getEntryHandler(c: Context) {
  try {
    const userId = c.get("userId");
    const date = c.req.param("date");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();
    
    if (error) {
      throw new Error(`Failed to fetch entry: ${error.message}`);
    }
    
    if (!data) {
      return c.json({ success: true, data: null, message: "エントリーが見つかりません" });
    }

    const formattedContent = await expandPhotoMarkersForContent(userId, data.formatted_content);
    
    return c.json({ success: true, data: { ...data, formatted_content: formattedContent } });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

// Block Update (generic)
async function updateBlock(c: Context) {
  try {
    const userId = c.get("userId");
    const blockId = c.req.param("id");
    const body = await c.req.json();
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // 許可するフィールドのみ更新
    const updates: Record<string, unknown> = {};
    if (body.content !== undefined) updates.content = body.content;
    if (body.tag !== undefined) updates.tag = body.tag;
    if (body.occurred_at !== undefined) updates.occurred_at = body.occurred_at;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.is_done !== undefined) {
      updates.is_done = body.is_done;
      updates.done_at = body.is_done ? new Date().toISOString() : null;
    }
    if (body.starts_at !== undefined) updates.starts_at = body.starts_at;
    if (body.ends_at !== undefined) updates.ends_at = body.ends_at;
    if (body.is_all_day !== undefined) updates.is_all_day = body.is_all_day;
    if (body.due_at !== undefined) updates.due_at = body.due_at;
    if (body.due_all_day !== undefined) updates.due_all_day = body.due_all_day;
    
    if (Object.keys(updates).length === 0) {
      return c.json({ success: false, error: "No valid fields to update" }, 400);
    }
    
    const { error } = await supabase
      .from("blocks")
      .update(updates)
      .eq("id", blockId)
      .eq("user_id", userId);
    
    if (error) {
      throw new Error(`Failed to update block: ${error.message}`);
    }
    
    return c.json({ success: true, message: "ブロックを更新しました" });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

type ImageReferenceMapping = {
  flowlog_block_id: string;
  flowlog_image_index: number;
  source_url: string;
  image_url: string;
};

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\/[^\s]+$/.test(value);
}

function replaceEntryPhotoReferences(
  content: string | null,
  mappings: ImageReferenceMapping[],
  finalImagesByBlock: Map<string, string[]>,
): string | null {
  if (!content) return content;
  let updated = content;

  for (const mapping of mappings) {
    updated = updated.replaceAll(`{{PHOTO:${mapping.source_url}}}`, `{{PHOTO:${mapping.image_url}}}`);
  }

  for (const blockId of new Set(mappings.map((mapping) => mapping.flowlog_block_id))) {
    const marker = new RegExp(`\\{\\{PHOTO:${blockId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}:\\d+\\}\\}`, "g");
    const replacement = (finalImagesByBlock.get(blockId) || [])
      .filter(isHttpUrl)
      .map((url) => `{{PHOTO:${url}}}`)
      .join("\n");
    if (replacement) updated = updated.replace(marker, replacement);
  }

  return updated;
}

// Safely migrate known image slots. The complete batch is validated before any write,
// and a repeated request is a no-op when every slot already contains image_url.
async function migrateImageReferences(c: Context) {
  try {
    const userId = c.get("userId");
    const body = await c.req.json();
    const mappings = body.mappings as ImageReferenceMapping[];
    const startDate = body.start_date;
    const endDate = body.end_date;
    const dryRun = body.dry_run !== false;

    if (!Array.isArray(mappings) || mappings.length === 0 || mappings.length > 500) {
      return c.json({ success: false, error: "mappings must contain 1 to 500 items" }, 400);
    }
    if (typeof startDate !== "string" || typeof endDate !== "string" || startDate > endDate) {
      return c.json({ success: false, error: "valid start_date and end_date are required" }, 400);
    }

    const slotKeys = new Set<string>();
    for (const mapping of mappings) {
      const slotKey = `${mapping.flowlog_block_id}:${mapping.flowlog_image_index}`;
      if (!/^[0-9a-f-]{36}$/i.test(mapping.flowlog_block_id) ||
          !Number.isInteger(mapping.flowlog_image_index) || mapping.flowlog_image_index < 1 || mapping.flowlog_image_index > 5 ||
          !isHttpUrl(mapping.source_url) || !isHttpUrl(mapping.image_url) || mapping.source_url === mapping.image_url ||
          slotKeys.has(slotKey)) {
        return c.json({ success: false, error: `invalid or duplicate mapping: ${slotKey}` }, 400);
      }
      slotKeys.add(slotKey);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const blockIds = [...new Set(mappings.map((mapping) => mapping.flowlog_block_id))];
    const { data: blocks, error: blockError } = await supabase
      .from("blocks")
      .select("id, entry_id, images, entries!inner(id, date, formatted_content)")
      .eq("user_id", userId)
      .in("id", blockIds);
    if (blockError) throw new Error(`Failed to fetch migration blocks: ${blockError.message}`);

    const blocksById = new Map((blocks || []).map((block: Record<string, unknown>) => [block.id as string, block]));
    const errors: Array<Record<string, unknown>> = [];
    const finalImagesByBlock = new Map<string, string[]>();
    let alreadyMigratedImages = 0;

    for (const blockId of blockIds) {
      const block = blocksById.get(blockId);
      if (!block) {
        errors.push({ block_id: blockId, reason: "block_not_found" });
        continue;
      }
      const entryValue = block.entries as Record<string, unknown> | Record<string, unknown>[];
      const entry = Array.isArray(entryValue) ? entryValue[0] : entryValue;
      const entryDate = entry?.date as string | undefined;
      if (!entryDate || entryDate < startDate || entryDate > endDate) {
        errors.push({ block_id: blockId, reason: "outside_date_range", entry_date: entryDate });
        continue;
      }
      const images = [...((block.images as string[] | null) || [])];
      for (const mapping of mappings.filter((item) => item.flowlog_block_id === blockId)) {
        const index = mapping.flowlog_image_index - 1;
        const current = images[index];
        if (current === mapping.image_url) {
          alreadyMigratedImages += 1;
        } else if (current === mapping.source_url) {
          images[index] = mapping.image_url;
        } else {
          errors.push({
            block_id: blockId,
            image_index: mapping.flowlog_image_index,
            reason: "source_url_mismatch",
            expected: mapping.source_url,
            actual: current ?? null,
          });
        }
      }
      finalImagesByBlock.set(blockId, images);
    }

    if (errors.length > 0) {
      return c.json({ success: false, error: "migration validation failed", mismatches: errors }, 409);
    }

    const blockBackups: Array<Record<string, unknown>> = [];
    const entryPlans = new Map<string, { id: string; before: string | null; after: string | null; mappings: ImageReferenceMapping[] }>();
    let updatedImages = 0;

    for (const blockId of blockIds) {
      const block = blocksById.get(blockId)!;
      const before = [...((block.images as string[] | null) || [])];
      const after = finalImagesByBlock.get(blockId)!;
      const blockMappings = mappings.filter((mapping) => mapping.flowlog_block_id === blockId);
      const changed = before.some((url, index) => url !== after[index]);
      updatedImages += blockMappings.filter((mapping) => before[mapping.flowlog_image_index - 1] === mapping.source_url).length;
      blockBackups.push({ id: blockId, entry_id: block.entry_id, images: before, after_images: after, changed });

      const entryValue = block.entries as Record<string, unknown> | Record<string, unknown>[];
      const entry = Array.isArray(entryValue) ? entryValue[0] : entryValue;
      const entryId = entry.id as string;
      const existing = entryPlans.get(entryId);
      if (existing) {
        existing.mappings.push(...blockMappings);
      } else {
        entryPlans.set(entryId, {
          id: entryId,
          before: (entry.formatted_content as string | null) ?? null,
          after: null,
          mappings: [...blockMappings],
        });
      }
    }

    for (const plan of entryPlans.values()) {
      plan.after = replaceEntryPhotoReferences(plan.before, plan.mappings, finalImagesByBlock);
    }

    if (!dryRun) {
      for (const backup of blockBackups) {
        if (!backup.changed) continue;
        const { error } = await supabase.from("blocks").update({ images: backup.after_images }).eq("id", backup.id).eq("user_id", userId);
        if (error) throw new Error(`Failed to update block ${backup.id}: ${error.message}`);
      }
      for (const plan of entryPlans.values()) {
        if (plan.before === plan.after) continue;
        const { error } = await supabase.from("entries").update({ formatted_content: plan.after }).eq("id", plan.id).eq("user_id", userId);
        if (error) throw new Error(`Failed to update entry ${plan.id}: ${error.message}`);
      }
    }

    const entryBackups = [...entryPlans.values()].map(({ id, before, after }) => ({ id, formatted_content: before, after_formatted_content: after, changed: before !== after }));
    return c.json({
      success: true,
      dry_run: dryRun,
      counts: {
        mappings: mappings.length,
        blocks: blockIds.length,
        updated_blocks: blockBackups.filter((item) => item.changed).length,
        updated_images: updatedImages,
        already_migrated_images: alreadyMigratedImages,
        entries: entryBackups.length,
        updated_entries: entryBackups.filter((item) => item.changed).length,
      },
      backups: { blocks: blockBackups, entries: entryBackups },
    });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

// Block Delete
async function deleteBlock(c: Context) {
  try {
    const userId = c.get("userId");
    const blockId = c.req.param("id");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("id", blockId)
      .eq("user_id", userId);
    
    if (error) {
      throw new Error(`Failed to delete block: ${error.message}`);
    }
    
    return c.json({ success: true, message: "ブロックを削除しました" });
  } catch (error) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
}

Deno.serve(app.fetch);
