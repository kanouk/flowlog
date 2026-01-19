-- Add url_metadata column to blocks table for storing URL summaries
ALTER TABLE public.blocks ADD COLUMN url_metadata jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.blocks.url_metadata IS 'URL summary metadata: { url: string, title: string, summary: string, fetched_at: string }';