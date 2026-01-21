-- Drop and recreate the function with new return type
DROP FUNCTION IF EXISTS public.get_user_ai_settings_safe();

CREATE FUNCTION public.get_user_ai_settings_safe()
RETURNS TABLE(
  id uuid, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone, 
  selected_provider text, 
  selected_model text, 
  custom_system_prompt text, 
  custom_summarize_prompt text, 
  has_openai_key boolean, 
  has_anthropic_key boolean, 
  has_google_key boolean,
  score_enabled boolean,
  behavior_rules text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    uas.id,
    uas.created_at,
    uas.updated_at,
    uas.selected_provider,
    uas.selected_model,
    uas.custom_system_prompt,
    uas.custom_summarize_prompt,
    (uas.openai_api_key IS NOT NULL AND uas.openai_api_key != '') AS has_openai_key,
    (uas.anthropic_api_key IS NOT NULL AND uas.anthropic_api_key != '') AS has_anthropic_key,
    (uas.google_api_key IS NOT NULL AND uas.google_api_key != '') AS has_google_key,
    uas.score_enabled,
    uas.behavior_rules
  FROM user_ai_settings uas
  WHERE uas.user_id = auth.uid();
END;
$function$;