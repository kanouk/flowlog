
-- Make get_feature_ai_config safe for client calls by never returning api_key plaintext
CREATE OR REPLACE FUNCTION public.get_feature_ai_config(p_user_id uuid, p_feature_key text)
 RETURNS TABLE(feature_key text, enabled boolean, system_prompt text, user_prompt_template text, provider text, model_name text, api_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- When called by a regular client (auth.uid() is not null),
  -- enforce that p_user_id matches the authenticated user
  IF auth.uid() IS NOT NULL AND p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: cannot access other users config'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    fs.feature_key,
    fs.enabled,
    fs.system_prompt,
    fs.user_prompt_template,
    m.provider,
    m.model_name,
    NULL::text AS api_key  -- NEVER expose plaintext API keys
  FROM user_ai_feature_settings fs
  LEFT JOIN user_ai_models m ON m.id = fs.assigned_model_id AND m.is_active = true
  LEFT JOIN user_ai_api_keys k ON k.id = m.api_key_id
  WHERE fs.user_id = p_user_id
    AND fs.feature_key = p_feature_key;
END;
$function$;
