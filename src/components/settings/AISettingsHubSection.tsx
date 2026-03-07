import { Bot, CheckCircle2, Circle } from 'lucide-react';
import { AIModelManagementSection, ApiKeyManagementSection } from '@/components/settings/AIModelManagementSection';
import { AIFeatureSettingsSection } from '@/components/settings/AIFeatureSettingsSection';
import { useAIApiKeys } from '@/hooks/useAIApiKeys';
import { useAIModels } from '@/hooks/useAIModels';
import { useAIFeatureSettings } from '@/hooks/useAIFeatureSettings';

export function AISettingsHubSection() {
  const { keys, loading: keysLoading } = useAIApiKeys();
  const { activeModels, loading: modelsLoading } = useAIModels();
  const { settings, loading: featuresLoading } = useAIFeatureSettings();

  const hasKeys = keys.length > 0;
  const hasModels = activeModels.length > 0;
  const hasFeatureAssignments = settings.some(setting => setting.assigned_model_id);
  const readyCount = [hasKeys, hasModels, hasFeatureAssignments].filter(Boolean).length;
  const isLoading = keysLoading || modelsLoading || featuresLoading;

  const steps = [
    {
      title: '1. APIキー登録',
      description: '最初に利用するプロバイダーのAPIキーを登録します。',
      done: hasKeys,
    },
    {
      title: '2. モデル登録',
      description: '登録したAPIキーを使うモデルを作成します。',
      done: hasModels,
    },
    {
      title: '3. 処理別設定',
      description: '各処理に使うモデルとプロンプトを割り当てます。',
      done: hasFeatureAssignments,
    },
  ];

  return (
    <section className="space-y-6">
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-medium">生成AI</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          まずAPIキーを登録し、そのキーを使うモデルを作成し、最後に各処理へ割り当てます。
        </p>
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
          <p className="text-sm font-medium">
            セットアップ状況: {isLoading ? '確認中...' : `${readyCount} / 3 完了`}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.done ? CheckCircle2 : Circle;
            return (
              <div
                key={step.title}
                className={`rounded-xl border p-4 ${
                  step.done
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${step.done ? 'text-emerald-500' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium">{step.title}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{step.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-6">
        <ApiKeyManagementSection />
        <AIModelManagementSection />
        <AIFeatureSettingsSection />
      </div>
    </section>
  );
}
