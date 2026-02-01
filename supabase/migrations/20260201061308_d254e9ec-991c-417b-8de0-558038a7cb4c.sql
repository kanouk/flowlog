-- user_api_tokensテーブルは既に存在するため、インデックスのみ追加
-- (テーブルは以前のマイグレーションで作成済み)

-- インデックスが存在しない場合のみ作成
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_hash ON public.user_api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_api_tokens_user_id ON public.user_api_tokens(user_id);