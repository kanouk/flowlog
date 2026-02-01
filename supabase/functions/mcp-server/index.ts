import { Hono, type Context } from "jsr:@hono/hono@^4.6.5";
import { cors } from "jsr:@hono/hono@^4.6.5/cors";
import { McpServer, StreamableHttpTransport } from "npm:mcp-lite@^0.10.0";
import { createClient } from "npm:@supabase/supabase-js@^2.89.0";

const app = new Hono();

// CORS設定
app.use("/*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "mcp-session-id"],
}));

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ユーザー認証（APIトークンから）
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

// ヘルパー関数: 日付を取得
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

// ヘルパー関数: ブロック取得
async function getBlocks(
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

// ヘルパー関数: ブロック追加
async function addBlock(
  userId: string,
  block: {
    category: string;
    content: string;
    tag?: string;
    occurred_at?: string;
    starts_at?: string;
    ends_at?: string;
    is_all_day?: boolean;
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
  
  const { data, error } = await supabase
    .from("blocks")
    .insert({
      user_id: userId,
      entry_id: entry.id,
      category: block.category,
      content: block.content,
      tag: block.tag,
      occurred_at: block.occurred_at || new Date().toISOString(),
      starts_at: block.starts_at,
      ends_at: block.ends_at,
      is_all_day: block.is_all_day || false,
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to add block: ${error.message}`);
  }
  
  return data;
}

// ヘルパー関数: タスク状態更新
async function updateTaskStatus(userId: string, taskId: string, isDone: boolean) {
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
}

// ヘルパー関数: 既読状態更新
async function markAsRead(userId: string, blockId: string, isRead: boolean) {
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
}

// ヘルパー関数: 検索
async function searchBlocks(
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

// ヘルパー関数: エントリー取得
async function getEntry(userId: string, date: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data, error } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .single();
  
  if (error) {
    return null;
  }
  
  return data;
}

// MCPサーバーを作成する関数
function createMcpServer(userId: string) {
  const mcpServer = new McpServer({
    name: "flowlog",
    version: "1.0.0",
  });

  // 出来事一覧取得
  mcpServer.tool({
    name: "list_events",
    description: "出来事（event）一覧を取得します",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "日付 (YYYY-MM-DD)。省略時は全期間" },
        start_date: { type: "string", description: "開始日 (YYYY-MM-DD)" },
        end_date: { type: "string", description: "終了日 (YYYY-MM-DD)" },
        tag: { type: "string", description: "タグでフィルタ" },
        limit: { type: "number", description: "取得件数 (デフォルト: 50)" },
      },
    },
    handler: async (args: Record<string, unknown>) => {
      const events = await getBlocks(userId, "event", args as Record<string, string | number | boolean | undefined>);
      return {
        content: [{ type: "text", text: JSON.stringify(events, null, 2) }],
      };
    },
  });

  // 出来事追加
  mcpServer.tool({
    name: "add_event",
    description: "出来事を追加します",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "内容" },
        occurred_at: { type: "string", description: "発生日時 (ISO 8601)。省略時は現在" },
        tag: { type: "string", description: "タグ" },
      },
      required: ["content"],
    },
    handler: async (args: Record<string, unknown>) => {
      const block = await addBlock(userId, {
        category: "event",
        content: args.content as string,
        occurred_at: args.occurred_at as string | undefined,
        tag: args.tag as string | undefined,
      });
      return {
        content: [{ type: "text", text: `出来事を追加しました: ${block.id}` }],
      };
    },
  });

  // タスク一覧取得
  mcpServer.tool({
    name: "list_tasks",
    description: "タスク一覧を取得します",
    inputSchema: {
      type: "object",
      properties: {
        include_completed: { type: "boolean", description: "完了済みも含めるか (デフォルト: false)" },
        tag: { type: "string", description: "タグでフィルタ" },
        limit: { type: "number", description: "取得件数 (デフォルト: 50)" },
      },
    },
    handler: async (args: Record<string, unknown>) => {
      const tasks = await getBlocks(userId, "task", args as Record<string, string | number | boolean | undefined>);
      return {
        content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
      };
    },
  });

  // タスク追加
  mcpServer.tool({
    name: "add_task",
    description: "タスクを追加します",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "タスクの内容" },
        tag: { type: "string", description: "タグ" },
      },
      required: ["content"],
    },
    handler: async (args: Record<string, unknown>) => {
      const block = await addBlock(userId, {
        category: "task",
        content: args.content as string,
        tag: args.tag as string | undefined,
      });
      return {
        content: [{ type: "text", text: `タスクを追加しました: ${block.id}` }],
      };
    },
  });

  // タスク完了
  mcpServer.tool({
    name: "complete_task",
    description: "タスクを完了/未完了にします",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "タスクのID" },
        is_done: { type: "boolean", description: "完了にするか (デフォルト: true)" },
      },
      required: ["task_id"],
    },
    handler: async (args: Record<string, unknown>) => {
      const isDone = args.is_done !== false;
      await updateTaskStatus(userId, args.task_id as string, isDone);
      return {
        content: [{ type: "text", text: isDone ? "タスクを完了にしました" : "タスクを未完了に戻しました" }],
      };
    },
  });

  // 予定一覧取得
  mcpServer.tool({
    name: "list_schedules",
    description: "予定一覧を取得します",
    inputSchema: {
      type: "object",
      properties: {
        include_past: { type: "boolean", description: "過去の予定も含めるか (デフォルト: false)" },
        start_date: { type: "string", description: "開始日 (YYYY-MM-DD)" },
        end_date: { type: "string", description: "終了日 (YYYY-MM-DD)" },
        limit: { type: "number", description: "取得件数 (デフォルト: 50)" },
      },
    },
    handler: async (args: Record<string, unknown>) => {
      const schedules = await getBlocks(userId, "schedule", args as Record<string, string | number | boolean | undefined>);
      return {
        content: [{ type: "text", text: JSON.stringify(schedules, null, 2) }],
      };
    },
  });

  // 予定追加
  mcpServer.tool({
    name: "add_schedule",
    description: "予定を追加します",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "予定のタイトル" },
        details: { type: "string", description: "詳細" },
        starts_at: { type: "string", description: "開始日時 (ISO 8601)" },
        ends_at: { type: "string", description: "終了日時 (ISO 8601)" },
        is_all_day: { type: "boolean", description: "終日予定か (デフォルト: false)" },
        tag: { type: "string", description: "タグ" },
      },
      required: ["title", "starts_at"],
    },
    handler: async (args: Record<string, unknown>) => {
      const content = args.details 
        ? `${args.title}\n${args.details}` 
        : args.title as string;
      const block = await addBlock(userId, {
        category: "schedule",
        content,
        starts_at: args.starts_at as string,
        ends_at: args.ends_at as string | undefined,
        is_all_day: args.is_all_day as boolean | undefined,
        tag: args.tag as string | undefined,
      });
      return {
        content: [{ type: "text", text: `予定を追加しました: ${block.id}` }],
      };
    },
  });

  // メモ一覧取得
  mcpServer.tool({
    name: "list_memos",
    description: "メモ一覧を取得します",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "日付 (YYYY-MM-DD)" },
        start_date: { type: "string", description: "開始日 (YYYY-MM-DD)" },
        end_date: { type: "string", description: "終了日 (YYYY-MM-DD)" },
        tag: { type: "string", description: "タグでフィルタ" },
        limit: { type: "number", description: "取得件数 (デフォルト: 50)" },
      },
    },
    handler: async (args: Record<string, unknown>) => {
      const memos = await getBlocks(userId, "thought", args as Record<string, string | number | boolean | undefined>);
      return {
        content: [{ type: "text", text: JSON.stringify(memos, null, 2) }],
      };
    },
  });

  // メモ追加
  mcpServer.tool({
    name: "add_memo",
    description: "メモを追加します",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "メモの内容" },
        tag: { type: "string", description: "タグ" },
      },
      required: ["content"],
    },
    handler: async (args: Record<string, unknown>) => {
      const block = await addBlock(userId, {
        category: "thought",
        content: args.content as string,
        tag: args.tag as string | undefined,
      });
      return {
        content: [{ type: "text", text: `メモを追加しました: ${block.id}` }],
      };
    },
  });

  // あとで読む一覧取得
  mcpServer.tool({
    name: "list_read_later",
    description: "あとで読むリストを取得します",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["all", "unread", "read"], description: "フィルタ (デフォルト: all)" },
        tag: { type: "string", description: "タグでフィルタ" },
        limit: { type: "number", description: "取得件数 (デフォルト: 50)" },
      },
    },
    handler: async (args: Record<string, unknown>) => {
      const items = await getBlocks(userId, "read_later", args as Record<string, string | number | boolean | undefined>);
      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      };
    },
  });

  // あとで読む追加
  mcpServer.tool({
    name: "add_read_later",
    description: "あとで読むリストにURLを追加します",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "保存するURL" },
        comment: { type: "string", description: "コメント" },
        tag: { type: "string", description: "タグ" },
      },
      required: ["url"],
    },
    handler: async (args: Record<string, unknown>) => {
      const content = args.comment 
        ? `${args.url}\n${args.comment}` 
        : args.url as string;
      const block = await addBlock(userId, {
        category: "read_later",
        content,
        tag: args.tag as string | undefined,
      });
      return {
        content: [{ type: "text", text: `あとで読むに追加しました: ${block.id}` }],
      };
    },
  });

  // 既読/未読切替
  mcpServer.tool({
    name: "mark_as_read",
    description: "あとで読むアイテムを既読/未読にします",
    inputSchema: {
      type: "object",
      properties: {
        block_id: { type: "string", description: "ブロックのID" },
        is_read: { type: "boolean", description: "既読にするか (デフォルト: true)" },
      },
      required: ["block_id"],
    },
    handler: async (args: Record<string, unknown>) => {
      const isRead = args.is_read !== false;
      await markAsRead(userId, args.block_id as string, isRead);
      return {
        content: [{ type: "text", text: isRead ? "既読にしました" : "未読に戻しました" }],
      };
    },
  });

  // 横断検索
  mcpServer.tool({
    name: "search_blocks",
    description: "全カテゴリを横断してキーワード検索します",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "検索キーワード" },
        category: { type: "string", enum: ["event", "task", "schedule", "thought", "read_later"], description: "カテゴリでフィルタ" },
        tag: { type: "string", description: "タグでフィルタ" },
        limit: { type: "number", description: "取得件数 (デフォルト: 20)" },
      },
      required: ["query"],
    },
    handler: async (args: Record<string, unknown>) => {
      const results = await searchBlocks(userId, args as { query: string; category?: string; tag?: string; limit?: number });
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  });

  // 日記取得
  mcpServer.tool({
    name: "get_entry",
    description: "指定日の日記（AI整形版）を取得します",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "日付 (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
    handler: async (args: Record<string, unknown>) => {
      const entry = await getEntry(userId, args.date as string);
      if (!entry) {
        return { content: [{ type: "text", text: "日記がありません" }] };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            date: entry.date,
            summary: entry.summary,
            formatted_content: entry.formatted_content,
            score: entry.score,
            score_details: entry.score_details,
          }, null, 2),
        }],
      };
    },
  });

  return mcpServer;
}

// MCPトランスポート
const transport = new StreamableHttpTransport();

// ヘルスチェック
app.get("/mcp-server/health", (c: Context) => {
  return c.json({ status: "ok", version: "1.0.0" });
});

// MCPエンドポイント
app.all("/mcp-server/mcp/*", async (c: Context) => {
  const authHeader = c.req.header("Authorization");
  const userId = await authenticateUser(authHeader);
  
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  
  const mcpServer = createMcpServer(userId);
  
  // パスを調整
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/mcp-server\/mcp/, "/mcp");
  const modifiedRequest = new Request(url.toString(), c.req.raw);
  
  return await transport.handleRequest(modifiedRequest, mcpServer);
});

// フォールバック
app.all("*", (c: Context) => {
  return c.json({ error: "Not Found", path: c.req.path }, 404);
});

Deno.serve(app.fetch);
