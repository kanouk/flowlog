import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAIModels, AIModelSafe, AIModelProvider, AIModelInsert } from '@/hooks/useAIModels';
import {
  Bot, Plus, Pencil, Trash2, Loader2, CheckCircle, XCircle, Zap,
  Eye, EyeOff, Key
} from 'lucide-react';
import { toast } from 'sonner';

const PROVIDER_LABELS: Record<AIModelProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
};

interface ModelFormState {
  provider: AIModelProvider;
  display_name: string;
  model_name: string;
  api_key: string;
  note: string;
  is_active: boolean;
}

const EMPTY_FORM: ModelFormState = {
  provider: 'openai',
  display_name: '',
  model_name: '',
  api_key: '',
  note: '',
  is_active: true,
};

export function AIModelManagementSection() {
  const { models, loading, saving, createModel, updateModel, deleteModel, testConnection, testModelById } = useAIModels();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModelSafe | null>(null);
  const [form, setForm] = useState<ModelFormState>(EMPTY_FORM);
  const [showApiKey, setShowApiKey] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AIModelSafe | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const openCreate = () => {
    setEditingModel(null);
    setForm(EMPTY_FORM);
    setShowApiKey(false);
    setDialogOpen(true);
  };

  const openEdit = (model: AIModelSafe) => {
    setEditingModel(model);
    setForm({
      provider: model.provider,
      display_name: model.display_name,
      model_name: model.model_name,
      api_key: '',
      note: model.note || '',
      is_active: model.is_active,
    });
    setShowApiKey(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.display_name.trim() || !form.model_name.trim()) {
      toast.error('表示名とモデル名は必須です');
      return;
    }

    if (editingModel) {
      const updates: Record<string, unknown> = {
        display_name: form.display_name,
        model_name: form.model_name,
        is_active: form.is_active,
        note: form.note || null,
      };
      if (form.api_key) updates.api_key = form.api_key;
      await updateModel(editingModel.id, updates);
    } else {
      if (!form.api_key) {
        toast.error('APIキーは必須です');
        return;
      }
      await createModel({
        provider: form.provider,
        display_name: form.display_name,
        model_name: form.model_name,
        api_key: form.api_key,
        is_active: form.is_active,
        note: form.note || undefined,
      } as AIModelInsert);
    }
    setDialogOpen(false);
  };

  const handleTest = async (model: AIModelSafe) => {
    setTestingId(model.id);
    const result = await testModelById(model.id);
    setTestResults(prev => ({ ...prev, [model.id]: result }));
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
    setTestingId(null);
  };

  const handleTestInDialog = async () => {
    if (!form.api_key) {
      toast.error('APIキーを入力してください');
      return;
    }
    setTestingId('dialog');
    const result = await testConnection(form.provider, form.api_key);
    setTestResults(prev => ({ ...prev, dialog: result }));
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
    setTestingId(null);
  };

  const handleToggleActive = async (model: AIModelSafe) => {
    await updateModel(model.id, { is_active: !model.is_active });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="glass-card rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          生成AIモデル管理
        </h2>
        <Button size="sm" onClick={openCreate} className="gap-1">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        利用するAIモデルを登録し、処理別AI設定から各処理に割り当てます。
      </p>

      {models.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">モデルが登録されていません</p>
          <p className="text-xs mt-1">「新規登録」からモデルを追加してください</p>
        </div>
      ) : (
        <div className="space-y-3">
          {models.map((model) => (
            <div
              key={model.id}
              className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                model.is_active
                  ? 'border-border bg-card'
                  : 'border-border/50 bg-muted/30 opacity-60'
              }`}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{model.display_name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {PROVIDER_LABELS[model.provider]}
                  </span>
                  {model.has_api_key ? (
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-0.5">
                      <CheckCircle className="h-3 w-3" />
                      キー設定済
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600 dark:text-amber-400">キー未設定</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{model.model_name}</p>
                {model.note && (
                  <p className="text-xs text-muted-foreground truncate">{model.note}</p>
                )}
                {testResults[model.id] && (
                  <div className={`flex items-center gap-1 text-xs ${
                    testResults[model.id].success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {testResults[model.id].success ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {testResults[model.id].message}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleTest(model)}
                  disabled={testingId !== null || !model.has_api_key}
                  title="接続テスト"
                >
                  {testingId === model.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                </Button>
                <Switch
                  checked={model.is_active}
                  onCheckedChange={() => handleToggleActive(model)}
                  className="mx-1"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(model)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(model)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingModel ? 'モデルを編集' : '新規モデル登録'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingModel && (
              <div className="space-y-2">
                <Label>プロバイダー</Label>
                <Select value={form.provider} onValueChange={(v) => setForm(prev => ({ ...prev, provider: v as AIModelProvider }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>表示名</Label>
              <Input
                value={form.display_name}
                onChange={(e) => setForm(prev => ({ ...prev, display_name: e.target.value }))}
                placeholder="例: GPT-4o (メイン)"
              />
            </div>

            <div className="space-y-2">
              <Label>モデル名 (API送信用)</Label>
              <Input
                value={form.model_name}
                onChange={(e) => setForm(prev => ({ ...prev, model_name: e.target.value }))}
                placeholder="例: gpt-4o"
              />
              <p className="text-xs text-muted-foreground">APIに送信するモデル識別子</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                APIキー
                {editingModel?.has_api_key && (
                  <span className="text-xs text-green-600 dark:text-green-400 font-normal">(設定済み)</span>
                )}
              </Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={form.api_key}
                  onChange={(e) => setForm(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder={editingModel?.has_api_key ? '新しいキーで上書き...' : 'APIキーを入力'}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
              
              {form.api_key && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestInDialog}
                    disabled={testingId === 'dialog'}
                    className="gap-1"
                  >
                    {testingId === 'dialog' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    接続テスト
                  </Button>
                  {testResults.dialog && (
                    <span className={`text-xs ${testResults.dialog.success ? 'text-green-600' : 'text-red-600'}`}>
                      {testResults.dialog.message}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>メモ (任意)</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm(prev => ({ ...prev, note: e.target.value }))}
                placeholder="メモ"
                className="min-h-[60px]"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>有効</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingModel ? '更新' : '登録'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>モデルを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.display_name}」を削除します。このモデルを使用している処理別設定のモデル割り当ては解除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  deleteModel(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
