

# REST API の実装

## 概要
MCPサーバーと同じ機能を提供するREST APIを新規Edge Functionとして実装します。MCPはJSON-RPCベースですが、REST APIはHTTPメソッドとパスベースの直感的なインターフェースを提供します。

---

## APIデザイン

### 認証
MCPと同じAPIトークン認証を使用：
```
Authorization: Bearer <your-api-token>
```

### ベースURL
```
https://wdvwnbeofakzihmjacko.supabase.co/functions/v1/api
```

---

## エンドポイント一覧

| メソッド | パス | 説明 | MCPツール相当 |
|---------|------|------|--------------|
| `GET` | `/events` | 出来事一覧 | list_events |
| `POST` | `/events` | 出来事追加 | add_event |
| `GET` | `/tasks` | タスク一覧 | list_tasks |
| `POST` | `/tasks` | タスク追加 | add_task |
| `PATCH` | `/tasks/:id/complete` | タスク完了/未完了 | complete_task |
| `GET` | `/schedules` | 予定一覧 | list_schedules |
| `POST` | `/schedules` | 予定追加 | add_schedule |
| `GET` | `/memos` | メモ一覧 | list_memos |
| `POST` | `/memos` | メモ追加 | add_memo |
| `GET` | `/read-later` | あとで読む一覧 | list_read_later |
| `POST` | `/read-later` | あとで読む追加 | add_read_later |
| `PATCH` | `/read-later/:id/read` | 既読/未読 | mark_as_read |
| `GET` | `/search` | 検索 | search_blocks |
| `GET` | `/entries/:date` | 日記取得 | get_entry |
| `GET` | `/health` | ヘルスチェック | - |

---

## リクエスト/レスポンス例

### 出来事一覧
```bash
GET /api/events?date=2026-02-07&limit=20

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "content": "...",
      "occurred_at": "...",
      "tag": "..."
    }
  ]
}
```

### タスク追加
```bash
POST /api/tasks
Content-Type: application/json

{
  "content": "買い物に行く",
  "tag": "personal",
  "priority": 2
}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "message": "タスクを追加しました"
  }
}
```

### タスク完了
```bash
PATCH /api/tasks/123e4567-e89b-12d3-a456-426614174000/complete
Content-Type: application/json

{
  "is_done": true
}

Response:
{
  "success": true,
  "message": "タスクを完了にしました"
}
```

### 検索
```bash
GET /api/search?query=会議&category=event&limit=10

Response:
{
  "success": true,
  "data": [...]
}
```

---

## 実装方針

### 1. 新規Edge Function: `supabase/functions/api/index.ts`

### 2. コードの再利用
MCPサーバーから以下のヘルパー関数をそのまま利用：
- `authenticateUser` - APIトークン認証
- `getBlocks` - ブロック取得
- `addBlock` - ブロック追加
- `updateTaskStatus` - タスク状態更新
- `markAsRead` - 既読状態更新
- `searchBlocks` - 検索
- `getEntry` - エントリー取得

### 3. Honoルーターを使用
```typescript
import { Hono } from "hono";

const app = new Hono();

// Events
app.get("/events", async (c) => { ... });
app.post("/events", async (c) => { ... });

// Tasks
app.get("/tasks", async (c) => { ... });
app.post("/tasks", async (c) => { ... });
app.patch("/tasks/:id/complete", async (c) => { ... });

// ... etc
```

---

## ファイル構成

```text
supabase/functions/
├── api/
│   └── index.ts     # REST API（新規）
└── mcp-server/
    └── index.ts     # 既存MCP（変更なし）
```

---

## エラーレスポンス

```typescript
// 認証エラー
{
  "success": false,
  "error": "Unauthorized"
}

// バリデーションエラー
{
  "success": false,
  "error": "content is required"
}

// サーバーエラー
{
  "success": false,
  "error": "Failed to add block"
}
```

---

## config.toml 設定

```toml
[functions.api]
verify_jwt = false
```

---

## 追加機能（MCPにはない）

REST APIでは追加で以下も実装：

| メソッド | パス | 説明 |
|---------|------|------|
| `PATCH` | `/tasks/:id/priority` | タスク優先度変更 |
| `DELETE` | `/blocks/:id` | ブロック削除 |
| `PATCH` | `/blocks/:id` | ブロック更新 |

---

## 実装順序

1. Edge Function `api/index.ts` を作成
2. 認証ミドルウェアを実装
3. 各エンドポイントを実装
4. config.toml に設定追加
5. ヘルスチェックで動作確認

