-- Add custom summarize prompt column to user_ai_settings
ALTER TABLE public.user_ai_settings
ADD COLUMN IF NOT EXISTS custom_summarize_prompt TEXT DEFAULT NULL;