import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import {
  getTodayKey,
  getDateRangeUTC,
  createOccurredAt,
  parseTimestamp,
  getOccurredAtDayKey,
  isFutureDate,
} from '@/lib/dateUtils';
import type { BlockCategory, BlockTag } from '@/lib/categoryUtils';

export interface UrlMetadata {
  url: string;
  title: string;
  summary: string;
  fetched_at: string;
  error?: boolean;
  error_message?: string;
}

export interface Block {
  id: string;
  entry_id: string;
  user_id: string;
  content: string | null;
  images: string[];
  occurred_at: string;
  created_at: string;
  category: BlockCategory;
  tag: BlockTag | null;
  is_done: boolean;
  done_at: string | null;
  url_metadata: UrlMetadata | null;
  // Schedule fields
  starts_at: string | null;
  ends_at: string | null;
  is_all_day: boolean;
  // Task priority (0=none, 1=low, 2=medium, 3=high)
  priority: number;
  // OCR extracted text
  extracted_text: string | null;
  // Task deadline
  due_at: string | null;
  due_all_day: boolean;
}

export interface Entry {
  id: string;
  user_id: string;
  date: string;
  summary: string | null;
  formatted_content: string | null;
  created_at: string;
  updated_at: string;
  // Score feature
  score: number | null;
  score_details: string | null;
}

export type AddBlockMode = 'toSelectedDate' | 'toNow';

export interface BlockUpdatePayload {
  content?: string;
  occurred_at?: string;
  category?: BlockCategory;
  tag?: BlockTag | null;
  is_done?: boolean;
  done_at?: string | null;
  images?: string[];
  // Schedule fields
  starts_at?: string | null;
  ends_at?: string | null;
  is_all_day?: boolean;
  // Task priority
  priority?: number;
  // OCR extracted text
  extracted_text?: string | null;
  // Task deadline
  due_at?: string | null;
  due_all_day?: boolean;
}

export interface GetBlocksByCategoryOptions {
  limit?: number;
  includeCompleted?: boolean; // for tasks
}

// 時刻更新情報
export interface TimeUpdate {
  block_id: string;
  old_time: string;
  new_time: string;
  reason: string;
}

// 時刻質問情報
export interface TimeQuestion {
  block_id: string;
  content_preview: string;
  question: string;
}

// formatEntry のレスポンス型
export interface FormatEntryResponse {
  formatted_content: string;
  summary: string;
  time_updates?: TimeUpdate[];
  needs_clarification?: boolean;
  questions?: TimeQuestion[];
  // Score feature
  score?: number;
  score_details?: string;
}

export function useEntries() {
  const { user, session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formatting, setFormatting] = useState(false);
  
  // Memoize user.id to prevent unnecessary re-renders from user object changes
  const userId = user?.id;

  /**
   * 空entry削除（クライアント側実装）
   * ※将来的にDBトリガー化を検討（競合対策）
   */
  const cleanupEmptyEntry = useCallback(async (entryId: string) => {
    const { count, error: countError } = await supabase
      .from('blocks')
      .select('*', { count: 'exact', head: true })
      .eq('entry_id', entryId);
    
    if (countError) {
      console.error('Error counting blocks:', countError);
      return;
    }
    
    if (count === 0) {
      const { error: deleteError } = await supabase
        .from('entries')
        .delete()
        .eq('id', entryId);
      
      if (deleteError) {
        console.error('Error deleting empty entry:', deleteError);
      }
    }
  }, []);

  /**
   * dayKey で entry を取得または作成
   */
  const getOrCreateEntryForDate = useCallback(async (dayKey: string) => {
    if (!userId) return null;

    const { data: existing } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', userId)
      .eq('date', dayKey)
      .maybeSingle();

    if (existing) return existing as Entry;

    const { data, error } = await supabase
      .from('entries')
      .insert({ user_id: userId, date: dayKey })
      .select()
      .single();

    if (error) {
      console.error('Error creating entry:', error);
      return null;
    }
    return data as Entry;
  }, [userId]);

  /**
   * 指定日付のブロックを occurred_at 範囲で取得（降順）
   */
  const getBlocksByDate = useCallback(async (selectedDate: string) => {
    if (!userId) return [];
    const { start, end } = getDateRangeUTC(selectedDate);
    
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .eq('user_id', userId)
      .gte('occurred_at', start)
      .lt('occurred_at', end)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching blocks:', error);
      return [];
    }
    return data as unknown as Block[];
  }, [userId]);

  /**
   * カテゴリ横断でブロックを取得（Tasks/Read later用）
   * - entry_id依存なし（横断ビュー用）
   * - task: is_done ASC, occurred_at DESC
   * - read_later: occurred_at DESC
   */
  const getBlocksByCategory = useCallback(async (
    category: BlockCategory | BlockCategory[],
    options?: GetBlocksByCategoryOptions
  ): Promise<Block[]> => {
    if (!userId) return [];
    
    const categories = Array.isArray(category) ? category : [category];
    const limit = options?.limit || 100;
    
    let query = supabase
      .from('blocks')
      .select('*')
      .eq('user_id', userId)
      .in('category', categories);
    
    // タスクの場合のみ、完了済み除外オプション
    if (categories.includes('task') && options?.includeCompleted === false) {
      query = query.eq('is_done', false);
    }
    
    const { data, error } = await query
      .order('occurred_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching blocks by category:', error);
      return [];
    }
    
    let blocks = data as unknown as Block[];
    
    // タスクの場合、クライアント側で並び替え: is_done ASC, then occurred_at DESC (for uncompleted), done_at DESC (for completed)
    if (categories.length === 1 && categories[0] === 'task') {
      blocks = blocks.sort((a, b) => {
        // 未完了を先に
        if (a.is_done !== b.is_done) {
          return a.is_done ? 1 : -1;
        }
        // 同じ状態の場合
        if (a.is_done && b.is_done) {
          // 完了済み: done_at DESC
          const aTime = a.done_at ? parseTimestamp(a.done_at).getTime() : parseTimestamp(a.occurred_at).getTime();
          const bTime = b.done_at ? parseTimestamp(b.done_at).getTime() : parseTimestamp(b.occurred_at).getTime();
          return bTime - aTime;
        }
        // 未完了: occurred_at DESC
        return parseTimestamp(b.occurred_at).getTime() - parseTimestamp(a.occurred_at).getTime();
      });
    }
    
    return blocks;
  }, [userId]);

  /**
   * ブロック追加（過去日対応 + "今で追加"モード + 画像対応 + カテゴリ対応 + タグ対応 + スケジュール対応）
   */
  const addBlockWithDate = useCallback(async ({ 
    content, 
    selectedDate, 
    mode,
    images = [],
    category = 'event',
    tag = null,
    starts_at = null,
    ends_at = null,
    is_all_day = false,
    priority = 0,
  }: { 
    content: string; 
    selectedDate: string; 
    mode: AddBlockMode; 
    images?: string[];
    category?: BlockCategory;
    tag?: BlockTag | null;
    starts_at?: string | null;
    ends_at?: string | null;
    is_all_day?: boolean;
    priority?: number;
  }) => {
    if (!userId) return { block: null, navigateToDate: null };

    setLoading(true);
    try {
      const today = getTodayKey();
      const isToday = selectedDate === today;
      
      let occurredAt: string;
      
      if (isToday || mode === 'toNow') {
        occurredAt = new Date().toISOString();
      } else {
        // 過去日：その日の最終ブロック + 1分、なければ 12:00 JST
        const { start, end } = getDateRangeUTC(selectedDate);
        const { data: lastBlocks } = await supabase
          .from('blocks')
          .select('occurred_at')
          .eq('user_id', userId)
          .gte('occurred_at', start)
          .lt('occurred_at', end)
          .order('occurred_at', { ascending: false })
          .limit(1);
        
        if (lastBlocks && lastBlocks.length > 0) {
          const lastTime = parseTimestamp(lastBlocks[0].occurred_at);
          occurredAt = new Date(lastTime.getTime() + 60 * 1000).toISOString();
        } else {
          occurredAt = createOccurredAt(selectedDate, '12:00');
        }
      }
      
      const dayKey = getOccurredAtDayKey(occurredAt);
      const entry = await getOrCreateEntryForDate(dayKey);
      if (!entry) throw new Error('Failed to get/create entry');

      const insertData: Record<string, unknown> = {
        entry_id: entry.id,
        user_id: userId,
        content: content || null,
        images,
        occurred_at: occurredAt,
        category,
        tag,
        priority: category === 'task' ? priority : 0,
      };

      // スケジュールカテゴリの場合のみスケジュールフィールドを追加
      if (category === 'schedule') {
        insertData.starts_at = starts_at;
        insertData.ends_at = ends_at;
        insertData.is_all_day = is_all_day;
      }

      const { data, error } = await supabase
        .from('blocks')
        .insert(insertData as typeof insertData & { entry_id: string; user_id: string })
        .select()
        .single();

      if (error) throw error;
      
      const navigateToDate = mode === 'toNow' && !isToday ? today : null;
      
      return { block: data as unknown as Block, navigateToDate };
    } catch (error) {
      console.error('Error adding block:', error);
      toast.error('ブロックの保存に失敗しました');
      return { block: null, navigateToDate: null };
    } finally {
      setLoading(false);
    }
  }, [userId, getOrCreateEntryForDate]);

  /**
   * ブロック更新（汎用：content, occurred_at, category, is_done, done_at）
   */
  const updateBlock = useCallback(async (
    blockId: string, 
    updates: BlockUpdatePayload
  ) => {
    if (!userId) return null;

    if (updates.occurred_at && isFutureDate(updates.occurred_at)) {
      toast.error('未来の日時は指定できません');
      return null;
    }

    try {
      const { data: currentBlock } = await supabase
        .from('blocks')
        .select('entry_id')
        .eq('id', blockId)
        .single();
      
      const oldEntryId = currentBlock?.entry_id;
      
      const updateData: Partial<Pick<Block, 'content' | 'occurred_at' | 'entry_id' | 'category' | 'tag' | 'is_done' | 'done_at' | 'images' | 'starts_at' | 'ends_at' | 'is_all_day' | 'priority' | 'extracted_text' | 'due_at' | 'due_all_day'>> = {};
      
      if (updates.content !== undefined) {
        updateData.content = updates.content;
      }
      if (updates.category !== undefined) {
        updateData.category = updates.category;
      }
      if (updates.tag !== undefined) {
        updateData.tag = updates.tag;
      }
      if (updates.is_done !== undefined) {
        updateData.is_done = updates.is_done;
      }
      if (updates.done_at !== undefined) {
        updateData.done_at = updates.done_at;
      }
      if (updates.images !== undefined) {
        updateData.images = updates.images;
      }
      // Schedule fields
      if (updates.starts_at !== undefined) {
        updateData.starts_at = updates.starts_at;
      }
      if (updates.ends_at !== undefined) {
        updateData.ends_at = updates.ends_at;
      }
      if (updates.is_all_day !== undefined) {
        updateData.is_all_day = updates.is_all_day;
      }
      // Priority field
      if (updates.priority !== undefined) {
        updateData.priority = updates.priority;
      }
      // Extracted text field
      if (updates.extracted_text !== undefined) {
        updateData.extracted_text = updates.extracted_text;
      }
      if (updates.occurred_at) {
        const newDayKey = getOccurredAtDayKey(updates.occurred_at);
        const entry = await getOrCreateEntryForDate(newDayKey);
        if (!entry) throw new Error('Failed to get/create entry');
        
        updateData.occurred_at = updates.occurred_at;
        updateData.entry_id = entry.id;
      }

      const { data, error } = await supabase
        .from('blocks')
        .update(updateData)
        .eq('id', blockId)
        .select()
        .single();

      if (error) throw error;
      
      if (oldEntryId && updates.occurred_at) {
        await cleanupEmptyEntry(oldEntryId);
      }
      
      return data as unknown as Block;
    } catch (error: unknown) {
      console.error('Error updating block:', error);
      const errMsg = error instanceof Error ? error.message : '';
      const errCode = (error as { code?: string })?.code;
      
      // occurred_at の未来日時エラー
      if (errMsg.includes('future') || errMsg.includes('occurred_at')) {
        toast.error('未来の日時は指定できません');
      // タグ制約違反
      } else if (errMsg.includes('blocks_tag_check') || errMsg.includes('tag')) {
        toast.error('タグの保存に失敗しました');
      // その他のCHECK制約違反
      } else if (errCode === '23514') {
        toast.error('入力値が不正です');
      } else {
        toast.error('ブロックの更新に失敗しました');
      }
      return null;
    }
  }, [userId, getOrCreateEntryForDate, cleanupEmptyEntry]);

  /**
   * ブロック更新（後方互換: content + occurred_at）
   */
  const updateBlockWithOccurredAt = useCallback(async (
    blockId: string, 
    content: string, 
    newOccurredAt?: string
  ) => {
    return updateBlock(blockId, { content, occurred_at: newOccurredAt });
  }, [updateBlock]);

  /**
   * ブロック削除（空entry削除対応）
   */
  const deleteBlock = useCallback(async (blockId: string) => {
    const { data: block } = await supabase
      .from('blocks')
      .select('entry_id')
      .eq('id', blockId)
      .single();
    
    const entryId = block?.entry_id;
    
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('id', blockId);

    if (error) {
      console.error('Error deleting block:', error);
      toast.error('ブロックの削除に失敗しました');
      return false;
    }
    
    if (entryId) {
      await cleanupEmptyEntry(entryId);
    }
    
    return true;
  }, [cleanupEmptyEntry]);

  /**
   * エントリを整形（時刻推測 + 日記生成）
   */
  const formatEntry = useCallback(async (entryId: string, blocks: Block[], date: string): Promise<FormatEntryResponse | null> => {
    if (!session) return null;

    setFormatting(true);
    try {
      const { data, error } = await supabase.functions.invoke('format-entries', {
        body: {
          blocks: blocks.map(b => ({ 
            id: b.id,
            content: b.content, 
            occurred_at: b.occurred_at,
            images: b.images,
            category: b.category,
            is_done: b.is_done,
          })),
          date,
        },
      });

      if (error) throw error;

      const updateData: {
        formatted_content: string;
        summary: string;
        score?: number;
        score_details?: string;
      } = {
        formatted_content: data.formatted_content,
        summary: data.summary,
      };

      // Include score if present
      if (data.score !== undefined) {
        updateData.score = data.score;
      }
      if (data.score_details !== undefined) {
        updateData.score_details = data.score_details;
      }

      const { error: updateError } = await supabase
        .from('entries')
        .update(updateData)
        .eq('id', entryId);

      if (updateError) throw updateError;

      // 時刻更新があった場合のみトースト表示
      if (data.time_updates && data.time_updates.length > 0) {
        toast.success(`${data.time_updates.length}件の時刻を自動調整しました`);
      } else if (data.score !== undefined) {
        toast.success(`整形が完了しました（得点: ${data.score}点）`);
      } else {
        toast.success('整形が完了しました');
      }
      
      return data as FormatEntryResponse;
    } catch (error: unknown) {
      console.error('Error formatting entry:', error);
      const errMsg = error instanceof Error ? error.message : '';
      if (errMsg.includes('429')) {
        toast.error('レート制限に達しました。しばらくしてから再試行してください。');
      } else if (errMsg.includes('402')) {
        toast.error('クレジットが不足しています。');
      } else {
        toast.error('整形に失敗しました');
      }
      return null;
    } finally {
      setFormatting(false);
    }
  }, [session]);

  /**
   * 全エントリを取得
   */
  const getEntries = useCallback(async () => {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching entries:', error);
      return [];
    }
    return data as Entry[];
  }, [userId]);

  /**
   * 特定日付のエントリを取得
   */
  const getEntry = useCallback(async (date: string) => {
    if (!userId) return null;

    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .maybeSingle();

    if (error) {
      console.error('Error fetching entry:', error);
      return null;
    }
    return data as Entry | null;
  }, [userId]);

  /**
   * URLをサマライズ
   */
  const summarizeUrl = useCallback(async (blockId: string, url: string): Promise<UrlMetadata | null> => {
    if (!session) return null;

    try {
      const { data, error } = await supabase.functions.invoke('summarize-url', {
        body: { url, blockId },
      });

      if (error) throw error;

      if (data?.title && data?.summary) {
        const metadata: UrlMetadata = {
          url,
          title: data.title,
          summary: data.summary,
          fetched_at: new Date().toISOString(),
        };

        // DBに保存
        await supabase
          .from('blocks')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ url_metadata: metadata as any })
          .eq('id', blockId);

        return metadata;
      }
      return null;
    } catch (error) {
      console.error('Error summarizing URL:', error);
      return null;
    }
  }, [session]);

  return {
    loading,
    formatting,
    cleanupEmptyEntry,
    getOrCreateEntryForDate,
    getBlocksByDate,
    getBlocksByCategory,
    addBlockWithDate,
    updateBlock,
    updateBlockWithOccurredAt,
    deleteBlock,
    formatEntry,
    getEntries,
    getEntry,
    summarizeUrl,
  };
}
