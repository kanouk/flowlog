
# APIキーテーブル・カラム欠落の修正

## 問題
前回のマイグレーションに `user_ai_api_keys` テーブル作成と `user_ai_models` への `api_key_id` カラム追加が含まれていなかった。RPCだけが更新され、参照先が存在しない状態。

## 修正内容

### 新規マイグレーション1本で以下を実行:

1. **`user_ai_api_keys` テーブル作成**
   - `id`, `user_id`, `provider`, `name`, `api_key`, `created_at`, `updated_at`
   - UNIQUE(`user_id`, `provider`, `name`)
   - RLS有効化 + auth.uid() = user_id の CRUD ポリシー

2. **`user_ai_models` 変更**
   - `api_key_id uuid REFERENCES user_ai_api_keys(id) ON DELETE SET NULL` を追加
   - 既存の `api_key` カラムは残す（データ移行のため）
   - 既存データの TRUNCATE（ユーザー許可済み）
   - `api_key` カラムを DROP

3. **`get_user_ai_api_keys_safe()` RPC 新規作成**
   - `api_key` を隠して `key_hint`（末尾4文字）を返す

4. **`get_feature_ai_config()` RPC 更新**
   - `user_ai_api_keys` を JOIN して `api_key` を解決するように変更

5. **`updated_at` トリガー追加**
   - `user_ai_api_keys` に `update_updated_at_column` トリガーを設定

## 変更対象ファイル
| ファイル | 変更 |
|---|---|
| 新規マイグレーション SQL | テーブル作成、カラム追加/削除、RPC作成/更新 |
