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
import { useAIApiKeys, AIApiKeySafe, AIApiKeyProvider } from '@/hooks/useAIApiKeys';
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

// ── APIキー管理 ──

interface ApiKeyFormState {
  provider: AIApiKeyProvider;
  name: string;
  api_key: string;
}

const EMPTY_KEY_FORM: ApiKeyFormState = {
  provider: 'openai',
  name: '',
  api_key: '',
};

function ApiKeyManagementSection() {
  const { keys, loading, saving, createKey, updateKey, deleteKey } = useAIApiKeys();
  const { testConnection, testApiKeyById } = useAIModels();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<AIApiKeySafe | null>(null);
  const [form, setForm] = useState<ApiKeyFormState>(EMPTY_KEY_FORM);
  const [showApiKey, setShowApiKey] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AIApiKeySafe | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const openCreate = () => {
    setEditingKey(null);
    setForm(EMPTY_KEY_FORM);
    setShowApiKey(false);
    setTestResults(prev => { const next = {...prev}; delete next['key-dialog']; return next; });
    setDialogOpen(true);
  };

  const openEdit = (key: AIApiKeySafe) => {
    setEditingKey(key);
    setForm({ provider: key.provider, name: key.name, api_key: '' });
    setShowApiKey(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('名前は必須です'); return; }
    if (editingKey) {
      const updates: Record<string, string> = {};
      if (form.name !== editingKey.name) updates.name = form.name;
      if (form.api_key) updates.api_key = form.api_key;
      if (Object.keys(updates).length === 0) { setDialogOpen(false); return; }
      const ok = await updateKey(editingKey.id, updates);
      if (ok) setDialogOpen(false);
    } else {
      if (!form.api_key) { toast.error('APIキーは必須です'); return; }
      const ok = await createKey({ provider: form.provider, name: form.name, api_key: form.api_key });
      if (ok) setDialogOpen(false);
    }
  };

  const handleTestInDialog = async () => {
    if (!form.api_key) { toast.error('APIキーを入力してください'); return; }
    setTestingId('key-dialog');
    const result = await testConnection(form.provider, form.api_key);
    setTestResults(prev => ({ ...prev, 'key-dialog': result }));
    if (result.success) toast.success(result.message); else toast.error(result.message);
    setTestingId(null);
  };

  const handleTestExisting = async (key: AIApiKeySafe) => {
    setTestingId(key.id);
    const result = await testApiKeyById(key.id);
    setTestResults(prev => ({ ...prev, [key.id]: result }));
    if (result.success) toast.success(result.message); else toast.error(result.message);
    setTestingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="glass-card rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          APIキー管理
        </h2>
        <Button size="sm" onClick={openCreate} className="gap-1">
          <Plus className="h-4 w-4" />
          キー登録
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        プロバイダーごとにAPIキーを名前付きで登録し、複数のモデルで共有できます。
      </p>

      {keys.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Key className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">APIキーが登録されていません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{k.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {PROVIDER_LABELS[k.provider]}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{k.key_hint}</span>
                </div>
                {testResults[k.id] && (
                  <div className={`flex items-center gap-1 text-xs ${testResults[k.id].success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {testResults[k.id].success ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {testResults[k.id].message}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleTestExisting(k)} disabled={testingId !== null} title="接続テスト">
                  {testingId === k.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(k)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(k)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Key Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingKey ? 'APIキーを編集' : '新規APIキー登録'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingKey && (
              <div className="space-y-2">
                <Label>プロバイダー</Label>
                <Select value={form.provider} onValueChange={(v) => setForm(prev => ({ ...prev, provider: v as AIApiKeyProvider }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>キー名</Label>
              <Input value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="例: 個人用、会社用" />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                APIキー
                {editingKey && <span className="text-xs text-muted-foreground font-normal">(変更する場合のみ入力)</span>}
              </Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={form.api_key}
                  onChange={(e) => setForm(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder={editingKey ? '新しいキーで上書き...' : 'APIキーを入力'}
                  className="pr-10"
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3 hover:bg-transparent" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
              {form.api_key && (
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleTestInDialog} disabled={testingId === 'key-dialog'} className="gap-1">
                    {testingId === 'key-dialog' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    接続テスト
                  </Button>
                  {testResults['key-dialog'] && (
                    <span className={`text-xs ${testResults['key-dialog'].success ? 'text-green-600' : 'text-red-600'}`}>
                      {testResults['key-dialog'].message}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingKey ? '更新' : '登録'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Key Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>APIキーを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.name}」({deleteTarget && PROVIDER_LABELS[deleteTarget.provider]}) を削除します。このキーを使用しているモデルのAPIキー設定は解除されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) { deleteKey(deleteTarget.id); setDeleteTarget(null); } }}
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

// ── モデル管理 ──

interface ModelFormState {
  provider: AIModelProvider;
  display_name: string;
  model_name: string;
  api_key_id: string;
  note: string;
  is_active: boolean;
}

const EMPTY_FORM: ModelFormState = {
  provider: 'openai',
  display_name: '',
  model_name: '',
  api_key_id: '',
  note: '',
  is_active: true,
};

export function AIModelManagementSection() {
  const { models, loading, saving, createModel, updateModel, deleteModel, testModelById } = useAIModels();
  const { keys } = useAIApiKeys();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModelSafe | null>(null);
  const [form, setForm] = useState<ModelFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<AIModelSafe | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const openCreate = () => {
    setEditingModel(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (model: AIModelSafe) => {
    setEditingModel(model);
    setForm({
      provider: model.provider,
      display_name: model.display_name,
      model_name: model.model_name,
      api_key_id: model.api_key_id || '',
      note: model.note || '',
      is_active: model.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.display_name.trim() || !form.model_name.trim()) {
      toast.error('表示名とモデル名は必須です');
      return;
    }

    if (editingModel) {
      await updateModel(editingModel.id, {
        display_name: form.display_name,
        model_name: form.model_name,
        is_active: form.is_active,
        note: form.note || null,
        api_key_id: form.api_key_id || null,
      });
    } else {
      await createModel({
        provider: form.provider,
        display_name: form.display_name,
        model_name: form.model_name,
        api_key_id: form.api_key_id || null,
        is_active: form.is_active,
        note: form.note || undefined,
      });
    }
    setDialogOpen(false);
  };

  const handleTest = async (model: AIModelSafe) => {
    setTestingId(model.id);
    const result = await testModelById(model.id);
    setTestResults(prev => ({ ...prev, [model.id]: result }));
    if (result.success) toast.success(result.message); else toast.error(result.message);
    setTestingId(null);
  };

  const handleToggleActive = async (model: AIModelSafe) => {
    await updateModel(model.id, { is_active: !model.is_active });
  };

  // プロバイダーに対応するキーをフィルタ
  const keysForProvider = (provider: AIModelProvider) => keys.filter(k => k.provider === provider);

  if (loading) {
    return (
      <>
        <ApiKeyManagementSection />
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <ApiKeyManagementSection />

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
                  model.is_active ? 'border-border bg-card' : 'border-border/50 bg-muted/30 opacity-60'
                }`}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{model.display_name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {PROVIDER_LABELS[model.provider]}
                    </span>
                    {model.api_key_name ? (
                      <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-0.5">
                        <Key className="h-3 w-3" />
                        {model.api_key_name}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400">キー未設定</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{model.model_name}</p>
                  {model.note && <p className="text-xs text-muted-foreground truncate">{model.note}</p>}
                  {testResults[model.id] && (
                    <div className={`flex items-center gap-1 text-xs ${testResults[model.id].success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {testResults[model.id].success ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {testResults[model.id].message}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleTest(model)} disabled={testingId !== null || !model.api_key_id} title="接続テスト">
                    {testingId === model.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  </Button>
                  <Switch checked={model.is_active} onCheckedChange={() => handleToggleActive(model)} className="mx-1" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(model)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(model)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Model Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingModel ? 'モデルを編集' : '新規モデル登録'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {!editingModel && (
                <div className="space-y-2">
                  <Label>プロバイダー</Label>
                  <Select value={form.provider} onValueChange={(v) => setForm(prev => ({ ...prev, provider: v as AIModelProvider, api_key_id: '' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Input value={form.display_name} onChange={(e) => setForm(prev => ({ ...prev, display_name: e.target.value }))} placeholder="例: GPT-4o (メイン)" />
              </div>

              <div className="space-y-2">
                <Label>モデル名 (API送信用)</Label>
                <Input value={form.model_name} onChange={(e) => setForm(prev => ({ ...prev, model_name: e.target.value }))} placeholder="例: gpt-4o" />
                <p className="text-xs text-muted-foreground">APIに送信するモデル識別子</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  APIキー
                </Label>
                {keysForProvider(editingModel?.provider || form.provider).length === 0 ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    このプロバイダーのAPIキーが登録されていません。上の「APIキー管理」から先に登録してください。
                  </p>
                ) : (
                  <Select value={form.api_key_id} onValueChange={(v) => setForm(prev => ({ ...prev, api_key_id: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="APIキーを選択..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">未設定</SelectItem>
                      {keysForProvider(editingModel?.provider || form.provider).map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.name} ({k.key_hint})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label>メモ (任意)</Label>
                <Textarea value={form.note} onChange={(e) => setForm(prev => ({ ...prev, note: e.target.value }))} placeholder="メモ" className="min-h-[60px]" />
              </div>

              <div className="flex items-center justify-between">
                <Label>有効</Label>
                <Switch checked={form.is_active} onCheckedChange={(checked) => setForm(prev => ({ ...prev, is_active: checked }))} />
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

        {/* Delete Model Confirmation */}
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
                onClick={() => { if (deleteTarget) { deleteModel(deleteTarget.id); setDeleteTarget(null); } }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                削除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </>
  );
}
