
-- 1. Create user_ai_api_keys table
CREATE TABLE public.user_ai_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  name text NOT NULL,
  api_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider, name)
);

ALTER TABLE public.user_ai_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API keys" ON public.user_ai_api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own API keys" ON public.user_ai_api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own API keys" ON public.user_ai_api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own API keys" ON public.user_ai_api_keys FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_user_ai_api_keys_updated_at
  BEFORE UPDATE ON public.user_ai_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Modify user_ai_models: add api_key_id, truncate, drop api_key
TRUNCATE public.user_ai_models CASCADE;

ALTER TABLE public.user_ai_models
  ADD COLUMN api_key_id uuid REFERENCES public.user_ai_api_keys(id) ON DELETE SET NULL;

ALTER TABLE public.user_ai_models
  DROP COLUMN api_key;

-- 3. Create get_user_ai_api_keys_safe RPC
CREATE OR REPLACE FUNCTION public.get_user_ai_api_keys_safe()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  provider text,
  name text,
  key_hint text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.user_id,
    k.provider,
    k.name,
    CASE
      WHEN length(k.api_key) > 4 THEN '****' || right(k.api_key, 4)
      ELSE '****'
    END AS key_hint,
    k.created_at,
    k.updated_at
  FROM user_ai_api_keys k
  WHERE k.user_id = auth.uid()
  ORDER BY k.provider, k.name;
END;
$$;

-- 4. Update get_feature_ai_config to join user_ai_api_keys
CREATE OR REPLACE FUNCTION public.get_feature_ai_config(p_user_id uuid, p_feature_key text)
RETURNS TABLE(
  feature_key text,
  enabled boolean,
  system_prompt text,
  user_prompt_template text,
  provider text,
  model_name text,
  api_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fs.feature_key,
    fs.enabled,
    fs.system_prompt,
    fs.user_prompt_template,
    m.provider,
    m.model_name,
    k.api_key
  FROM user_ai_feature_settings fs
  LEFT JOIN user_ai_models m ON m.id = fs.assigned_model_id AND m.is_active = true
  LEFT JOIN user_ai_api_keys k ON k.id = m.api_key_id
  WHERE fs.user_id = p_user_id
    AND fs.feature_key = p_feature_key;
END;
$$;
