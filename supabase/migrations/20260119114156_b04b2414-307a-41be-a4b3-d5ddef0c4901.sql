-- Create table for user AI settings
CREATE TABLE public.user_ai_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  openai_api_key TEXT,
  anthropic_api_key TEXT,
  google_api_key TEXT,
  selected_provider TEXT NOT NULL DEFAULT 'lovable',
  selected_model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_ai_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own AI settings"
ON public.user_ai_settings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI settings"
ON public.user_ai_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI settings"
ON public.user_ai_settings
FOR UPDATE
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_ai_settings_updated_at
BEFORE UPDATE ON public.user_ai_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();