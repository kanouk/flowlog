-- 既存のblocks_tag_check制約を削除
ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_tag_check;

-- 新しい制約を追加（基本タグ OR UUID形式 OR NULL を許可）
ALTER TABLE public.blocks ADD CONSTRAINT blocks_tag_check 
CHECK (
  tag IS NULL 
  OR tag IN ('work', 'family', 'private')
  OR tag ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);