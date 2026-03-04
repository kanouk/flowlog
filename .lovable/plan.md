

# APIキーセキュリティ修正プラン

## 問題の原因

3つの重大な脆弱性:

1. **`user_ai_api_keys` の SELECT RLS ポリシーが有効** → クライアントから `supabase.from('user_ai_api_keys').select('api_key')` で平文APIキーを取得可能
2. **`get_feature_ai_config(p_user_id, p_feature_key)` が任意の `p_user_id` を受け入れる** → 他人のuser_idを渡せば他人のAPIキーが返る（SECURITY DEFINER で RLS をバイパスするため）
3. **`test-ai-connection` の Mode 1 がクライアントから生の `api_key` を受け取る** → 新規登録前のテストで必要だが、この経路自体は意図的設計

## 修正方針

### A. `user_ai_api_keys` の SELECT ポリシーを削除
- クライアントから直接 `api_key` カラムを読めなくする
- 一覧表示は既存の `get_user_ai_api_keys_safe()` RPC（ヒントのみ返す）経由のみ
- INSERT / UPDATE / DELETE ポリシーはそのまま維持（データ返却不要のため動作に影響なし）

### B. `get_feature_ai_config` に `auth.uid()` ガードを追加
- `auth.uid()` が NULL でない場合（= クライアント呼び出し）、`p_user_id = auth.uid()` を強制
- `auth.uid()` が NULL の場合（= service role からの呼び出し）、任意の `p_user_id` を許可
- これにより Edge Function は引き続き動作し、クライアントからの他人データアクセスをブロック

### C. 変更不要な箇所
- Edge Functions（`format-entries`, `summarize-url`, `ocr-image`, `test-ai-connection`）: すべて service role client で `user_ai_api_keys` にアクセスしており、RLS をバイパスするため変更不要
- フロントエンド hooks: INSERT/UPDATE/DELETE は SELECT 不要で動作。一覧は safe RPC 経由。変更不要

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| 新規マイグレーション SQL | (1) `user_ai_api_keys` の SELECT ポリシーを DROP、(2) `get_feature_ai_config` を `auth.uid()` ガード付きに再作成 |

コード変更は不要。マイグレーション1本のみ。

