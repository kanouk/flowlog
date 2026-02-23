import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type TagColor =
  | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray'
  | 'amber' | 'lime' | 'emerald' | 'teal' | 'cyan' | 'indigo' | 'rose' | 'slate';

export interface CustomTag {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: TagColor;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomTagInput {
  name: string;
  icon: string;
  color: TagColor;
}

export interface UpdateCustomTagInput {
  name?: string;
  icon?: string;
  color?: TagColor;
  sort_order?: number;
}

// 色設定
export const TAG_COLORS: Record<TagColor, { bg: string; text: string; label: string }> = {
  red: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400', label: '赤' },
  rose: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400', label: 'ローズ' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-600 dark:text-orange-400', label: 'オレンジ' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', label: 'アンバー' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-600 dark:text-yellow-400', label: '黄' },
  lime: { bg: 'bg-lime-100 dark:bg-lime-900/30', text: 'text-lime-600 dark:text-lime-400', label: 'ライム' },
  green: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400', label: '緑' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', label: 'エメラルド' },
  teal: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-600 dark:text-teal-400', label: 'ティール' },
  cyan: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-600 dark:text-cyan-400', label: 'シアン' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400', label: '青' },
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-600 dark:text-indigo-400', label: 'インディゴ' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400', label: '紫' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-600 dark:text-pink-400', label: 'ピンク' },
  gray: { bg: 'bg-gray-100 dark:bg-gray-800/50', text: 'text-gray-600 dark:text-gray-400', label: 'グレー' },
  slate: { bg: 'bg-slate-100 dark:bg-slate-800/50', text: 'text-slate-600 dark:text-slate-400', label: 'スレート' },
};

// 選択可能なアイコン一覧
export const AVAILABLE_ICONS = [
  // 基本
  'star', 'heart', 'flame', 'zap', 'target', 'trophy', 'sparkles', 'gem',
  // 仕事・学習
  'book', 'book-open', 'notebook', 'sticky-note', 'file-text', 'clipboard', 'pencil', 'graduation-cap',
  // コミュニケーション
  'message-circle', 'mail', 'phone', 'video', 'users', 'user-circle',
  // 生活
  'home', 'coffee', 'utensils', 'shopping-cart', 'gift', 'cake',
  // 健康・運動
  'dumbbell', 'bike', 'footprints', 'apple', 'pill', 'stethoscope',
  // 趣味・エンタメ
  'music', 'headphones', 'gamepad-2', 'palette', 'camera', 'film',
  // 移動・場所
  'car', 'plane', 'train', 'map-pin', 'globe', 'compass',
  // 自然・天気
  'sun', 'moon', 'cloud', 'leaf', 'flower-2', 'tree-pine',
  // ツール
  'paperclip', 'link', 'folder', 'archive', 'tag', 'bookmark',
  // 感情
  'smile', 'frown', 'meh', 'party-popper',
  // その他
  'lightbulb', 'bell', 'clock', 'calendar', 'check-circle', 'alert-circle',
] as const;

export type AvailableIcon = typeof AVAILABLE_ICONS[number];

export function useCustomTags() {
  const { user } = useAuth();
  const [customTags, setCustomTags] = useState<CustomTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch all custom tags for the user
  const fetchCustomTags = useCallback(async () => {
    if (!user) {
      setCustomTags([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('custom_tags')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;

      setCustomTags((data || []) as CustomTag[]);
      setError(null);
    } catch (err) {
      console.error('Error fetching custom tags:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Create a new custom tag
  const createCustomTag = useCallback(async (input: CreateCustomTagInput): Promise<CustomTag | null> => {
    if (!user) {
      toast.error('ログインが必要です');
      return null;
    }

    try {
      // Get current max sort_order
      const maxOrder = customTags.length > 0 
        ? Math.max(...customTags.map(t => t.sort_order)) 
        : -1;

      const { data, error: insertError } = await supabase
        .from('custom_tags')
        .insert({
          user_id: user.id,
          name: input.name,
          icon: input.icon,
          color: input.color,
          sort_order: maxOrder + 1,
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          toast.error('同じ名前のタグが既に存在します');
        } else {
          throw insertError;
        }
        return null;
      }

      const newTag = data as CustomTag;
      setCustomTags(prev => [...prev, newTag]);
      toast.success('タグを作成しました');
      return newTag;
    } catch (err) {
      console.error('Error creating custom tag:', err);
      toast.error('タグの作成に失敗しました');
      return null;
    }
  }, [user, customTags]);

  // Update an existing custom tag
  const updateCustomTag = useCallback(async (id: string, input: UpdateCustomTagInput): Promise<boolean> => {
    if (!user) {
      toast.error('ログインが必要です');
      return false;
    }

    try {
      const { error: updateError } = await supabase
        .from('custom_tags')
        .update(input)
        .eq('id', id)
        .eq('user_id', user.id);

      if (updateError) {
        if (updateError.code === '23505') {
          toast.error('同じ名前のタグが既に存在します');
        } else {
          throw updateError;
        }
        return false;
      }

      setCustomTags(prev => prev.map(tag => 
        tag.id === id ? { ...tag, ...input, updated_at: new Date().toISOString() } : tag
      ));
      toast.success('タグを更新しました');
      return true;
    } catch (err) {
      console.error('Error updating custom tag:', err);
      toast.error('タグの更新に失敗しました');
      return false;
    }
  }, [user]);

  // Delete a custom tag
  const deleteCustomTag = useCallback(async (id: string): Promise<boolean> => {
    if (!user) {
      toast.error('ログインが必要です');
      return false;
    }

    try {
      const { error: deleteError } = await supabase
        .from('custom_tags')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;

      setCustomTags(prev => prev.filter(tag => tag.id !== id));
      toast.success('タグを削除しました');
      return true;
    } catch (err) {
      console.error('Error deleting custom tag:', err);
      toast.error('タグの削除に失敗しました');
      return false;
    }
  }, [user]);

  // Get a custom tag by ID
  const getCustomTagById = useCallback((id: string): CustomTag | undefined => {
    return customTags.find(tag => tag.id === id);
  }, [customTags]);

  // Initial fetch
  useEffect(() => {
    fetchCustomTags();
  }, [fetchCustomTags]);

  return {
    customTags,
    loading,
    error,
    fetchCustomTags,
    createCustomTag,
    updateCustomTag,
    deleteCustomTag,
    getCustomTagById,
  };
}
