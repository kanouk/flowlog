import { useEffect, useState } from 'react';
import { ImageIcon, Key, Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useImageStorageSettings, ImageStorageProvider } from '@/hooks/useImageStorageSettings';

export function ImageStorageSettingsSection() {
  const { settings, loading, saving, saveSettings, resetToDefault } = useImageStorageSettings();
  const [provider, setProvider] = useState<ImageStorageProvider>('default');
  const [gyazoToken, setGyazoToken] = useState('');

  useEffect(() => {
    setProvider(settings.provider);
    setGyazoToken('');
  }, [settings]);

  const handleSave = async () => {
    const ok = await saveSettings(provider, gyazoToken);
    if (ok) setGyazoToken('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="glass-card rounded-2xl p-6 space-y-6">
      <h2 className="text-lg font-medium flex items-center gap-2">
        <ImageIcon className="h-5 w-5 text-primary" />
        画像保存先
      </h2>

      <div className="space-y-2">
        <Label>保存先</Label>
        <Select value={provider} onValueChange={(value) => setProvider(value as ImageStorageProvider)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">デフォルト</SelectItem>
            <SelectItem value="gyazo">Gyazo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {provider === 'gyazo' && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Gyazo API token
            </Label>
            {settings.has_gyazo_token && (
              <p className="text-xs text-muted-foreground">
                登録済み: <span className="font-mono">{settings.gyazo_token_hint}</span>
              </p>
            )}
            <Input
              type="password"
              value={gyazoToken}
              onChange={(event) => setGyazoToken(event.target.value)}
              placeholder={settings.has_gyazo_token ? '変更する場合のみ入力...' : 'Gyazo API token を入力'}
            />
            <p className="text-xs text-muted-foreground">
              tokenは保存時のみ送信され、画面には再表示されません。
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={resetToDefault}
          disabled={saving || (settings.provider === 'default' && !settings.has_gyazo_token)}
          className="gap-2"
        >
          <Trash2 className="h-4 w-4" />
          解除
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存
        </Button>
      </div>
    </section>
  );
}
