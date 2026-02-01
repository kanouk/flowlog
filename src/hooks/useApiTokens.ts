import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ApiToken {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export function useApiTokens() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTokens = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_api_tokens')
        .select('id, name, created_at, last_used_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTokens(data || []);
    } catch (error) {
      console.error('Failed to fetch tokens:', error);
      toast({
        variant: 'destructive',
        title: 'エラー',
        description: 'トークンの取得に失敗しました',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const generateToken = useCallback(async (name: string): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // ランダムなトークンを生成
      const tokenBytes = new Uint8Array(32);
      crypto.getRandomValues(tokenBytes);
      const rawToken = Array.from(tokenBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // SHA-256ハッシュを計算
      const encoder = new TextEncoder();
      const data = encoder.encode(rawToken);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // DBに保存
      const { error } = await supabase
        .from('user_api_tokens')
        .insert({
          user_id: user.id,
          token_hash: tokenHash,
          name: name || 'Default',
        });

      if (error) throw error;

      await fetchTokens();

      toast({
        title: 'トークンを生成しました',
        description: 'このトークンは一度だけ表示されます。必ずコピーしてください。',
      });

      return rawToken;
    } catch (error) {
      console.error('Failed to generate token:', error);
      toast({
        variant: 'destructive',
        title: 'エラー',
        description: 'トークンの生成に失敗しました',
      });
      return null;
    }
  }, [fetchTokens, toast]);

  const deleteToken = useCallback(async (tokenId: string) => {
    try {
      const { error } = await supabase
        .from('user_api_tokens')
        .delete()
        .eq('id', tokenId);

      if (error) throw error;

      setTokens(prev => prev.filter(t => t.id !== tokenId));
      toast({
        title: 'トークンを削除しました',
      });
    } catch (error) {
      console.error('Failed to delete token:', error);
      toast({
        variant: 'destructive',
        title: 'エラー',
        description: 'トークンの削除に失敗しました',
      });
    }
  }, [toast]);

  return {
    tokens,
    loading,
    generateToken,
    deleteToken,
    refreshTokens: fetchTokens,
  };
}
