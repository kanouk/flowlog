import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type AIProvider = 'lovable' | 'openai' | 'anthropic' | 'google';

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
}

// 2025年1月時点の最新モデルリスト
export const AI_MODELS: AIModel[] = [
  // Lovable AI (built-in, no API key required)
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (Built-in)', provider: 'lovable' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (Built-in)', provider: 'lovable' },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini (Built-in)', provider: 'lovable' },
  
  // OpenAI Models (2025)
  { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai' },
  { id: 'gpt-5', name: 'GPT-5', provider: 'openai' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'o3', name: 'o3 (Reasoning)', provider: 'openai' },
  { id: 'o3-mini', name: 'o3 Mini (Reasoning)', provider: 'openai' },
  
  // Anthropic Claude Models (2025)
  { id: 'claude-opus-4', name: 'Claude Opus 4', provider: 'anthropic' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'anthropic' },
  { id: 'claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic' },
  { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
  
  // Google Gemini Models (2025)
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'google' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', provider: 'google' },
];

export interface AISettings {
  id?: string;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  google_api_key: string | null;
  selected_provider: AIProvider;
  selected_model: string;
}

const DEFAULT_SETTINGS: AISettings = {
  openai_api_key: null,
  anthropic_api_key: null,
  google_api_key: null,
  selected_provider: 'lovable',
  selected_model: 'google/gemini-2.5-flash',
};

export function useAISettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_ai_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          id: data.id,
          openai_api_key: data.openai_api_key,
          anthropic_api_key: data.anthropic_api_key,
          google_api_key: data.google_api_key,
          selected_provider: data.selected_provider as AIProvider,
          selected_model: data.selected_model,
        });
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (error) {
      console.error('Error fetching AI settings:', error);
      toast.error('AI設定の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async (newSettings: Partial<AISettings>) => {
    if (!user) {
      toast.error('ログインが必要です');
      return false;
    }

    setSaving(true);
    try {
      const updatedSettings = { ...settings, ...newSettings };
      
      const { error } = await supabase
        .from('user_ai_settings')
        .upsert({
          user_id: user.id,
          openai_api_key: updatedSettings.openai_api_key,
          anthropic_api_key: updatedSettings.anthropic_api_key,
          google_api_key: updatedSettings.google_api_key,
          selected_provider: updatedSettings.selected_provider,
          selected_model: updatedSettings.selected_model,
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      setSettings(updatedSettings);
      toast.success('AI設定を保存しました');
      return true;
    } catch (error) {
      console.error('Error saving AI settings:', error);
      toast.error('AI設定の保存に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const getModelsForProvider = (provider: AIProvider): AIModel[] => {
    return AI_MODELS.filter(model => model.provider === provider);
  };

  const getApiKeyForProvider = (provider: AIProvider): string | null => {
    switch (provider) {
      case 'openai':
        return settings.openai_api_key;
      case 'anthropic':
        return settings.anthropic_api_key;
      case 'google':
        return settings.google_api_key;
      default:
        return null;
    }
  };

  const hasApiKeyForSelectedProvider = (): boolean => {
    if (settings.selected_provider === 'lovable') return true;
    return !!getApiKeyForProvider(settings.selected_provider);
  };

  return {
    settings,
    loading,
    saving,
    saveSettings,
    getModelsForProvider,
    getApiKeyForProvider,
    hasApiKeyForSelectedProvider,
    refetch: fetchSettings,
  };
}
