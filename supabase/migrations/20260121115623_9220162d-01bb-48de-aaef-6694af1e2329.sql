-- Create custom_tags table for user-defined tags
CREATE TABLE public.custom_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'tag',
  color text NOT NULL DEFAULT 'blue',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Ensure unique tag names per user
  CONSTRAINT custom_tags_name_unique UNIQUE (user_id, name)
);

-- Enable Row Level Security
ALTER TABLE public.custom_tags ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own tags
CREATE POLICY "Users can view their own custom tags"
ON public.custom_tags
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own custom tags"
ON public.custom_tags
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own custom tags"
ON public.custom_tags
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own custom tags"
ON public.custom_tags
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_custom_tags_updated_at
BEFORE UPDATE ON public.custom_tags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();