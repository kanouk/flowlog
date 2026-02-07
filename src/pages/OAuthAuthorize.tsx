import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Shield, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PERMISSIONS = [
  { label: '出来事、タスク、予定、メモの読み取り', description: 'あなたのログデータを閲覧できます' },
  { label: '新しいエントリの追加', description: '新しいログを追加できます' },
  { label: 'タスクの完了状態の変更', description: 'タスクを完了/未完了にできます' },
  { label: '検索の実行', description: 'ログを検索できます' },
];

export default function OAuthAuthorize() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorizing, setAuthorizing] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // OAuthパラメータ
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const scope = searchParams.get('scope') || 'mcp:full';
  const state = searchParams.get('state');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method') || 'S256';

  // クライアント名を推測
  const getClientName = (clientId: string | null): string => {
    if (!clientId) return 'Unknown App';
    if (clientId.toLowerCase().includes('claude')) return 'Claude';
    if (clientId.toLowerCase().includes('chatgpt')) return 'ChatGPT';
    if (clientId.toLowerCase().includes('cursor')) return 'Cursor';
    return clientId.length > 20 ? `${clientId.slice(0, 20)}...` : clientId;
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // 未ログイン → ログインページにリダイレクト（現在のURLをリダイレクト先として保持）
        const currentUrl = window.location.href;
        const loginUrl = `/auth?redirect=${encodeURIComponent(currentUrl)}`;
        navigate(loginUrl, { replace: true });
        return;
      }
      
      setUser({ id: session.user.id, email: session.user.email });
      setLoading(false);
    };

    // パラメータ検証
    if (!clientId || !redirectUri) {
      setError('必須パラメータが不足しています');
      setLoading(false);
      return;
    }

    checkAuth();
  }, [clientId, redirectUri, navigate]);

  const handleAuthorize = async () => {
    if (!user) return;
    
    setAuthorizing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('セッションが切れました。再度ログインしてください。');
        navigate('/auth');
        return;
      }

      // MCPサーバーに認可コード作成をリクエスト
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server/oauth/create-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            client_id: clientId,
            redirect_uri: redirectUri,
            scope,
            state,
            code_challenge: codeChallenge,
            code_challenge_method: codeChallengeMethod,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error_description || errorData.error || 'Failed to create authorization code');
      }

      const { redirect_url } = await response.json();
      
      // クライアントにリダイレクト
      window.location.href = redirect_url;
    } catch (err) {
      console.error('Authorization failed:', err);
      toast.error('認可に失敗しました');
      setAuthorizing(false);
    }
  };

  const handleDeny = () => {
    // キャンセル → redirect_uriにエラーを返す
    if (redirectUri) {
      const errorUrl = new URL(redirectUri);
      errorUrl.searchParams.set('error', 'access_denied');
      errorUrl.searchParams.set('error_description', 'User denied the request');
      if (state) errorUrl.searchParams.set('state', state);
      window.location.href = errorUrl.toString();
    } else {
      navigate('/dashboard');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>エラー</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              ダッシュボードに戻る
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl">FlowLog への接続許可</CardTitle>
          <CardDescription className="mt-2">
            <span className="font-semibold text-foreground">{getClientName(clientId)}</span>
            {' '}が FlowLog へのアクセスをリクエストしています
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ログイン中のユーザー */}
          <div className="rounded-lg bg-muted/50 p-3 text-center text-sm">
            <span className="text-muted-foreground">ログイン中: </span>
            <span className="font-medium">{user?.email}</span>
          </div>

          {/* 許可される操作 */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">許可される操作:</h4>
            <ul className="space-y-2">
              {PERMISSIONS.map((perm, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>{perm.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* スコープ表示 */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <span className="font-medium">スコープ: </span>
            <code className="bg-muted px-1 py-0.5 rounded">{scope}</code>
          </div>
        </CardContent>

        <CardFooter className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDeny}
            disabled={authorizing}
          >
            <X className="h-4 w-4 mr-2" />
            キャンセル
          </Button>
          <Button
            className="flex-1"
            onClick={handleAuthorize}
            disabled={authorizing}
          >
            {authorizing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                処理中...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                許可する
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
