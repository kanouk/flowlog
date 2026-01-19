-- Add category column to blocks
ALTER TABLE blocks ADD COLUMN category TEXT;

-- Backfill existing data with 'event'
UPDATE blocks SET category = 'event' WHERE category IS NULL;

-- Set NOT NULL and DEFAULT
ALTER TABLE blocks ALTER COLUMN category SET NOT NULL;
ALTER TABLE blocks ALTER COLUMN category SET DEFAULT 'event';

-- Add CHECK constraint for valid categories
ALTER TABLE blocks ADD CONSTRAINT blocks_category_check
  CHECK (category IN ('event', 'thought', 'task', 'read_later'));

-- Add is_done column for task completion
ALTER TABLE blocks ADD COLUMN is_done BOOLEAN NOT NULL DEFAULT false;

-- Add done_at column for completion timestamp
ALTER TABLE blocks ADD COLUMN done_at TIMESTAMPTZ;