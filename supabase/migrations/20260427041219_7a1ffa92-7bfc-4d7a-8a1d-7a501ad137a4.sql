CREATE TABLE public.user_image_storage_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'default',
  gyazo_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT user_image_storage_settings_provider_check CHECK (provider IN ('default', 'gyazo'))
);

ALTER TABLE public.user_image_storage_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own image storage settings"
ON public.user_image_storage_settings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own image storage settings"
ON public.user_image_storage_settings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own image storage settings"
ON public.user_image_storage_settings
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_user_image_storage_settings_updated_at
BEFORE UPDATE ON public.user_image_storage_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_user_image_storage_settings_safe()
RETURNS TABLE(
  provider TEXT,
  has_gyazo_token BOOLEAN,
  gyazo_token_hint TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(s.provider, 'default') AS provider,
    COALESCE(s.gyazo_token IS NOT NULL AND s.gyazo_token <> '', false) AS has_gyazo_token,
    CASE
      WHEN s.gyazo_token IS NULL OR s.gyazo_token = '' THEN NULL::TEXT
      WHEN length(s.gyazo_token) > 4 THEN '****' || right(s.gyazo_token, 4)
      ELSE '****'
    END AS gyazo_token_hint
  FROM (SELECT auth.uid() AS user_id) u
  LEFT JOIN public.user_image_storage_settings s ON s.user_id = u.user_id
  WHERE u.user_id IS NOT NULL;
END;
$$;