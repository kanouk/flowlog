-- Stock view category filters and task completion filters.
CREATE INDEX IF NOT EXISTS idx_blocks_user_category_occurred
  ON public.blocks (user_id, category, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_blocks_user_category_done
  ON public.blocks (user_id, category, is_done);

-- Custom tag lookup sorted by user-defined order.
CREATE INDEX IF NOT EXISTS idx_custom_tags_user_sort
  ON public.custom_tags (user_id, sort_order);
