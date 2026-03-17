import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useExternalSync } from '@/hooks/useExternalSync';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CloudRain, Check, Trash2, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export function RaindropIntegrationSection() {
  const { user } = useAuth();
  const { syncRaindrop, syncing } = useExternalSync();
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadToken();
  }, [user]);

  const loadToken = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('user_external_tokens')
        .select('id, last_synced_at')
        .eq('service', 'raindrop')
        .maybeSingle();
      setHasToken(!!data);
      setLastSynced(data?.last_synced_at || null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !token.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_external_tokens')
        .upsert(
          { user_id: user.id, service: 'raindrop', token: token.trim() },
          { onConflict: 'user_id,service' }
        );

      if (error) throw error;

      setHasToken(true);
      setToken('');
      toast({ title: 'トークンを保存しました', description: '初期同期を開始します...' });

      // Trigger initial full sync
      const result = await syncRaindrop('full');
      if (result) {
        setLastSynced(new Date().toISOString());
      }
    } catch (err) {
      toast({
        title: '保存エラー',
        description: err instanceof Error ? err.message : '保存に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    const { error } = await supabase
      .from('user_external_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('service', 'raindrop');

    if (error) {
      toast({ title: '削除エラー', variant: 'destructive' });
      return;
    }
    setHasToken(false);
    setLastSynced(null);
    toast({ title: 'Raindrop連携を解除しました' });
  };

  const handleManualSync = async () => {
    const result = await syncRaindrop('full');
    if (result) {
      setLastSynced(new Date().toISOString());
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500">
          <CloudRain className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-medium text-foreground">Raindrop.io</h3>
          <p className="text-xs text-muted-foreground">ブックマークを「あとで」にインポート</p>
        </div>
        {hasToken && (
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium">
            <Check className="h-3 w-3" />
            連携中
          </span>
        )}
      </div>

      {hasToken ? (
        <div className="space-y-3">
          {lastSynced && (
            <p className="text-xs text-muted-foreground">
              最終同期: {new Date(lastSynced).toLocaleString('ja-JP')}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualSync}
              disabled={syncing}
              className="gap-1"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              手動同期
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDelete}
              className="gap-1 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              解除
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Raindropの <a href="https://app.raindrop.io/settings/integrations" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">設定 → Integrations → For Developers</a> からテストトークンを取得してください。
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="テストトークンを入力..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleSave}
              disabled={!token.trim() || saving}
              className="gap-1"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
