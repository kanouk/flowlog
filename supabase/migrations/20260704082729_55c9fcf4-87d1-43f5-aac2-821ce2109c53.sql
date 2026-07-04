
-- 1) Add WITH CHECK to UPDATE policies
DROP POLICY "Users can update their own custom tags" ON public.custom_tags;
CREATE POLICY "Users can update their own custom tags" ON public.custom_tags
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY "Users can update their own entries" ON public.entries;
CREATE POLICY "Users can update their own entries" ON public.entries
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY "Users can update their own API keys" ON public.user_ai_api_keys;
CREATE POLICY "Users can update their own API keys" ON public.user_ai_api_keys
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY "Users can update their own feature settings" ON public.user_ai_feature_settings;
CREATE POLICY "Users can update their own feature settings" ON public.user_ai_feature_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY "Users can update their own AI models" ON public.user_ai_models;
CREATE POLICY "Users can update their own AI models" ON public.user_ai_models
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY "Users can update their own AI settings" ON public.user_ai_settings;
CREATE POLICY "Users can update their own AI settings" ON public.user_ai_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2) Restrict block-images bucket listing: allow listing only own files.
-- Individual file fetches via public URL still work (public bucket).
DROP POLICY "Anyone can view block images" ON storage.objects;
CREATE POLICY "Users can list their own block images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'block-images'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- 3) Revoke SECURITY DEFINER function execute from anon
REVOKE EXECUTE ON FUNCTION public.get_user_ai_models_safe() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_ai_api_keys_safe() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_ai_settings_safe() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_image_storage_settings_safe() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_feature_ai_config(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_user_ai_models_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_ai_api_keys_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_ai_settings_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_image_storage_settings_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feature_ai_config(uuid, text) TO authenticated;
