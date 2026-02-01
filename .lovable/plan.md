

# FlowLog MCPサーバー機能追加計画（完全版）

## 概要
FlowLogの全データを外部のAIアシスタント（Claude、Cursorなど）から参照・操作できるよう、MCP (Model Context Protocol) サーバーをEdge Functionとして追加します。全5カテゴリに対応し、設定画面からAPIトークン管理ができるようにします。

---

## 提供するMCPツール一覧

### 出来事（event）

| ツール名 | 説明 | 用途例 |
|----------|------|--------|
| `list_events` | 出来事一覧取得 | 「今日あった出来事を見せて」 |
| `add_event` | 出来事追加 | 「ランチを食べたことを記録して」 |

### タスク（task）

| ツール名 | 説明 | 用途例 |
|----------|------|--------|
| `list_tasks` | タスク一覧取得 | 「未完了タスクを見せて」 |
| `add_task` | タスク追加 | 「買い物リストにミルクを追加して」 |
| `complete_task` | タスク完了 | 「○○を完了にして」 |

### 予定（schedule）

| ツール名 | 説明 | 用途例 |
|----------|------|--------|
| `list_schedules` | 予定一覧取得 | 「今週の予定を見せて」 |
| `add_schedule` | 予定追加 | 「明日15時に会議を追加して」 |

### メモ（thought）

| ツール名 | 説明 | 用途例 |
|----------|------|--------|
| `list_memos` | メモ一覧取得 | 「最近のメモを見せて」 |
| `add_memo` | メモ追加 | 「アイデアをメモして」 |

### あとで読む（read_later）

| ツール名 | 説明 | 用途例 |
|----------|------|--------|
| `list_read_later` | あとで読む一覧取得 | 「未読リストを見せて」 |
| `add_read_later` | あとで読む追加 | 「このURLを保存して」 |
| `mark_as_read` | 既読/未読切替 | 「○○を既読にして」 |

### 横断機能

| ツール名 | 説明 | 用途例 |
|----------|------|--------|
| `search_blocks` | 全カテゴリ横断検索 | 「○○に関するログを探して」 |
| `get_entry` | 日記（整形版）取得 | 「昨日の日記を見せて」 |

---

## 認証方式

ユーザーごとにAPIトークンを発行・管理し、MCPクライアントからのリクエストを認証します。

```text
1. ユーザーが設定画面でAPIトークンを生成
2. トークンをClaude/Cursorの設定に登録
3. MCPサーバーがトークンでユーザーを特定
```

---

## 技術構成

### 新規ファイル

| ファイル | 内容 |
|----------|------|
| `supabase/functions/mcp-server/index.ts` | MCPサーバー本体 |
| `supabase/functions/mcp-server/deno.json` | Deno設定 |
| `src/components/settings/McpSettingsSection.tsx` | MCP設定UI |
| `src/hooks/useApiTokens.ts` | トークン管理用フック |

### DB変更

| テーブル | カラム | 説明 |
|----------|--------|------|
| `user_api_tokens` | id, user_id, token_hash, name, created_at, last_used_at | APIトークン管理 |

---

## MCPツール実装詳細

### 出来事一覧取得 (`list_events`)

```typescript
mcp.tool("list_events", {
  description: "出来事（event）一覧を取得します",
  inputSchema: z.object({
    date: z.string().optional().describe("日付 (YYYY-MM-DD)。省略時は今日"),
    start_date: z.string().optional().describe("開始日 (YYYY-MM-DD)"),
    end_date: z.string().optional().describe("終了日 (YYYY-MM-DD)"),
    tag: z.string().optional().describe("タグでフィルタ"),
    limit: z.number().optional().default(50),
  }),
  handler: async (args, context) => {
    const events = await getBlocks(context.userId, 'event', args);
    return {
      content: [{ type: "text", text: JSON.stringify(events, null, 2) }],
    };
  },
});
```

### 出来事追加 (`add_event`)

```typescript
mcp.tool("add_event", {
  description: "出来事を追加します",
  inputSchema: z.object({
    content: z.string().describe("内容"),
    occurred_at: z.string().optional().describe("発生日時 (ISO 8601)。省略時は現在"),
    tag: z.string().optional().describe("タグ"),
  }),
  handler: async (args, context) => {
    const block = await addBlock(context.userId, {
      category: 'event',
      content: args.content,
      occurred_at: args.occurred_at,
      tag: args.tag,
    });
    return {
      content: [{ type: "text", text: `出来事を追加しました: ${block.id}` }],
    };
  },
});
```

### タスク一覧取得 (`list_tasks`)

```typescript
mcp.tool("list_tasks", {
  description: "タスク一覧を取得します",
  inputSchema: z.object({
    include_completed: z.boolean().optional().default(false).describe("完了済みも含めるか"),
    tag: z.string().optional().describe("タグでフィルタ"),
    limit: z.number().optional().default(50),
  }),
  handler: async (args, context) => {
    const tasks = await getTasks(context.userId, args);
    return {
      content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
    };
  },
});
```

### タスク追加 (`add_task`)

```typescript
mcp.tool("add_task", {
  description: "タスクを追加します",
  inputSchema: z.object({
    content: z.string().describe("タスクの内容"),
    tag: z.string().optional().describe("タグ"),
  }),
  handler: async (args, context) => {
    const block = await addBlock(context.userId, {
      category: 'task',
      content: args.content,
      tag: args.tag,
    });
    return {
      content: [{ type: "text", text: `タスクを追加しました: ${block.id}` }],
    };
  },
});
```

### タスク完了 (`complete_task`)

```typescript
mcp.tool("complete_task", {
  description: "タスクを完了/未完了にします",
  inputSchema: z.object({
    task_id: z.string().describe("タスクのID"),
    is_done: z.boolean().optional().default(true).describe("完了にするか"),
  }),
  handler: async (args, context) => {
    await updateTaskStatus(context.userId, args.task_id, args.is_done);
    return {
      content: [{ type: "text", text: args.is_done ? "タスクを完了にしました" : "タスクを未完了に戻しました" }],
    };
  },
});
```

### 予定一覧取得 (`list_schedules`)

```typescript
mcp.tool("list_schedules", {
  description: "予定一覧を取得します",
  inputSchema: z.object({
    include_past: z.boolean().optional().default(false).describe("過去の予定も含めるか"),
    start_date: z.string().optional().describe("開始日 (YYYY-MM-DD)"),
    end_date: z.string().optional().describe("終了日 (YYYY-MM-DD)"),
    limit: z.number().optional().default(50),
  }),
  handler: async (args, context) => {
    const schedules = await getSchedules(context.userId, args);
    return {
      content: [{ type: "text", text: JSON.stringify(schedules, null, 2) }],
    };
  },
});
```

### 予定追加 (`add_schedule`)

```typescript
mcp.tool("add_schedule", {
  description: "予定を追加します",
  inputSchema: z.object({
    title: z.string().describe("予定のタイトル"),
    details: z.string().optional().describe("詳細"),
    starts_at: z.string().describe("開始日時 (ISO 8601)"),
    ends_at: z.string().optional().describe("終了日時 (ISO 8601)"),
    is_all_day: z.boolean().optional().default(false).describe("終日予定か"),
    tag: z.string().optional().describe("タグ"),
  }),
  handler: async (args, context) => {
    const content = args.details ? `${args.title}\n${args.details}` : args.title;
    const schedule = await addBlock(context.userId, {
      category: 'schedule',
      content,
      starts_at: args.starts_at,
      ends_at: args.ends_at,
      is_all_day: args.is_all_day,
      tag: args.tag,
    });
    return {
      content: [{ type: "text", text: `予定を追加しました: ${schedule.id}` }],
    };
  },
});
```

### メモ一覧取得 (`list_memos`)

```typescript
mcp.tool("list_memos", {
  description: "メモ一覧を取得します",
  inputSchema: z.object({
    date: z.string().optional().describe("日付 (YYYY-MM-DD)"),
    start_date: z.string().optional().describe("開始日 (YYYY-MM-DD)"),
    end_date: z.string().optional().describe("終了日 (YYYY-MM-DD)"),
    tag: z.string().optional().describe("タグでフィルタ"),
    limit: z.number().optional().default(50),
  }),
  handler: async (args, context) => {
    const memos = await getBlocks(context.userId, 'thought', args);
    return {
      content: [{ type: "text", text: JSON.stringify(memos, null, 2) }],
    };
  },
});
```

### メモ追加 (`add_memo`)

```typescript
mcp.tool("add_memo", {
  description: "メモを追加します",
  inputSchema: z.object({
    content: z.string().describe("メモの内容"),
    tag: z.string().optional().describe("タグ"),
  }),
  handler: async (args, context) => {
    const block = await addBlock(context.userId, {
      category: 'thought',
      content: args.content,
      tag: args.tag,
    });
    return {
      content: [{ type: "text", text: `メモを追加しました: ${block.id}` }],
    };
  },
});
```

### あとで読む一覧取得 (`list_read_later`)

```typescript
mcp.tool("list_read_later", {
  description: "あとで読むリストを取得します",
  inputSchema: z.object({
    filter: z.enum(["all", "unread", "read"]).optional().default("all"),
    tag: z.string().optional().describe("タグでフィルタ"),
    limit: z.number().optional().default(50),
  }),
  handler: async (args, context) => {
    const items = await getReadLaterItems(context.userId, args);
    return {
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
    };
  },
});
```

### あとで読む追加 (`add_read_later`)

```typescript
mcp.tool("add_read_later", {
  description: "あとで読むリストにURLを追加します",
  inputSchema: z.object({
    url: z.string().describe("保存するURL"),
    comment: z.string().optional().describe("コメント"),
    tag: z.string().optional().describe("タグ"),
  }),
  handler: async (args, context) => {
    // URLのメタデータ取得はオプション（既存のsummarize-url関数を使用可能）
    const block = await addBlock(context.userId, {
      category: 'read_later',
      content: args.comment ? `${args.url}\n${args.comment}` : args.url,
      tag: args.tag,
    });
    return {
      content: [{ type: "text", text: `あとで読むに追加しました: ${block.id}` }],
    };
  },
});
```

### 既読/未読切替 (`mark_as_read`)

```typescript
mcp.tool("mark_as_read", {
  description: "あとで読むアイテムを既読/未読にします",
  inputSchema: z.object({
    block_id: z.string().describe("ブロックのID"),
    is_read: z.boolean().optional().default(true).describe("既読にするか"),
  }),
  handler: async (args, context) => {
    await markAsRead(context.userId, args.block_id, args.is_read);
    return {
      content: [{ type: "text", text: args.is_read ? "既読にしました" : "未読に戻しました" }],
    };
  },
});
```

### 横断検索 (`search_blocks`)

```typescript
mcp.tool("search_blocks", {
  description: "全カテゴリを横断してキーワード検索します",
  inputSchema: z.object({
    query: z.string().describe("検索キーワード"),
    category: z.enum(["event", "task", "schedule", "thought", "read_later"]).optional(),
    tag: z.string().optional().describe("タグでフィルタ"),
    limit: z.number().optional().default(20),
  }),
  handler: async (args, context) => {
    const results = await searchBlocks(context.userId, args);
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  },
});
```

### 日記取得 (`get_entry`)

```typescript
mcp.tool("get_entry", {
  description: "指定日の日記（AI整形版）を取得します",
  inputSchema: z.object({
    date: z.string().describe("日付 (YYYY-MM-DD)"),
  }),
  handler: async (args, context) => {
    const entry = await getEntry(context.userId, args.date);
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
        }, null, 2) 
      }],
    };
  },
});
```

---

## 設定画面UI

設定画面に「MCP連携」セクションを追加します。

```text
設定
├── タグ管理
├── 今日の得点
├── 生成AI設定
├── MCP連携 (新規)
│   ├── 説明
│   │   └── 「MCPを使うと、Claude CodeやCursorなどの
│   │        外部AIアシスタントからFlowLogのデータに
│   │        アクセスできます」
│   ├── APIトークン管理
│   │   ├── 新しいトークンを生成（名前入力）
│   │   ├── 生成されたトークン表示（1回だけ、コピーボタン付き）
│   │   ├── トークン一覧（名前、作成日、最終使用日）
│   │   └── トークン削除
│   └── 接続方法ガイド（折りたたみ）
│       ├── 接続URL表示
│       └── Claude/Cursor設定例（コピー可能なJSON）
└── アカウント
```

---

## DBテーブル設計

```sql
CREATE TABLE public.user_api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

ALTER TABLE public.user_api_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens" ON public.user_api_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens" ON public.user_api_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens" ON public.user_api_tokens
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_user_api_tokens_hash ON public.user_api_tokens(token_hash);
CREATE INDEX idx_user_api_tokens_user_id ON public.user_api_tokens(user_id);
```

---

## MCPクライアント設定例

ユーザーがClaude CodeなどのMCPクライアントに登録する際の設定例：

```json
{
  "mcpServers": {
    "flowlog": {
      "url": "https://wdvwnbeofakzihmjacko.supabase.co/functions/v1/mcp-server/mcp",
      "transport": { "type": "streamable_http" },
      "headers": {
        "Authorization": "Bearer YOUR_API_TOKEN"
      }
    }
  }
}
```

---

## 変更対象ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `supabase/functions/mcp-server/index.ts` | MCPサーバー実装（新規） |
| `supabase/functions/mcp-server/deno.json` | Deno設定（新規） |
| `supabase/config.toml` | mcp-server関数を追加 |
| DBマイグレーション | user_api_tokensテーブル作成 |
| `src/components/settings/McpSettingsSection.tsx` | MCP設定UI（新規） |
| `src/hooks/useApiTokens.ts` | トークン管理フック（新規） |
| `src/pages/Settings.tsx` | MCP連携セクションを追加 |

---

## セキュリティ考慮事項

- APIトークンはSHA-256でハッシュ化して保存
- 生トークンはユーザーに1回だけ表示（再表示不可）
- RLSでユーザー自身のデータのみアクセス可能
- トークンごとに最終使用日時を記録
- 不要なトークンの削除機能

---

## MCPツール一覧（まとめ）

| カテゴリ | 取得 | 追加 | その他 |
|----------|------|------|--------|
| 出来事 | `list_events` | `add_event` | - |
| タスク | `list_tasks` | `add_task` | `complete_task` |
| 予定 | `list_schedules` | `add_schedule` | - |
| メモ | `list_memos` | `add_memo` | - |
| あとで読む | `list_read_later` | `add_read_later` | `mark_as_read` |
| 横断 | `search_blocks` | - | `get_entry` |

**合計: 14ツール**

