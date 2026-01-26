-- スケジュール用カラムを追加
ALTER TABLE blocks ADD COLUMN starts_at TIMESTAMPTZ;
ALTER TABLE blocks ADD COLUMN ends_at TIMESTAMPTZ;
ALTER TABLE blocks ADD COLUMN is_all_day BOOLEAN DEFAULT false;

-- スケジュールカテゴリのバリデーショントリガー
CREATE OR REPLACE FUNCTION public.validate_schedule_times()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category = 'schedule' THEN
    -- スケジュールカテゴリでは starts_at が必須
    IF NEW.starts_at IS NULL THEN
      RAISE EXCEPTION 'starts_at is required for schedule category'
        USING ERRCODE = 'check_violation';
    END IF;
    -- ends_at が指定されている場合、starts_at より後であることを確認
    IF NEW.ends_at IS NOT NULL AND NEW.ends_at < NEW.starts_at THEN
      RAISE EXCEPTION 'ends_at must be after starts_at'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trigger_validate_schedule_times
BEFORE INSERT OR UPDATE ON blocks
FOR EACH ROW EXECUTE FUNCTION public.validate_schedule_times();