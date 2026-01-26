-- Add 'schedule' to the allowed categories
ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_category_check;
ALTER TABLE public.blocks ADD CONSTRAINT blocks_category_check 
  CHECK (category IN ('event', 'task', 'thought', 'read_later', 'schedule'));