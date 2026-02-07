-- Add priority column to blocks table for task prioritization
-- Values: 0 = None (default), 1 = Low, 2 = Medium, 3 = High
ALTER TABLE blocks ADD COLUMN priority integer DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN blocks.priority IS 'Task priority: 0=None, 1=Low, 2=Medium, 3=High';