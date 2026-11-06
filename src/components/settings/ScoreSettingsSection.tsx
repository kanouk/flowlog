import {useAIModels} from '@/hooks/useAIModels';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAIFeatureSettings } from '@/hooks/useAIFeatureSettings';
import { Trophy, ChevronDown, Loader2, Check, Info } from 'lucide-react';

const DEFAULT_BEHAVIOR_RULES = `- お酒を飲まない (-20点)
- 22時までに就寝する (-15点)
- SNSを2時間以上見ない (-10点)
- 間食をしない (-10点)
- 毎日運動する (-15点)`;

export function ScoreSettingsSection() {
  const { getSettingForFeature, upsertSetting, loading, saving } = useAIFeatureSettings();
  
  const {activeModels}=useAIModels();
  const [modelId,setModelId]=useState<string|null>(null);
  const [originalModel,setOriginalModel]=useState<string|null>(null);
  const [scoreEnabled, setScoreEnabled] = useState(false);
  const [behaviorRules, setBehaviorRules] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Track original values for change detection
  const [origEnabled, setOrigEnabled] = useState(false);
  const [origRules, setOrigRules] = useState('');

  // Sync local state with DB settings reactively (not just once)
  useEffect(() => {
    if (loading) return;
    const scoreSetting = getSettingForFeature('score_evaluation');
    const enabled = scoreSetting?.enabled ?? false;
    const rules = scoreSetting?.user_prompt_template || '';

    // Only sync from DB if user has no unsaved local changes
    if (!hasChanges) {
      setModelId(scoreSetting?.assigned_model_id||null);
      setScoreEnabled(enabled);
      setBehaviorRules(rules);
      if (enabled) {
        setIsOpen(true);
      }
    }
    setOriginalModel(scoreSetting?.assigned_model_id||null);
    setOrigEnabled(enabled);
    setOrigRules(rules);
  }, [loading, getSettingForFeature]);

  useEffect(() => {
    const enabledChanged = scoreEnabled !== origEnabled;
    const rulesChanged = behaviorRules !== origRules;
    setHasChanges(enabledChanged || rulesChanged || modelId!==originalModel);
  }, [scoreEnabled, behaviorRules, origEnabled, origRules,modelId,originalModel]);

  const handleSave = async () => {
    const success = await upsertSetting('score_evaluation', {
      assigned_model_id:modelId,
      enabled: scoreEnabled,
      user_prompt_template: behaviorRules || null,
    });
    if (success) {
      setOriginalModel(modelId);
      setOrigEnabled(scoreEnabled);
      setOrigRules(behaviorRules);
    }
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
          <Trophy className="h-5 w-5 text-amber-500" />
          今日の得点
        </h2>
        <Switch
          checked={scoreEnabled}
          onCheckedChange={(checked) => {
            setScoreEnabled(checked);
            if (checked) setIsOpen(true);
          }}
        />
      </div>

      {/* Explanation */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
          <p className="font-medium">損失回避でモチベーションを維持</p>
          <p className="text-amber-700 dark:text-amber-300">
            毎日100点からスタート。行動規範に反すると減点されます。
            点数を守ることで、良い習慣を維持しましょう。
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="score-model">採点に使うモデル</Label>
        <Select value={modelId||'_none'} onValueChange={value=>setModelId(value==='_none'?null:value)}>
          <SelectTrigger id="score-model"><SelectValue placeholder="モデルを選択" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">未設定（採点を実行しない）</SelectItem>
            {activeModels.map(model=><SelectItem key={model.id} value={model.id}>{model.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
        {!modelId&&scoreEnabled&&<p className="text-xs text-amber-700 dark:text-amber-300">採点を使うには、APIキーを登録したモデルを選択してください。</p>}
      </div>

      {/* Behavior Rules */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between p-0 h-auto hover:bg-transparent"
            disabled={!scoreEnabled}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              行動規範
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="behavior-rules" className="text-sm text-muted-foreground">
              守りたいルールを入力してください（減点値も記載可）
            </Label>
            <Textarea
              id="behavior-rules"
              value={behaviorRules || ''}
              onChange={(e) => setBehaviorRules(e.target.value)}
              placeholder={DEFAULT_BEHAVIOR_RULES}
              className="min-h-[180px] text-sm font-mono"
              disabled={!scoreEnabled}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            例: 「- お酒を飲まない (-20点)」「- 22時までに就寝する (-15点)」
          </p>
        </CollapsibleContent>
      </Collapsible>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={saving || !hasChanges}
        className="w-full gap-2"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            保存中...
          </>
        ) : hasChanges ? (
          '設定を保存'
        ) : (
          <>
            <Check className="h-4 w-4" />
            保存済み
          </>
        )}
      </Button>
    </section>
  );
}
