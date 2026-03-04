import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type AIApiKeyProvider = 'openai' | 'anthropic' | 'google';

export interface AIApiKeySafe {
  id: string;
  user_id: string;
  provider: AIApiKeyProvider;
  name: string;
  key_hint: string;
  created_at: string;
  updated_at: string;
}

export interface AIApiKeyInsert {
  provider: AIApiKeyProvider;
  name: string;
  api_key: string;
}

export interface AIApiKeyUpdate {
  name?: string;
  api_key?: string;
}

export function useAIApiKeys() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<AIApiKeySafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchKeys = useCallback(async () => {
    if (!user) {
      setKeys([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await (supabase.rpc as any)('get_user_ai_api_keys_safe');
      if (error) throw error;
      setKeys((data as unknown as AIApiKeySafe[]) || []);
    } catch (error) {
      console.error('Error fetching AI API keys:', error);
      toast.error('APIキー一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const createKey = async (input: AIApiKeyInsert): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const { error } = await supabase.from('user_ai_api_keys').insert({
        user_id: user.id,
        provider: input.provider,
        name: input.name,
        api_key: input.api_key,
      });
      if (error) throw error;
      await fetchKeys();
      toast.success('APIキーを登録しました');
      return true;
    } catch (error: any) {
      console.error('Error creating API key:', error);
      if (error?.code === '23505') {
        toast.error('同じプロバイダー・名前のキーが既に存在します');
      } else {
        toast.error('APIキーの登録に失敗しました');
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateKey = async (id: string, updates: AIApiKeyUpdate): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.api_key !== undefined) updateData.api_key = updates.api_key;

      const { error } = await supabase
        .from('user_ai_api_keys')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      await fetchKeys();
      toast.success('APIキーを更新しました');
      return true;
    } catch (error) {
      console.error('Error updating API key:', error);
      toast.error('APIキーの更新に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async (id: string): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_ai_api_keys')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      await fetchKeys();
      toast.success('APIキーを削除しました');
      return true;
    } catch (error) {
      console.error('Error deleting API key:', error);
      toast.error('APIキーの削除に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const getKeysByProvider = (provider: AIApiKeyProvider) =>
    keys.filter(k => k.provider === provider);

  return {
    keys,
    loading,
    saving,
    createKey,
    updateKey,
    deleteKey,
    getKeysByProvider,
    refetch: fetchKeys,
  };
}
