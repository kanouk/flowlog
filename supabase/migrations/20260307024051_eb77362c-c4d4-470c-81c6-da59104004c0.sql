ALTER TABLE public.blocks ADD COLUMN due_at TIMESTAMPTZ;
ALTER TABLE public.blocks ADD COLUMN due_all_day BOOLEAN DEFAULT false;