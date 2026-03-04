import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAIFeatureSettings, FEATURE_DEFINITIONS, FeatureKey } from '@/hooks/useAIFeatureSettings';
import { useAIModels, AIModelSafe } from '@/hooks/useAIModels';
import {
  Settings2, ChevronDown, Loader2, Check, RotateCcw, AlertTriangle,
  FileText, Clock, Trophy, Bookmark, ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';

const FEATURE_ICONS: Record<FeatureKey, React.ElementType> = {
  diary_format: FileText,
  time_inference: Clock,
  score_evaluation: Trophy,
  url_summary: Bookmark,
  ocr: ImageIcon,
};

interface FeatureCardState {
  assigned_model_id: string | null;
  system_prompt: string;
  user_prompt_template: string;
  enabled: boolean;
  dirty: boolean;
}

function FeatureCard({
  featureKey,
  activeModels,
  saving,
  initialData,
  onSave,
  onReset,
}: {
  featureKey: FeatureKey;
  activeModels: AIModelSafe[];
  saving: boolean;
  initialData: {
    assigned_model_id: string | null;
    system_prompt: string | null;
    user_prompt_template: string | null;
    enabled: boolean;
  } | null;
  onSave: (featureKey: FeatureKey, data: { assigned_model_id?: string | null; system_prompt?: string | null; user_prompt_template?: string | null; enabled?: boolean }) => Promise<boolean>;
  onReset: (featureKey: FeatureKey) => Promise<boolean>;
}) {
  const def = FEATURE_DEFINITIONS.find(d => d.key === featureKey)!;
  const Icon = FEATURE_ICONS[featureKey];
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FeatureCardState>({
    assigned_model_id: initialData?.assigned_model_id || null,
    system_prompt: initialData?.system_prompt || '',
    user_prompt_template: initialData?.user_prompt_template || '',
    enabled: initialData?.enabled ?? true,
    dirty: false,
  });

  useEffect(() => {
    setState({
      assigned_model_id: initialData?.assigned_model_id || null,
      system_prompt: initialData?.system_prompt || '',
      user_prompt_template: initialData?.user_prompt_template || '',
      enabled: initialData?.enabled ?? true,
      dirty: false,
    });
  }, [initialData]);

  const handleChange = (field: string, value: unknown) => {
    setState(prev => ({ ...prev, [field]: value, dirty: true }));
  };

  const handleSave = async () => {
    const success = await onSave(featureKey, {
      assigned_model_id: state.assigned_model_id || null,
      system_prompt: state.system_prompt || null,
      user_prompt_template: state.user_prompt_template || null,
      enabled: state.enabled,
    });
    if (success) setState(prev => ({ ...prev, dirty: false }));
  };

  const handleReset = async () => {
    await onReset(featureKey);
  };

  const assignedModel = activeModels.find(m => m.id === state.assigned_model_id);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left">
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-primary flex-shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{def.label}</span>
                  {!state.enabled && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">無効</span>
                  )}
                  {state.dirty && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">未保存</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{def.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!assignedModel && state.enabled && (
                <span className="text-xs text-muted-foreground">デフォルト</span>
              )}
              {assignedModel && (
                <span className="text-xs text-primary">{assignedModel.display_name}</span>
              )}
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-4 pt-0 space-y-4 border-t border-border">
            {/* Enable toggle */}
            <div className="flex items-center justify-between pt-3">
              <Label className="text-sm">有効</Label>
              <Switch
                checked={state.enabled}
                onCheckedChange={(v) => handleChange('enabled', v)}
              />
            </div>

            {/* Model selection */}
            <div className="space-y-2">
              <Label className="text-sm">使用モデル</Label>
              <Select
                value={state.assigned_model_id || '_default'}
                onValueChange={(v) => handleChange('assigned_model_id', v === '_default' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="デフォルト (Lovable AI)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_default">デフォルト (Lovable AI)</SelectItem>
                  {activeModels.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name} ({m.model_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeModels.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  モデルが未登録です。「生成AIモデル管理」から登録してください。
                </p>
              )}
            </div>

            {/* System prompt */}
            <div className="space-y-2">
              <Label className="text-sm">システムプロンプト</Label>
              <Textarea
                value={state.system_prompt || def.defaultSystemPrompt}
                onChange={(e) => handleChange('system_prompt', e.target.value)}
                placeholder={def.defaultSystemPrompt || 'デフォルトを使用'}
                className="min-h-[120px] text-xs font-mono"
              />
            </div>

            {/* User prompt template */}
            {def.defaultUserPromptTemplate && (
              <div className="space-y-2">
                <Label className="text-sm">ユーザープロンプトテンプレート</Label>
                <Textarea
                  value={state.user_prompt_template || def.defaultUserPromptTemplate}
                  onChange={(e) => handleChange('user_prompt_template', e.target.value)}
                  placeholder={def.defaultUserPromptTemplate}
                  className="min-h-[80px] text-xs font-mono"
                />
                {def.templateVars.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    利用可能な変数: {def.templateVars.map(v => `{{${v}}}`).join(', ')}
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                デフォルトに戻す
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !state.dirty}
                className="gap-1"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                保存
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function AIFeatureSettingsSection() {
  const { settings, loading, saving, getSettingForFeature, upsertSetting, deleteSetting } = useAIFeatureSettings();
  const { activeModels, loading: modelsLoading } = useAIModels();

  if (loading || modelsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="glass-card rounded-2xl p-6 space-y-6">
      <h2 className="text-lg font-medium flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-primary" />
        処理別AI設定
      </h2>

      <p className="text-sm text-muted-foreground">
        各AI処理ごとに使用モデルとプロンプトを個別に設定できます。未設定の場合はデフォルト (Lovable AI) が使用されます。
      </p>

      <div className="space-y-3">
        {FEATURE_DEFINITIONS.map(def => {
          const setting = getSettingForFeature(def.key);
          return (
            <FeatureCard
              key={def.key}
              featureKey={def.key}
              activeModels={activeModels}
              saving={saving}
              initialData={setting ? {
                assigned_model_id: setting.assigned_model_id,
                system_prompt: setting.system_prompt,
                user_prompt_template: setting.user_prompt_template,
                enabled: setting.enabled,
              } : null}
              onSave={upsertSetting}
              onReset={deleteSetting}
            />
          );
        })}
      </div>
    </section>
  );
}
