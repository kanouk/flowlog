import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type ImageStorageProvider = 'default' | 'gyazo';

export interface ImageStorageSettingsSafe {
  provider: ImageStorageProvider;
  has_gyazo_token: boolean;
  gyazo_token_hint: string | null;
}

const DEFAULT_SETTINGS: ImageStorageSettingsSafe = {
  provider: 'default',
  has_gyazo_token: false,
  gyazo_token_hint: null,
};

export function useImageStorageSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ImageStorageSettingsSafe>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await (supabase.rpc as any)('get_user_image_storage_settings_safe');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setSettings(row ? {
        provider: row.provider === 'gyazo' ? 'gyazo' : 'default',
        has_gyazo_token: !!row.has_gyazo_token,
        gyazo_token_hint: row.gyazo_token_hint ?? null,
      } : DEFAULT_SETTINGS);
    } catch (error) {
      console.error('Error fetching image storage settings:', error);
      toast.error('画像保存先設定の取得に失敗しました');
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async (provider: ImageStorageProvider, gyazoToken?: string): Promise<boolean> => {
    if (!user) return false;

    if (provider === 'gyazo' && !gyazoToken?.trim() && !settings.has_gyazo_token) {
      toast.error('Gyazo API token を入力してください');
      return false;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        user_id: user.id,
        provider,
      };
      if (gyazoToken?.trim()) {
        payload.gyazo_token = gyazoToken.trim();
      }
      if (provider === 'default') {
        payload.gyazo_token = null;
      }

      const { error } = await (supabase.from as any)('user_image_storage_settings').upsert(payload, {
        onConflict: 'user_id',
      });
      if (error) throw error;

      await fetchSettings();
      toast.success('画像保存先を保存しました');
      return true;
    } catch (error) {
      console.error('Error saving image storage settings:', error);
      toast.error('画像保存先の保存に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async (): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const { error } = await (supabase.from as any)('user_image_storage_settings').upsert({
        user_id: user.id,
        provider: 'default',
        gyazo_token: null,
      }, {
        onConflict: 'user_id',
      });
      if (error) throw error;
      await fetchSettings();
      toast.success('画像保存先をデフォルトに戻しました');
      return true;
    } catch (error) {
      console.error('Error resetting image storage settings:', error);
      toast.error('画像保存先の解除に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    settings,
    loading,
    saving,
    saveSettings,
    resetToDefault,
    refetch: fetchSettings,
  };
}
