

# APIキー管理の独立化

## 概要

`user_ai_models` テーブルから `api_key` を分離し、新テーブル `user_ai_api_keys` で名前付きAPIキーを独立管理する。モデルは `api_key_id` でキーを参照する。既存データはクリアして問題ない（ユーザー許可済み）。

## データベース変更

### 新テーブル: `user_ai_api_keys`
- `id` (uuid PK), `user_id`, `provider` (openai/anthropic/google), `name` (表示名), `api_key` (実キー), `created_at`, `updated_at`
- RLS: `auth.uid() = user_id` で全CRUD
- UNIQUE(`user_id`, `provider`, `name`)

### `user_ai_models` 変更
- `api_key` カラムを DROP
- `api_key_id uuid REFERENCES user_ai_api_keys(id) ON DELETE SET NULL` を追加
- 既存データ TRUNCATE

### RPC更新
- **新規** `get_user_ai_api_keys_safe()`: `api_key` を隠し `key_hint`（末尾4文字）を返す
- **更新** `get_user_ai_models_safe()`: `has_api_key` の代わりに `api_key_id` + JOINでキー名を返す
- **更新** `get_feature_ai_config()`: `user_ai_api_keys` をJOINしてキーを解決

## フロント変更

### 新規: `src/hooks/useAIApiKeys.ts`
- `user_ai_api_keys` のCRUD（RPC経由で安全に取得）
- 接続テスト機能

### 更新: `src/hooks/useAIModels.ts`
- `AIModelSafe` から `has_api_key` → `api_key_id`, `api_key_name` に変更
- `createModel`/`updateModel` で `api_key_id` を受け取る

### 更新: `src/components/settings/AIModelManagementSection.tsx`
- **上部にAPIキー管理セクション追加**: プロバイダー別にキーの一覧・登録・編集・削除・接続テスト
- **モデル登録/編集ダイアログ**: APIキー直接入力 → 登録済みキーのドロップダウン選択に変更
- キー未登録時は案内メッセージ表示

### 更新: `supabase/functions/test-ai-connection/index.ts`
- `api_key_id` ベースのテストモード追加
- `model_id` テストは `api_key_id` 経由でキー解決に変更

## 変更対象ファイル

| ファイル | 変更 |
|---|---|
| Migration SQL | `user_ai_api_keys` 作成、`user_ai_models` 変更、RPC更新 |
| `src/hooks/useAIApiKeys.ts` (新規) | APIキーCRUD |
| `src/hooks/useAIModels.ts` | `api_key_id` 対応に変更 |
| `src/components/settings/AIModelManagementSection.tsx` | APIキー管理UI追加、モデルフォーム変更 |
| `supabase/functions/test-ai-connection/index.ts` | `api_key_id` テスト対応 |

