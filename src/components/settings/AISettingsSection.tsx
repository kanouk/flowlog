import { useState, useEffect } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAISettings, AIProvider, AI_MODELS } from '@/hooks/useAISettings';
import { Bot, Key, Eye, EyeOff, Loader2, Check, Sparkles } from 'lucide-react';

const PROVIDER_LABELS: Record<AIProvider, string> = {
  lovable: 'Lovable AI (無料)',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
};

const PROVIDER_DESCRIPTIONS: Record<AIProvider, string> = {
  lovable: 'APIキー不要で利用可能な組み込みAI',
  openai: 'GPT-5.2, GPT-5, o3シリーズなど',
  anthropic: 'Claude Opus 4, Sonnet 4など',
  google: 'Gemini 2.5 Pro/Flashなど',
};

export function AISettingsSection() {
  const { settings, loading, saving, saveSettings, getModelsForProvider } = useAISettings();
  
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('lovable');
  const [selectedModel, setSelectedModel] = useState('google/gemini-2.5-flash');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!loading) {
      setSelectedProvider(settings.selected_provider);
      setSelectedModel(settings.selected_model);
      setOpenaiKey(settings.openai_api_key || '');
      setAnthropicKey(settings.anthropic_api_key || '');
      setGoogleKey(settings.google_api_key || '');
    }
  }, [loading, settings]);

  useEffect(() => {
    const changed = 
      selectedProvider !== settings.selected_provider ||
      selectedModel !== settings.selected_model ||
      openaiKey !== (settings.openai_api_key || '') ||
      anthropicKey !== (settings.anthropic_api_key || '') ||
      googleKey !== (settings.google_api_key || '');
    setHasChanges(changed);
  }, [selectedProvider, selectedModel, openaiKey, anthropicKey, googleKey, settings]);

  const handleProviderChange = (provider: AIProvider) => {
    setSelectedProvider(provider);
    const models = getModelsForProvider(provider);
    if (models.length > 0) {
      setSelectedModel(models[0].id);
    }
  };

  const handleSave = async () => {
    await saveSettings({
      selected_provider: selectedProvider,
      selected_model: selectedModel,
      openai_api_key: openaiKey || null,
      anthropic_api_key: anthropicKey || null,
      google_api_key: googleKey || null,
    });
  };

  const availableModels = getModelsForProvider(selectedProvider);
  const needsApiKey = selectedProvider !== 'lovable';
  const currentApiKey = 
    selectedProvider === 'openai' ? openaiKey :
    selectedProvider === 'anthropic' ? anthropicKey :
    selectedProvider === 'google' ? googleKey : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="glass-card rounded-2xl p-6 space-y-6">
      <h2 className="text-lg font-medium flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        生成AI設定
      </h2>

      {/* Provider Selection Tabs */}
      <div className="space-y-4">
        <Label>AIプロバイダー</Label>
        <Tabs value={selectedProvider} onValueChange={(v) => handleProviderChange(v as AIProvider)}>
          <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
            {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map((provider) => (
              <TabsTrigger 
                key={provider} 
                value={provider}
                className="text-xs md:text-sm"
              >
                {provider === 'lovable' && <Sparkles className="h-3 w-3 mr-1" />}
                {PROVIDER_LABELS[provider]}
              </TabsTrigger>
            ))}
          </TabsList>

          {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map((provider) => (
            <TabsContent key={provider} value={provider} className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                {PROVIDER_DESCRIPTIONS[provider]}
              </p>

              {/* API Key Input (not for lovable) */}
              {provider !== 'lovable' && (
                <div className="space-y-2">
                  <Label htmlFor={`${provider}-key`} className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    APIキー
                  </Label>
                  <div className="relative">
                    <Input
                      id={`${provider}-key`}
                      type={
                        provider === 'openai' ? (showOpenaiKey ? 'text' : 'password') :
                        provider === 'anthropic' ? (showAnthropicKey ? 'text' : 'password') :
                        showGoogleKey ? 'text' : 'password'
                      }
                      value={
                        provider === 'openai' ? openaiKey :
                        provider === 'anthropic' ? anthropicKey :
                        googleKey
                      }
                      onChange={(e) => {
                        if (provider === 'openai') setOpenaiKey(e.target.value);
                        else if (provider === 'anthropic') setAnthropicKey(e.target.value);
                        else setGoogleKey(e.target.value);
                      }}
                      placeholder={
                        provider === 'openai' ? 'sk-...' :
                        provider === 'anthropic' ? 'sk-ant-...' :
                        'AI...'
                      }
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => {
                        if (provider === 'openai') setShowOpenaiKey(!showOpenaiKey);
                        else if (provider === 'anthropic') setShowAnthropicKey(!showAnthropicKey);
                        else setShowGoogleKey(!showGoogleKey);
                      }}
                    >
                      {(provider === 'openai' ? showOpenaiKey : provider === 'anthropic' ? showAnthropicKey : showGoogleKey) 
                        ? <EyeOff className="h-4 w-4 text-muted-foreground" /> 
                        : <Eye className="h-4 w-4 text-muted-foreground" />
                      }
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {provider === 'openai' && 'platform.openai.com で取得できます'}
                    {provider === 'anthropic' && 'console.anthropic.com で取得できます'}
                    {provider === 'google' && 'aistudio.google.com で取得できます'}
                  </p>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Model Selection */}
      <div className="space-y-2">
        <Label>使用するモデル</Label>
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger>
            <SelectValue placeholder="モデルを選択" />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {needsApiKey && !currentApiKey && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ このプロバイダーを使用するにはAPIキーが必要です
          </p>
        )}
      </div>

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
