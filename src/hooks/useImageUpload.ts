import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { useImageStorageSettings } from './useImageStorageSettings';

const BUCKET_NAME = 'block-images';
const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function useImageUpload() {
  const { user } = useAuth();
  const { settings } = useImageStorageSettings();

  const uploadImages = useCallback(async (files: File[]): Promise<string[]> => {
    if (!user) {
      toast.error('ログインが必要です');
      return [];
    }

    if (files.length > MAX_IMAGES) {
      toast.error(`画像は最大${MAX_IMAGES}枚までです`);
      return [];
    }

    const urls: string[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`ファイルサイズは10MB以下にしてください: ${file.name}`);
        continue;
      }

      if (settings.provider === 'gyazo') {
        if (!settings.has_gyazo_token) {
          toast.error('Gyazo API token が設定されていません');
          break;
        }

        const formData = new FormData();
        formData.append('image', file);

        const { data, error } = await supabase.functions.invoke('gyazo-upload', {
          body: formData,
        });

        if (error || !data?.url) {
          console.error('Gyazo upload error:', error, data);
          toast.error(`Gyazoへのアップロードに失敗しました: ${file.name}`);
          continue;
        }

        urls.push(data.url);
        continue;
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error);
        toast.error(`アップロードに失敗しました: ${file.name}`);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(data.path);

      urls.push(urlData.publicUrl);
    }

    return urls;
  }, [user, settings]);

  const deleteImage = useCallback(async (url: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const gyazoMatch = url.match(/^https:\/\/i\.gyazo\.com\/([a-zA-Z0-9]+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
      if (gyazoMatch) {
        const { error } = await supabase.functions.invoke('gyazo-delete', {
          body: { url },
        });
        if (error) {
          console.error('Gyazo delete error:', error);
          return false;
        }
        return true;
      }

      // Extract path from URL
      const match = url.match(new RegExp(`${BUCKET_NAME}/(.+)$`));
      if (!match) return false;

      const path = match[1];
      const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);

      if (error) {
        console.error('Delete error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Delete error:', error);
      return false;
    }
  }, [user]);

  const deleteImages = useCallback(async (urls: string[]): Promise<void> => {
    if (!user || urls.length === 0) return;

    const paths: string[] = [];

    for (const url of urls) {
      const gyazoMatch = url.match(/^https:\/\/i\.gyazo\.com\/([a-zA-Z0-9]+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
      if (gyazoMatch) {
        const { error } = await supabase.functions.invoke('gyazo-delete', {
          body: { url },
        });
        if (error) {
          console.error('Gyazo bulk delete error:', error);
        }
        continue;
      }

      const match = url.match(new RegExp(`${BUCKET_NAME}/(.+)$`));
      if (match) paths.push(match[1]);
    }

    if (paths.length > 0) {
      const { error } = await supabase.storage.from(BUCKET_NAME).remove(paths);
      if (error) {
        console.error('Bulk delete error:', error);
      }
    }
  }, [user]);

  return {
    uploadImages,
    deleteImage,
    deleteImages,
    maxImages: MAX_IMAGES,
  };
}
