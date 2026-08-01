-- ユーザーが時刻を確定した日時を記録する
-- （時刻質問への回答・手動での時刻変更・「わからない」による却下でセット）
-- セット済みのブロックは format-entries の時刻推測で質問生成・自動時刻変更の対象外になる
ALTER TABLE public.blocks ADD COLUMN time_confirmed_at TIMESTAMP WITH TIME ZONE;
