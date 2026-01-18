-- block-images バケット作成（公開バケット）
INSERT INTO storage.buckets (id, name, public)
VALUES ('block-images', 'block-images', true);

-- RLSポリシー: アップロードは認証ユーザーのみ、自分のフォルダのみ
CREATE POLICY "Users can upload to their own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'block-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLSポリシー: 削除は自分のファイルのみ
CREATE POLICY "Users can delete their own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'block-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLSポリシー: 公開バケットなので誰でも閲覧可能
CREATE POLICY "Anyone can view block images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'block-images');

-- RLSポリシー: 更新は自分のファイルのみ
CREATE POLICY "Users can update their own files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'block-images' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- blocks テーブルに images カラム追加
ALTER TABLE blocks ADD COLUMN images TEXT[] DEFAULT '{}';

-- content を NULL許可に変更（画像のみブロック対応）
ALTER TABLE blocks ALTER COLUMN content DROP NOT NULL;

-- content または images のどちらかは必須（トリガーで検証）
CREATE OR REPLACE FUNCTION public.check_block_content_or_images()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.content IS NULL OR NEW.content = '') AND (NEW.images IS NULL OR array_length(NEW.images, 1) IS NULL OR array_length(NEW.images, 1) = 0) THEN
    RAISE EXCEPTION 'Either content or images must be provided'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_block_content_or_images_trigger
  BEFORE INSERT OR UPDATE ON blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.check_block_content_or_images();

-- 画像は最大5枚（トリガーで検証）
CREATE OR REPLACE FUNCTION public.check_block_images_max()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.images IS NOT NULL AND array_length(NEW.images, 1) > 5 THEN
    RAISE EXCEPTION 'Maximum 5 images allowed per block'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_block_images_max_trigger
  BEFORE INSERT OR UPDATE ON blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.check_block_images_max();