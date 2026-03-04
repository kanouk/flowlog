import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type FeatureKey = 'diary_format' | 'time_inference' | 'score_evaluation' | 'url_summary' | 'ocr';

export interface FeatureSetting {
  id: string;
  user_id: string;
  feature_key: FeatureKey;
  assigned_model_id: string | null;
  system_prompt: string | null;
  user_prompt_template: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface FeatureSettingUpdate {
  assigned_model_id?: string | null;
  system_prompt?: string | null;
  user_prompt_template?: string | null;
  enabled?: boolean;
}

export interface FeatureInfo {
  key: FeatureKey;
  label: string;
  description: string;
  defaultSystemPrompt: string;
  defaultUserPromptTemplate: string;
  templateVars: string[];
}

export const FEATURE_DEFINITIONS: FeatureInfo[] = [
  {
    key: 'diary_format',
    label: '日記整形',
    description: '一日のログを読みやすい日記形式に整形します',
    defaultSystemPrompt: 'あなたは日記を整形するアシスタントです。ユーザーが一日の中で記録した「出来事」を、読みやすい日記形式に整形してください。',
    defaultUserPromptTemplate: '以下は{{date}}のログです。整形してください：\n\n{{blocks_text}}',
    templateVars: ['date', 'blocks_text'],
  },
  {
    key: 'time_inference',
    label: '時刻推測',
    description: 'ブロックの内容から実際の発生時刻を推測します',
    defaultSystemPrompt: '',
    defaultUserPromptTemplate: '',
    templateVars: ['date', 'blocks_text'],
  },
  {
    key: 'score_evaluation',
    label: '得点計算',
    description: '行動規範に基づいて一日の得点を計算します',
    defaultSystemPrompt: '',
    defaultUserPromptTemplate: '{{behavior_rules}}',
    templateVars: ['behavior_rules', 'formatted_content'],
  },
  {
    key: 'url_summary',
    label: 'URL要約',
    description: 'URLの内容を取得し、要約を生成します',
    defaultSystemPrompt: 'あなたはウェブページの内容を簡潔にまとめるアシスタントです。\n以下のルールに従ってください：\n1. ページの主要な内容を日本語で3-5行にまとめる\n2. 重要なポイントを簡潔に整理する\n3. 専門用語は必要に応じて簡潔に説明を加える\n4. 客観的な要約を心がける\n5. 箇条書きは使わず、自然な文章でまとめる\n6. マークダウン記法は使わず、プレーンテキストで出力する',
    defaultUserPromptTemplate: '以下のウェブページの内容を要約してください：\n\nタイトル: {{title}}\n\n内容:\n{{content}}',
    templateVars: ['title', 'content'],
  },
  {
    key: 'ocr',
    label: 'OCR (テキスト抽出)',
    description: '画像からテキストを読み取ります',
    defaultSystemPrompt: 'あなたは画像からテキストを抽出するOCRアシスタントです。画像内のテキストを正確に読み取り、原文のまま出力してください。レイアウトや改行もできるだけ再現してください。テキストがない画像の場合は、画像の内容を簡潔に日本語で説明してください。',
    defaultUserPromptTemplate: '',
    templateVars: ['image_count'],
  },
];

export function useAIFeatureSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<FeatureSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setSettings([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('user_ai_feature_settings')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      setSettings((data as unknown as FeatureSetting[]) || []);
    } catch (error) {
      console.error('Error fetching feature settings:', error);
      toast.error('処理別AI設定の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const getSettingForFeature = (featureKey: FeatureKey): FeatureSetting | undefined => {
    return settings.find(s => s.feature_key === featureKey);
  };

  const upsertSetting = async (featureKey: FeatureKey, updates: FeatureSettingUpdate): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const existing = getSettingForFeature(featureKey);
      if (existing) {
        const { error } = await supabase
          .from('user_ai_feature_settings')
          .update(updates as Record<string, unknown>)
          .eq('id', existing.id)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_ai_feature_settings')
          .insert({
            user_id: user.id,
            feature_key: featureKey,
            ...updates,
          } as Record<string, unknown>);
        if (error) throw error;
      }
      await fetchSettings();
      toast.success('設定を保存しました');
      return true;
    } catch (error) {
      console.error('Error saving feature setting:', error);
      toast.error('設定の保存に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteSetting = async (featureKey: FeatureKey): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_ai_feature_settings')
        .delete()
        .eq('user_id', user.id)
        .eq('feature_key', featureKey);
      if (error) throw error;
      await fetchSettings();
      toast.success('設定をリセットしました');
      return true;
    } catch (error) {
      console.error('Error deleting feature setting:', error);
      toast.error('設定のリセットに失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    settings,
    loading,
    saving,
    getSettingForFeature,
    upsertSetting,
    deleteSetting,
    refetch: fetchSettings,
  };
}
