import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAISettings, AIProvider, DEFAULT_SYSTEM_PROMPT } from '@/hooks/useAISettings';
import { Bot, Key, Eye, EyeOff, Loader2, Check, Sparkles, Zap, XCircle, CheckCircle, ChevronDown, RotateCcw, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  const [customPrompt, setCustomPrompt] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  
  // Connection test state
  const [testingProvider, setTestingProvider] = useState<AIProvider | null>(null);
  const [testResult, setTestResult] = useState<{ provider: AIProvider; success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!loading) {
      setSelectedProvider(settings.selected_provider);
      setSelectedModel(settings.selected_model);
      setOpenaiKey(settings.openai_api_key || '');
      setAnthropicKey(settings.anthropic_api_key || '');
      setGoogleKey(settings.google_api_key || '');
      setCustomPrompt(settings.custom_system_prompt || '');
    }
  }, [loading, settings]);

  useEffect(() => {
    const changed = 
      selectedProvider !== settings.selected_provider ||
      selectedModel !== settings.selected_model ||
      openaiKey !== (settings.openai_api_key || '') ||
      anthropicKey !== (settings.anthropic_api_key || '') ||
      googleKey !== (settings.google_api_key || '') ||
      customPrompt !== (settings.custom_system_prompt || '');
    setHasChanges(changed);
  }, [selectedProvider, selectedModel, openaiKey, anthropicKey, googleKey, customPrompt, settings]);

  // Clear test result when API key changes
  useEffect(() => {
    setTestResult(null);
  }, [openaiKey, anthropicKey, googleKey]);

  const handleProviderChange = (provider: AIProvider) => {
    setSelectedProvider(provider);
    const models = getModelsForProvider(provider);
    if (models.length > 0) {
      setSelectedModel(models[0].id);
    }
    setTestResult(null);
  };

  const handleTestConnection = async (provider: AIProvider) => {
    const apiKey = 
      provider === 'openai' ? openaiKey :
      provider === 'anthropic' ? anthropicKey :
      provider === 'google' ? googleKey : '';

    if (!apiKey) {
      toast.error('APIキーを入力してください');
      return;
    }

    setTestingProvider(provider);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('test-ai-connection', {
        body: { provider, api_key: apiKey },
      });

      if (error) {
        setTestResult({ provider, success: false, message: error.message });
      } else {
        setTestResult({ provider, success: data.success, message: data.message });
        if (data.success) {
          toast.success(data.message);
        } else {
          toast.error(data.message);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '接続テストに失敗しました';
      setTestResult({ provider, success: false, message });
      toast.error(message);
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSave = async () => {
    await saveSettings({
      selected_provider: selectedProvider,
      selected_model: selectedModel,
      openai_api_key: openaiKey || null,
      anthropic_api_key: anthropicKey || null,
      google_api_key: googleKey || null,
      custom_system_prompt: customPrompt || null,
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
          <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full h-auto gap-1 p-1">
            {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map((provider) => (
              <TabsTrigger 
                key={provider} 
                value={provider}
                className="text-[11px] md:text-sm px-2 py-2 whitespace-nowrap"
              >
                {provider === 'lovable' && <Sparkles className="h-3 w-3 mr-1 flex-shrink-0" />}
                <span className="truncate">
                  {provider === 'lovable' ? 'Lovable AI' : 
                   provider === 'openai' ? 'OpenAI' :
                   provider === 'anthropic' ? 'Claude' : 'Gemini'}
                </span>
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
                <div className="space-y-3">
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
                  
                  {/* Connection Test Button */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(provider)}
                      disabled={testingProvider !== null || !(
                        provider === 'openai' ? openaiKey :
                        provider === 'anthropic' ? anthropicKey :
                        googleKey
                      )}
                      className="gap-2"
                    >
                      {testingProvider === provider ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          テスト中...
                        </>
                      ) : (
                        <>
                          <Zap className="h-3 w-3" />
                          接続テスト
                        </>
                      )}
                    </Button>
                    
                    {/* Test Result */}
                    {testResult && testResult.provider === provider && (
                      <div className={`flex items-center gap-1.5 text-xs ${
                        testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {testResult.success ? (
                          <CheckCircle className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 flex-shrink-0" />
                        )}
                        <span className="break-words">{testResult.message}</span>
                      </div>
                    )}
                  </div>
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

      {/* Custom Prompt Section */}
      <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
            <span className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-primary" />
              整形プロンプト
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${promptOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="custom-prompt" className="text-sm text-muted-foreground">
              AIに送信するシステムプロンプトをカスタマイズできます
            </Label>
            <Textarea
              id="custom-prompt"
              value={customPrompt || DEFAULT_SYSTEM_PROMPT}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={DEFAULT_SYSTEM_PROMPT}
              className="min-h-[200px] text-sm font-mono"
            />
          </div>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCustomPrompt('');
                toast.success('デフォルトプロンプトに戻しました');
              }}
              disabled={!customPrompt}
              className="gap-2"
            >
              <RotateCcw className="h-3 w-3" />
              デフォルトに戻す
            </Button>
            <p className="text-xs text-muted-foreground">
              空にするとデフォルトを使用
            </p>
          </div>
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
