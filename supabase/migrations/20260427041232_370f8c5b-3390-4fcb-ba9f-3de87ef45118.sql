REVOKE ALL ON FUNCTION public.get_user_image_storage_settings_safe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_image_storage_settings_safe() TO authenticated;