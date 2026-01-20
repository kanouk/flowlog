-- Add tag column to blocks table
ALTER TABLE public.blocks ADD COLUMN tag TEXT;

-- Add a check constraint to ensure valid tag values
ALTER TABLE public.blocks ADD CONSTRAINT blocks_tag_check CHECK (tag IS NULL OR tag IN ('work', 'family', 'private'));