-- Add score-related columns to user_ai_settings (if not exists)
ALTER TABLE user_ai_settings
ADD COLUMN IF NOT EXISTS score_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS behavior_rules text;

-- Add score columns to entries (if not exists)
ALTER TABLE entries
ADD COLUMN IF NOT EXISTS score integer,
ADD COLUMN IF NOT EXISTS score_details text;