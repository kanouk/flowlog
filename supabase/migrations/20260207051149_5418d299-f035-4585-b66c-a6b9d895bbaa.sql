-- OAuth認可コード一時保存テーブル
CREATE TABLE public.oauth_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  code_challenge text,
  code_challenge_method text,
  redirect_uri text NOT NULL,
  client_id text NOT NULL,
  scope text,
  state text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS有効化
ALTER TABLE public.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: ユーザーは自分のコードのみ参照・削除可能
CREATE POLICY "Users can view their own oauth codes"
ON public.oauth_authorization_codes
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own oauth codes"
ON public.oauth_authorization_codes
FOR DELETE
USING (auth.uid() = user_id);

-- INSERT用のポリシー（Edge Functionからservice_roleで挿入するが、念のため）
CREATE POLICY "Users can insert their own oauth codes"
ON public.oauth_authorization_codes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 期限切れコード検索用インデックス
CREATE INDEX idx_oauth_codes_expires ON public.oauth_authorization_codes(expires_at);

-- コード検索用インデックス
CREATE INDEX idx_oauth_codes_code ON public.oauth_authorization_codes(code);