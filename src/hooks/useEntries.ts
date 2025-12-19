import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { format } from 'date-fns';
import { toast } from 'sonner';

export interface Block {
  id: string;
  entry_id: string;
  user_id: string;
  content: string;
  created_at: string;
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

export function useEntries() {
  const { user, session } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formatting, setFormatting] = useState(false);

  const getTodayEntry = useCallback(async () => {
    if (!user) return null;
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    if (error) {
      console.error('Error fetching entry:', error);
      return null;
    }
    return data as Entry | null;
  }, [user]);

  const getOrCreateTodayEntry = useCallback(async () => {
    if (!user) return null;

    const existing = await getTodayEntry();
    if (existing) return existing;

    const today = format(new Date(), 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('entries')
      .insert({ user_id: user.id, date: today })
      .select()
      .single();

    if (error) {
      console.error('Error creating entry:', error);
      return null;
    }
    return data as Entry;
  }, [user, getTodayEntry]);

  const getBlocks = useCallback(async (entryId: string) => {
    const { data, error } = await supabase
      .from('blocks')
      .select('*')
      .eq('entry_id', entryId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching blocks:', error);
      return [];
    }
    return data as Block[];
  }, []);

  const addBlock = useCallback(async (content: string) => {
    if (!user) return null;

    setLoading(true);
    try {
      const entry = await getOrCreateTodayEntry();
      if (!entry) throw new Error('Failed to get/create entry');

      const { data, error } = await supabase
        .from('blocks')
        .insert({
          entry_id: entry.id,
          user_id: user.id,
          content,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Block;
    } catch (error) {
      console.error('Error adding block:', error);
      toast.error('ブロックの保存に失敗しました');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, getOrCreateTodayEntry]);

  const deleteBlock = useCallback(async (blockId: string) => {
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('id', blockId);

    if (error) {
      console.error('Error deleting block:', error);
      toast.error('ブロックの削除に失敗しました');
      return false;
    }
    return true;
  }, []);

  const formatEntry = useCallback(async (entryId: string, blocks: Block[], date: string) => {
    if (!session) return null;

    setFormatting(true);
    try {
      const { data, error } = await supabase.functions.invoke('format-entries', {
        body: {
          blocks: blocks.map(b => ({ content: b.content, created_at: b.created_at })),
          date,
        },
      });

      if (error) throw error;

      // Update the entry with formatted content
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
    getTodayEntry,
    getOrCreateTodayEntry,
    getBlocks,
    addBlock,
    deleteBlock,
    formatEntry,
    getEntries,
    getEntry,
  };
}
