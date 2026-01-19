-- Create a secure function to get user AI settings without exposing API keys
CREATE OR REPLACE FUNCTION public.get_user_ai_settings_safe()
RETURNS TABLE (
  id uuid,
  selected_provider text,
  selected_model text,
  custom_system_prompt text,
  has_openai_key boolean,
  has_anthropic_key boolean,
  has_google_key boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    uas.id,
    uas.selected_provider,
    uas.selected_model,
    uas.custom_system_prompt,
    (uas.openai_api_key IS NOT NULL AND uas.openai_api_key != '') as has_openai_key,
    (uas.anthropic_api_key IS NOT NULL AND uas.anthropic_api_key != '') as has_anthropic_key,
    (uas.google_api_key IS NOT NULL AND uas.google_api_key != '') as has_google_key,
    uas.created_at,
    uas.updated_at
  FROM public.user_ai_settings uas
  WHERE uas.user_id = auth.uid()
$$;