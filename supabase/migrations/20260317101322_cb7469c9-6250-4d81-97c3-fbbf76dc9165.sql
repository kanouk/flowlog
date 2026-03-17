
CREATE TABLE public.user_external_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service TEXT NOT NULL,
  token TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, service)
);

ALTER TABLE public.user_external_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own external tokens"
  ON public.user_external_tokens
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_user_external_tokens_updated_at
  BEFORE UPDATE ON public.user_external_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
