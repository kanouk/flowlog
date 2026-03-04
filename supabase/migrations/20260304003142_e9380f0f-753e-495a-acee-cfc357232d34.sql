
-- Drop existing function with old return type
DROP FUNCTION IF EXISTS public.get_user_ai_models_safe();

-- Recreate with new return type
CREATE OR REPLACE FUNCTION public.get_user_ai_models_safe()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  provider text,
  display_name text,
  model_name text,
  api_key_id uuid,
  api_key_name text,
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
    m.api_key_id,
    k.name AS api_key_name,
    m.is_active,
    m.sort_order,
    m.note,
    m.created_at,
    m.updated_at
  FROM user_ai_models m
  LEFT JOIN user_ai_api_keys k ON k.id = m.api_key_id
  WHERE m.user_id = auth.uid()
  ORDER BY m.sort_order, m.created_at;
END;
$$;
