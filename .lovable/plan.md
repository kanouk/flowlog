

# REST API ドキュメント追加 + due_at 対応

## 現状
- REST API (`/api`) は既に全カテゴリのCRUDエンドポイントが実装済み
- しかし `/api/docs` エンドポントが存在しない
- Settings UI は MCP ツール一覧のみで REST API のドキュメントがない
- `addBlockHelper` と `updateBlock` に `due_at` / `due_all_day` が未反映

## 変更内容

### 1. `/api/docs` エンドポイント追加 (`supabase/functions/api/index.ts`)
- 認証不要の `GET /docs` エンドポイントを追加
- 全エンドポイントの method, path, description, パラメータ, リクエストボディをJSON形式で返す

### 2. `due_at` / `due_all_day` を API に反映 (`supabase/functions/api/index.ts`)
- `addBlockHelper`: `due_at`, `due_all_day` を受け取りinsertに含める
- `addTask`: body から `due_at`, `due_all_day` を渡す
- `updateBlock`: `due_at`, `due_all_day` を許可フィールドに追加

### 3. Settings UI に REST API セクション追加 (`McpSettingsSection.tsx`)
- 既存の「利用可能なツール」の下に「REST API」セクションを追加
- Base URL 表示 + コピーボタン
- 主要エンドポイント一覧（GET/POST/PATCH/DELETE）
- curl サンプル（認証ヘッダー付き）
- `/api/docs` へのリンク

### 変更ファイル
| ファイル | 内容 |
|---|---|
| `supabase/functions/api/index.ts` | `/docs` エンドポイント追加 + `due_at`対応 |
| `src/components/settings/McpSettingsSection.tsx` | REST APIドキュメントセクション追加 |

