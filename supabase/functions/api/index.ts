import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

// ベースパスを設定（Edge Functionのパス）
const app = new Hono().basePath("/api");

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ===== CORS =====
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
  
  // 最終使用日時を更新
  await supabase
    .from("user_api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);
  
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

async function authMiddleware(c: any, next: () => Promise<void>) {
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

async function authMiddlewareInline(c: any, next: () => Promise<void>) {
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
  
  // あとで読む用: フィルタ
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
  
  const insertData: Record<string, any> = {
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
        description: "あとで読むリストを取得",
        query: { filter: "string? (all|read|unread, default all)", tag: "string?", limit: "number?" },
      },
      {
        method: "POST", path: "/read-later",
        description: "あとで読むリストに追加",
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
        description: "指定日のエントリーを取得",
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

// Events
async function listEvents(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

async function addEvent(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

// Tasks
async function listTasks(c: any) {
  try {
    const userId = c.get("userId");
    const { include_completed, tag, limit } = c.req.query();
    
    const data = await getBlocksHelper(userId, "task", {
      include_completed: include_completed === "true",
      tag,
      limit: limit ? parseInt(limit) : undefined,
    });
    
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

async function addTask(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

async function completeTask(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

async function updateTaskPriority(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

// Schedules
async function listSchedules(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

async function addSchedule(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

// Memos
async function listMemos(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

async function addMemo(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

// Read Later
async function listReadLater(c: any) {
  try {
    const userId = c.get("userId");
    const { filter, tag, limit } = c.req.query();
    
    const data = await getBlocksHelper(userId, "read_later", {
      filter: filter || "all",
      tag,
      limit: limit ? parseInt(limit) : undefined,
    });
    
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

async function addReadLater(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

async function markAsReadHandler(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

// Search
async function search(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

// Entry
async function getEntryHandler(c: any) {
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
    
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

// Block Update (generic)
async function updateBlock(c: any) {
  try {
    const userId = c.get("userId");
    const blockId = c.req.param("id");
    const body = await c.req.json();
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // 許可するフィールドのみ更新
    const updates: Record<string, any> = {};
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

// Block Delete
async function deleteBlock(c: any) {
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
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
}

Deno.serve(app.fetch);
