import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type AIModelProvider = 'openai' | 'anthropic' | 'google';

export interface AIModelSafe {
  id: string;
  user_id: string;
  provider: AIModelProvider;
  display_name: string;
  model_name: string;
  api_key_id: string | null;
  api_key_name: string | null;
  is_active: boolean;
  sort_order: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIModelInsert {
  provider: AIModelProvider;
  display_name: string;
  model_name: string;
  api_key_id?: string | null;
  is_active?: boolean;
  sort_order?: number;
  note?: string;
}

export interface AIModelUpdate {
  display_name?: string;
  model_name?: string;
  api_key_id?: string | null;
  is_active?: boolean;
  sort_order?: number;
  note?: string | null;
}

export function useAIModels() {
  const { user } = useAuth();
  const [models, setModels] = useState<AIModelSafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchModels = useCallback(async () => {
    if (!user) {
      setModels([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_user_ai_models_safe');
      if (error) throw error;
      setModels((data as unknown as AIModelSafe[]) || []);
    } catch (error) {
      console.error('Error fetching AI models:', error);
      toast.error('AIモデル一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const createModel = async (input: AIModelInsert): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const { error } = await supabase.from('user_ai_models').insert({
        user_id: user.id,
        provider: input.provider,
        display_name: input.display_name,
        model_name: input.model_name,
        api_key_id: input.api_key_id || null,
        is_active: input.is_active ?? true,
        sort_order: input.sort_order ?? models.length,
        note: input.note || null,
      });
      if (error) throw error;
      await fetchModels();
      toast.success('モデルを登録しました');
      return true;
    } catch (error) {
      console.error('Error creating AI model:', error);
      toast.error('モデルの登録に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateModel = async (id: string, updates: AIModelUpdate): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {};
      if (updates.display_name !== undefined) updateData.display_name = updates.display_name;
      if (updates.model_name !== undefined) updateData.model_name = updates.model_name;
      if (updates.is_active !== undefined) updateData.is_active = updates.is_active;
      if (updates.sort_order !== undefined) updateData.sort_order = updates.sort_order;
      if (updates.note !== undefined) updateData.note = updates.note;
      if (updates.api_key_id !== undefined) updateData.api_key_id = updates.api_key_id;

      const { error } = await supabase
        .from('user_ai_models')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      await fetchModels();
      toast.success('モデルを更新しました');
      return true;
    } catch (error) {
      console.error('Error updating AI model:', error);
      toast.error('モデルの更新に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteModel = async (id: string): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_ai_models')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      await fetchModels();
      toast.success('モデルを削除しました');
      return true;
    } catch (error) {
      console.error('Error deleting AI model:', error);
      toast.error('モデルの削除に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const testModelById = async (modelId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('test-ai-connection', {
        body: { model_id: modelId },
      });
      if (error) return { success: false, message: error.message };
      return { success: data.success, message: data.message };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'テストに失敗しました' };
    }
  };

  const testApiKeyById = async (apiKeyId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('test-ai-connection', {
        body: { api_key_id: apiKeyId },
      });
      if (error) return { success: false, message: error.message };
      return { success: data.success, message: data.message };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'テストに失敗しました' };
    }
  };

  const testConnection = async (provider: AIModelProvider, apiKey: string): Promise<{ success: boolean; message: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('test-ai-connection', {
        body: { provider, api_key: apiKey },
      });
      if (error) return { success: false, message: error.message };
      return { success: data.success, message: data.message };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : '接続テストに失敗しました' };
    }
  };

  const activeModels = models.filter(m => m.is_active);

  return {
    models,
    activeModels,
    loading,
    saving,
    createModel,
    updateModel,
    deleteModel,
    testConnection,
    testModelById,
    testApiKeyById,
    refetch: fetchModels,
  };
}
