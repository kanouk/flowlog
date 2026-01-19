-- Add custom_system_prompt column to user_ai_settings
ALTER TABLE public.user_ai_settings
ADD COLUMN custom_system_prompt TEXT DEFAULT NULL;