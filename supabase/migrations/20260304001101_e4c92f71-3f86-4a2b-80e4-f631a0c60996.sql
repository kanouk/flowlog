
-- ==========================================
-- 1. user_ai_models テーブル
-- ==========================================
CREATE TABLE public.user_ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google')),
  display_name text NOT NULL,
  model_name text NOT NULL,
  api_key text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_ai_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AI models"
  ON public.user_ai_models FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI models"
  ON public.user_ai_models FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI models"
  ON public.user_ai_models FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own AI models"
  ON public.user_ai_models FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_ai_models_updated_at
  BEFORE UPDATE ON public.user_ai_models
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- 2. user_ai_feature_settings テーブル
-- ==========================================
CREATE TABLE public.user_ai_feature_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature_key text NOT NULL,
  assigned_model_id uuid REFERENCES public.user_ai_models(id) ON DELETE SET NULL,
  system_prompt text,
  user_prompt_template text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, feature_key)
);

ALTER TABLE public.user_ai_feature_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own feature settings"
  ON public.user_ai_feature_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own feature settings"
  ON public.user_ai_feature_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own feature settings"
  ON public.user_ai_feature_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own feature settings"
  ON public.user_ai_feature_settings FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_ai_feature_settings_updated_at
  BEFORE UPDATE ON public.user_ai_feature_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ==========================================
-- 3. Safe RPC: get_user_ai_models_safe()
-- APIキーを隠して返す
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_user_ai_models_safe()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  provider text,
  display_name text,
  model_name text,
  has_api_key boolean,
  is_active boolean,
  sort_order integer,
  note text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    m.provider,
    m.display_name,
    m.model_name,
    (m.api_key IS NOT NULL AND m.api_key != '') AS has_api_key,
    m.is_active,
    m.sort_order,
    m.note,
    m.created_at,
    m.updated_at
  FROM user_ai_models m
  WHERE m.user_id = auth.uid()
  ORDER BY m.sort_order, m.created_at;
END;
$$;

-- ==========================================
-- 4. Edge Function用 RPC: get_feature_ai_config(p_feature_key)
-- feature_keyを指定 → 割り当てモデルの provider/model_name/api_key + プロンプトを返す
-- ==========================================
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
SET search_path TO 'public'
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
    m.api_key
  FROM user_ai_feature_settings fs
  LEFT JOIN user_ai_models m ON m.id = fs.assigned_model_id AND m.is_active = true
  WHERE fs.user_id = p_user_id
    AND fs.feature_key = p_feature_key;
END;
$$;

-- ==========================================
-- 5. 既存データ移行
-- user_ai_settings → user_ai_models (APIキーがあるプロバイダー分)
-- user_ai_settings → user_ai_feature_settings (プロンプト)
-- ==========================================

-- OpenAI キーがある場合にモデル登録
INSERT INTO public.user_ai_models (user_id, provider, display_name, model_name, api_key, sort_order)
SELECT 
  uas.user_id,
  'openai',
  'OpenAI (' || uas.selected_model || ')',
  CASE WHEN uas.selected_provider = 'openai' THEN uas.selected_model ELSE 'gpt-4o' END,
  uas.openai_api_key,
  0
FROM user_ai_settings uas
WHERE uas.openai_api_key IS NOT NULL AND uas.openai_api_key != '';

-- Anthropic キーがある場合にモデル登録
INSERT INTO public.user_ai_models (user_id, provider, display_name, model_name, api_key, sort_order)
SELECT 
  uas.user_id,
  'anthropic',
  'Anthropic (' || CASE WHEN uas.selected_provider = 'anthropic' THEN uas.selected_model ELSE 'claude-3.5-sonnet' END || ')',
  CASE WHEN uas.selected_provider = 'anthropic' THEN uas.selected_model ELSE 'claude-3.5-sonnet' END,
  uas.anthropic_api_key,
  1
FROM user_ai_settings uas
WHERE uas.anthropic_api_key IS NOT NULL AND uas.anthropic_api_key != '';

-- Google キーがある場合にモデル登録
INSERT INTO public.user_ai_models (user_id, provider, display_name, model_name, api_key, sort_order)
SELECT 
  uas.user_id,
  'google',
  'Google (' || CASE WHEN uas.selected_provider = 'google' THEN uas.selected_model ELSE 'gemini-2.5-flash' END || ')',
  CASE WHEN uas.selected_provider = 'google' THEN uas.selected_model ELSE 'gemini-2.5-flash' END,
  uas.google_api_key,
  2
FROM user_ai_settings uas
WHERE uas.google_api_key IS NOT NULL AND uas.google_api_key != '';

-- diary_format feature設定を移行 (custom_system_prompt がある場合)
INSERT INTO public.user_ai_feature_settings (user_id, feature_key, system_prompt, assigned_model_id)
SELECT 
  uas.user_id,
  'diary_format',
  uas.custom_system_prompt,
  (SELECT m.id FROM user_ai_models m 
   WHERE m.user_id = uas.user_id 
     AND m.provider = CASE WHEN uas.selected_provider IN ('openai','anthropic','google') THEN uas.selected_provider ELSE NULL END
   LIMIT 1)
FROM user_ai_settings uas
WHERE uas.custom_system_prompt IS NOT NULL AND uas.custom_system_prompt != '';

-- url_summary feature設定を移行 (custom_summarize_prompt がある場合)
INSERT INTO public.user_ai_feature_settings (user_id, feature_key, system_prompt, assigned_model_id)
SELECT 
  uas.user_id,
  'url_summary',
  uas.custom_summarize_prompt,
  (SELECT m.id FROM user_ai_models m 
   WHERE m.user_id = uas.user_id 
     AND m.provider = CASE WHEN uas.selected_provider IN ('openai','anthropic','google') THEN uas.selected_provider ELSE NULL END
   LIMIT 1)
FROM user_ai_settings uas
WHERE uas.custom_summarize_prompt IS NOT NULL AND uas.custom_summarize_prompt != '';

-- score_evaluation feature設定を移行
INSERT INTO public.user_ai_feature_settings (user_id, feature_key, enabled, user_prompt_template, assigned_model_id)
SELECT 
  uas.user_id,
  'score_evaluation',
  uas.score_enabled,
  uas.behavior_rules,
  (SELECT m.id FROM user_ai_models m 
   WHERE m.user_id = uas.user_id 
     AND m.provider = CASE WHEN uas.selected_provider IN ('openai','anthropic','google') THEN uas.selected_provider ELSE NULL END
   LIMIT 1)
FROM user_ai_settings uas
WHERE uas.score_enabled = true OR (uas.behavior_rules IS NOT NULL AND uas.behavior_rules != '');
