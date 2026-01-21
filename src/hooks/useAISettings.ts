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

// 2026年1月時点の最新モデルリスト
export const AI_MODELS: AIModel[] = [
  // Lovable AI (built-in, no API key required)
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (Built-in)', provider: 'lovable' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (Built-in)', provider: 'lovable' },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini (Built-in)', provider: 'lovable' },
  
  // OpenAI Models (2025-2026)
  { id: 'gpt-5.2-2025-12-11', name: 'GPT-5.2', provider: 'openai' },
  { id: 'gpt-5', name: 'GPT-5', provider: 'openai' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'o3', name: 'o3 (Reasoning)', provider: 'openai' },
  { id: 'o3-mini', name: 'o3 Mini (Reasoning)', provider: 'openai' },
  
  // Anthropic Claude Models (2025-2026)
  { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'anthropic' },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
  { id: 'claude-opus-4', name: 'Claude Opus 4', provider: 'anthropic' },
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'anthropic' },
  { id: 'claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic' },
  { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
  
  // Google Gemini Models (2025-2026)
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro (Preview)', provider: 'google' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'google' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', provider: 'google' },
];

// Safe settings interface (no API keys exposed to client)
export interface AISettings {
  id?: string;
  selected_provider: AIProvider;
  selected_model: string;
  custom_system_prompt: string | null;
  custom_summarize_prompt: string | null;
  has_openai_key: boolean;
  has_anthropic_key: boolean;
  has_google_key: boolean;
  // Score feature
  score_enabled: boolean;
  behavior_rules: string | null;
}

export const DEFAULT_SYSTEM_PROMPT = `あなたは思考ログを整形するアシスタントです。ユーザーが一日の中で書き留めた短いメモやつぶやきを、読みやすい日記形式に整形してください。

以下のルールに従ってください：
1. 時系列順に並べ替える（入力は既にソート済み）
2. 口語体を自然な文章に軽く整形する（過剰な文学表現は避ける）
3. 朝（5:00-10:59）、昼（11:00-14:59）、夕方（15:00-17:59）、夜（18:00-4:59）でセクション分けする
4. 各セクションは「## 朝」のようなMarkdown見出しで始める
5. 最後に「## 今日の3行まとめ」を追加し、その日の要点を3行でまとめる
6. 元の内容の意味を変えないこと
7. 日本語で出力すること
8. カテゴリ情報（[出来事][思ったこと][タスク][あとで読む]）や完了マーク([✓])は参考にしつつ、自然な文章に整形する

出力はMarkdown形式で返してください。`;

export const DEFAULT_SUMMARIZE_PROMPT = `あなたはウェブページの内容を簡潔にまとめるアシスタントです。
以下のルールに従ってください：
1. ページの主要な内容を日本語で3-5行にまとめる
2. 重要なポイントを簡潔に整理する
3. 専門用語は必要に応じて簡潔に説明を加える
4. 客観的な要約を心がける
5. 箇条書きは使わず、自然な文章でまとめる
6. マークダウン記法は使わず、プレーンテキストで出力する`;

const DEFAULT_SETTINGS: AISettings = {
  selected_provider: 'lovable',
  selected_model: 'google/gemini-2.5-flash',
  custom_system_prompt: null,
  custom_summarize_prompt: null,
  has_openai_key: false,
  has_anthropic_key: false,
  has_google_key: false,
  score_enabled: false,
  behavior_rules: null,
};

// Settings update interface (for saving - can include new API keys)
export interface AISettingsUpdate {
  selected_provider?: AIProvider;
  selected_model?: string;
  custom_system_prompt?: string | null;
  custom_summarize_prompt?: string | null;
  openai_api_key?: string | null;
  anthropic_api_key?: string | null;
  google_api_key?: string | null;
  // Score feature
  score_enabled?: boolean;
  behavior_rules?: string | null;
}

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
      // Use the secure function that doesn't expose API keys
      const { data, error } = await supabase
        .rpc('get_user_ai_settings_safe');

      if (error) throw error;

      if (data && data.length > 0) {
        const row = data[0] as Record<string, unknown>;
        setSettings({
          id: row.id as string,
          selected_provider: row.selected_provider as AIProvider,
          selected_model: row.selected_model as string,
          custom_system_prompt: (row.custom_system_prompt as string) || null,
          custom_summarize_prompt: (row.custom_summarize_prompt as string) || null,
          has_openai_key: row.has_openai_key as boolean,
          has_anthropic_key: row.has_anthropic_key as boolean,
          has_google_key: row.has_google_key as boolean,
          score_enabled: row.score_enabled as boolean,
          behavior_rules: (row.behavior_rules as string) || null,
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

  const saveSettings = async (newSettings: AISettingsUpdate) => {
    if (!user) {
      toast.error('ログインが必要です');
      return false;
    }

    setSaving(true);
    try {
      // Build upsert object - only include API keys if explicitly provided
      type UpsertData = {
        user_id: string;
        selected_provider: string;
        selected_model: string;
        custom_system_prompt: string | null;
        custom_summarize_prompt: string | null;
        openai_api_key?: string | null;
        anthropic_api_key?: string | null;
        google_api_key?: string | null;
        score_enabled?: boolean;
        behavior_rules?: string | null;
      };

      const upsertData: UpsertData = {
        user_id: user.id,
        selected_provider: newSettings.selected_provider ?? settings.selected_provider,
        selected_model: newSettings.selected_model ?? settings.selected_model,
        custom_system_prompt: newSettings.custom_system_prompt ?? settings.custom_system_prompt ?? null,
        custom_summarize_prompt: newSettings.custom_summarize_prompt ?? settings.custom_summarize_prompt ?? null,
      };

      // Include score settings if provided
      if (newSettings.score_enabled !== undefined) {
        upsertData.score_enabled = newSettings.score_enabled;
      }
      if (newSettings.behavior_rules !== undefined) {
        upsertData.behavior_rules = newSettings.behavior_rules;
      }

      // Only include API keys if they were explicitly set (not undefined)
      if (newSettings.openai_api_key !== undefined) {
        upsertData.openai_api_key = newSettings.openai_api_key;
      }
      if (newSettings.anthropic_api_key !== undefined) {
        upsertData.anthropic_api_key = newSettings.anthropic_api_key;
      }
      if (newSettings.google_api_key !== undefined) {
        upsertData.google_api_key = newSettings.google_api_key;
      }

      const { error } = await supabase
        .from('user_ai_settings')
        .upsert(upsertData, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      // Refetch to get updated has_key flags
      await fetchSettings();
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

  const hasApiKeyForProvider = (provider: AIProvider): boolean => {
    switch (provider) {
      case 'openai':
        return settings.has_openai_key;
      case 'anthropic':
        return settings.has_anthropic_key;
      case 'google':
        return settings.has_google_key;
      case 'lovable':
        return true;
      default:
        return false;
    }
  };

  const hasApiKeyForSelectedProvider = (): boolean => {
    return hasApiKeyForProvider(settings.selected_provider);
  };

  return {
    settings,
    loading,
    saving,
    saveSettings,
    getModelsForProvider,
    hasApiKeyForProvider,
    hasApiKeyForSelectedProvider,
    refetch: fetchSettings,
  };
}
