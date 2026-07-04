import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/queryKeys';

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
  const queryClient = useQueryClient();
  const customTagsKey = user ? queryKeys.customTags(user.id) : ['customTags', 'anonymous'] as const;

  const {
    data: customTags = [],
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: customTagsKey,
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!user) return [];
      const { data, error: fetchError } = await supabase
        .from('custom_tags')
        .select('id, user_id, name, icon, color, sort_order, created_at, updated_at')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;
      return (data || []) as CustomTag[];
    },
  });

  useEffect(() => {
    if (error) {
      console.error('Error fetching custom tags:', error);
    }
  }, [error]);

  const createMutation = useMutation({
    mutationFn: async (input: CreateCustomTagInput): Promise<CustomTag> => {
      if (!user) throw new Error('ログインが必要です');

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

      if (insertError) throw insertError;
      return data as CustomTag;
    },
    onSuccess: (newTag) => {
      queryClient.setQueryData<CustomTag[]>(customTagsKey, (current = []) => [...current, newTag]);
      toast.success('タグを作成しました');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateCustomTagInput }) => {
      if (!user) throw new Error('ログインが必要です');

      const { error: updateError } = await supabase
        .from('custom_tags')
        .update(input)
        .eq('id', id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;
      return { id, input };
    },
    onSuccess: ({ id, input }) => {
      queryClient.setQueryData<CustomTag[]>(customTagsKey, (current = []) =>
        current.map(tag => tag.id === id ? { ...tag, ...input, updated_at: new Date().toISOString() } : tag),
      );
      toast.success('タグを更新しました');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('ログインが必要です');

      const { error: deleteError } = await supabase
        .from('custom_tags')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (deleteError) throw deleteError;
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<CustomTag[]>(customTagsKey, (current = []) => current.filter(tag => tag.id !== id));
      toast.success('タグを削除しました');
    },
  });

  const createCustomTag = useCallback(async (input: CreateCustomTagInput): Promise<CustomTag | null> => {
    if (!user) {
      toast.error('ログインが必要です');
      return null;
    }

    try {
      return await createMutation.mutateAsync(input);
    } catch (err) {
      console.error('Error creating custom tag:', err);
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      toast.error(code === '23505' ? '同じ名前のタグが既に存在します' : 'タグの作成に失敗しました');
      return null;
    }
  }, [createMutation, user]);

  const updateCustomTag = useCallback(async (id: string, input: UpdateCustomTagInput): Promise<boolean> => {
    if (!user) {
      toast.error('ログインが必要です');
      return false;
    }

    try {
      await updateMutation.mutateAsync({ id, input });
      return true;
    } catch (err) {
      console.error('Error updating custom tag:', err);
      const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
      toast.error(code === '23505' ? '同じ名前のタグが既に存在します' : 'タグの更新に失敗しました');
      return false;
    }
  }, [updateMutation, user]);

  const deleteCustomTag = useCallback(async (id: string): Promise<boolean> => {
    if (!user) {
      toast.error('ログインが必要です');
      return false;
    }

    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch (err) {
      console.error('Error deleting custom tag:', err);
      toast.error('タグの削除に失敗しました');
      return false;
    }
  }, [deleteMutation, user]);

  // Get a custom tag by ID
  const getCustomTagById = useCallback((id: string): CustomTag | undefined => {
    return customTags.find(tag => tag.id === id);
  }, [customTags]);

  return {
    customTags,
    loading,
    error,
    fetchCustomTags: refetch,
    createCustomTag,
    updateCustomTag,
    deleteCustomTag,
    getCustomTagById,
  };
}
