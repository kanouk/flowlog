import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type TagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray';

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
  orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-600 dark:text-orange-400', label: 'オレンジ' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-600 dark:text-yellow-400', label: '黄' },
  green: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400', label: '緑' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400', label: '青' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400', label: '紫' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-600 dark:text-pink-400', label: 'ピンク' },
  gray: { bg: 'bg-gray-100 dark:bg-gray-800/50', text: 'text-gray-600 dark:text-gray-400', label: 'グレー' },
};

// 選択可能なアイコン一覧
export const AVAILABLE_ICONS = [
  'star', 'heart', 'flame', 'zap', 'target', 'trophy', 
  'music', 'book', 'gamepad-2', 'dumbbell', 'palette', 'coffee',
  'car', 'plane', 'home', 'gift', 'camera', 'smile',
  'sun', 'moon', 'cloud', 'leaf', 'flower-2', 'sparkles',
  'graduation-cap', 'stethoscope', 'shopping-cart', 'utensils',
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
