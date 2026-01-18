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

export interface Block {
  id: string;
  entry_id: string;
  user_id: string;
  content: string;
  occurred_at: string;  // ユーザー意味の日時
  created_at: string;   // 内部用（監査/安定ソート）
}

export interface Entry {
  id: string;
  user_id: string;
  date: string;
  summary: string | null;
  formatted_content: string | null;
  created_at: string;
  updated_at: string;
}

export type AddBlockMode = 'toSelectedDate' | 'toNow';

export function useEntries() {
  const { user, session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formatting, setFormatting] = useState(false);

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
    if (!user) return null;

    const { data: existing } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', dayKey)
      .maybeSingle();

    if (existing) return existing as Entry;

    const { data, error } = await supabase
      .from('entries')
      .insert({ user_id: user.id, date: dayKey })
      .select()
      .single();

    if (error) {
      console.error('Error creating entry:', error);
      return null;
    }
    return data as Entry;
  }, [user]);

  /**
   * 指定日付のブロックを occurred_at 範囲で取得
   */
  const getBlocksByDate = useCallback(async (selectedDate: string) => {
    if (!user) return [];
    const { start, end } = getDateRangeUTC(selectedDate);
    
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .eq('user_id', user.id)
      .gte('occurred_at', start)
      .lt('occurred_at', end)
      .order('occurred_at', { ascending: true })
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching blocks:', error);
      return [];
    }
    return data as Block[];
  }, [user]);

  /**
   * ブロック追加（過去日対応 + "今で追加"モード）
   */
  const addBlockWithDate = useCallback(async ({ 
    content, 
    selectedDate, 
    mode 
  }: { content: string; selectedDate: string; mode: AddBlockMode }) => {
    if (!user) return { block: null, navigateToDate: null };

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
          .eq('user_id', user.id)
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

      const { data, error } = await supabase
        .from('blocks')
        .insert({
          entry_id: entry.id,
          user_id: user.id,
          content,
          occurred_at: occurredAt,
        })
        .select()
        .single();

      if (error) throw error;
      
      const navigateToDate = mode === 'toNow' && !isToday ? today : null;
      
      return { block: data as Block, navigateToDate };
    } catch (error) {
      console.error('Error adding block:', error);
      toast.error('ブロックの保存に失敗しました');
      return { block: null, navigateToDate: null };
    } finally {
      setLoading(false);
    }
  }, [user, getOrCreateEntryForDate]);

  /**
   * ブロック更新（content + occurred_at）
   */
  const updateBlockWithOccurredAt = useCallback(async (
    blockId: string, 
    content: string, 
    newOccurredAt?: string
  ) => {
    if (!user) return null;

    if (newOccurredAt && isFutureDate(newOccurredAt)) {
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
      
      let updateData: { content: string; occurred_at?: string; entry_id?: string } = { content };
      
      if (newOccurredAt) {
        const newDayKey = getOccurredAtDayKey(newOccurredAt);
        const entry = await getOrCreateEntryForDate(newDayKey);
        if (!entry) throw new Error('Failed to get/create entry');
        
        updateData = {
          content,
          occurred_at: newOccurredAt,
          entry_id: entry.id,
        };
      }

      const { data, error } = await supabase
        .from('blocks')
        .update(updateData)
        .eq('id', blockId)
        .select()
        .single();

      if (error) throw error;
      
      if (oldEntryId && newOccurredAt) {
        await cleanupEmptyEntry(oldEntryId);
      }
      
      return data as Block;
    } catch (error: any) {
      console.error('Error updating block:', error);
      if (error.message?.includes('future')) {
        toast.error('未来の日時は指定できません');
      } else {
        toast.error('ブロックの更新に失敗しました');
      }
      return null;
    }
  }, [user, getOrCreateEntryForDate, cleanupEmptyEntry]);

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
   * エントリを整形
   */
  const formatEntry = useCallback(async (entryId: string, blocks: Block[], date: string) => {
    if (!session) return null;

    setFormatting(true);
    try {
      const { data, error } = await supabase.functions.invoke('format-entries', {
        body: {
          blocks: blocks.map(b => ({ content: b.content, occurred_at: b.occurred_at })),
          date,
        },
      });

      if (error) throw error;

      const { error: updateError } = await supabase
        .from('entries')
        .update({
          formatted_content: data.formatted_content,
          summary: data.summary,
        })
        .eq('id', entryId);

      if (updateError) throw updateError;

      toast.success('整形が完了しました');
      return data;
    } catch (error: any) {
      console.error('Error formatting entry:', error);
      if (error.message?.includes('429')) {
        toast.error('レート制限に達しました。しばらくしてから再試行してください。');
      } else if (error.message?.includes('402')) {
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
    if (!user) return [];

    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching entries:', error);
      return [];
    }
    return data as Entry[];
  }, [user]);

  /**
   * 特定日付のエントリを取得
   */
  const getEntry = useCallback(async (date: string) => {
    if (!user) return null;

    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', date)
      .maybeSingle();

    if (error) {
      console.error('Error fetching entry:', error);
      return null;
    }
    return data as Entry | null;
  }, [user]);

  return {
    loading,
    formatting,
    getBlocksByDate,
    getOrCreateEntryForDate,
    addBlockWithDate,
    updateBlockWithOccurredAt,
    deleteBlock,
    formatEntry,
    getEntries,
    getEntry,
  };
}
