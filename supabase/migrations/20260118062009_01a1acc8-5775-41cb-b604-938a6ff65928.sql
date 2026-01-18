-- occurred_at カラム追加
ALTER TABLE blocks ADD COLUMN occurred_at TIMESTAMPTZ;

-- 既存データをバックフィル
UPDATE blocks SET occurred_at = created_at WHERE occurred_at IS NULL;

-- NOT NULL制約とデフォルト値
ALTER TABLE blocks ALTER COLUMN occurred_at SET NOT NULL;
ALTER TABLE blocks ALTER COLUMN occurred_at SET DEFAULT now();

-- パフォーマンス＋安定ソート用インデックス
CREATE INDEX idx_blocks_user_occurred_created 
  ON blocks(user_id, occurred_at, created_at);

-- 未来日時禁止トリガー（CHECK制約ではなくトリガーで実装）
CREATE OR REPLACE FUNCTION public.check_occurred_at_not_future()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.occurred_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'occurred_at cannot be in the future (max +5 minutes allowed)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER blocks_check_occurred_at_not_future
  BEFORE INSERT OR UPDATE ON blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.check_occurred_at_not_future();