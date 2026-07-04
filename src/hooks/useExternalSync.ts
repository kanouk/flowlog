import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export function useExternalSync() {
  const [syncing, setSyncing] = useState(false);
  const lastSyncRef = useRef<number>(0);

  const syncRaindrop = useCallback(async (mode: 'full' | 'diff' = 'diff') => {
    // Cooldown check for diff mode
    if (mode === 'diff') {
      const now = Date.now();
      if (now - lastSyncRef.current < SYNC_COOLDOWN_MS) {
        return null;
      }
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('raindrop-sync', {
        body: { mode },
      });

      if (error) throw error;

      lastSyncRef.current = Date.now();

      if (data?.imported > 0) {
        toast.success('Raindrop同期完了', {
          description: `${data.imported}件のブックマークをインポートしました`,
        });
      }

      return data;
    } catch (err) {
      console.error('Raindrop sync error:', err);
      if (mode === 'full') {
        toast.error('同期エラー', {
          description: err instanceof Error ? err.message : '同期に失敗しました',
        });
      }
      return null;
    } finally {
      setSyncing(false);
    }
  }, []);

  const hasRaindropToken = useCallback(async (): Promise<boolean> => {
    const { data } = await supabase
      .from('user_external_tokens')
      .select('id')
      .eq('service', 'raindrop')
      .maybeSingle();
    return !!data;
  }, []);

  return { syncRaindrop, syncing, hasRaindropToken };
}
