import { useState } from 'react';
import { Plug, Plus, Copy, Trash2, ChevronDown, ChevronUp, Check, Key, ExternalLink, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiTokens } from '@/hooks/useApiTokens';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const MCP_SERVER_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server/mcp`;
const REST_API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api`;

export function McpSettingsSection() {
  const { tokens, loading, generateToken, deleteToken } = useApiTokens();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showRestApi, setShowRestApi] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCreateToken = async () => {
    const token = await generateToken(newTokenName || 'Default');
    if (token) {
      setGeneratedToken(token);
      setNewTokenName('');
    }
  };

  const handleCopyToken = async () => {
    if (generatedToken) {
      await navigator.clipboard.writeText(generatedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyPatConfig = async () => {
    const config = {
      mcpServers: {
        flowlog: {
          url: MCP_SERVER_URL,
          transport: { type: "streamable_http" },
          headers: {
            Authorization: "Bearer YOUR_API_TOKEN"
          }
        }
      }
    };
    await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
  };

  const handleCopyOAuthConfig = async () => {
    const config = {
      mcpServers: {
        flowlog: {
          url: MCP_SERVER_URL,
          transport: { type: "streamable_http" }
        }
      }
    };
    await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
  };

  const handleCopyText = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCloseGeneratedDialog = () => {
    setGeneratedToken(null);
    setShowCreateDialog(false);
    setCopied(false);
  };

  const REST_ENDPOINTS = [
    { method: 'GET', path: '/events', desc: '出来事一覧' },
    { method: 'POST', path: '/events', desc: '出来事追加' },
    { method: 'GET', path: '/tasks', desc: 'タスク一覧' },
    { method: 'POST', path: '/tasks', desc: 'タスク追加' },
    { method: 'PATCH', path: '/tasks/:id/complete', desc: 'タスク完了切替' },
    { method: 'PATCH', path: '/tasks/:id/priority', desc: '優先度変更' },
    { method: 'GET', path: '/schedules', desc: '予定一覧' },
    { method: 'POST', path: '/schedules', desc: '予定追加' },
    { method: 'GET', path: '/memos', desc: 'メモ一覧' },
    { method: 'POST', path: '/memos', desc: 'メモ追加' },
    { method: 'GET', path: '/read-later', desc: 'あとで読む一覧' },
    { method: 'POST', path: '/read-later', desc: 'あとで読む追加' },
    { method: 'GET', path: '/search', desc: '横断検索' },
    { method: 'GET', path: '/entries/:date', desc: 'エントリー取得' },
    { method: 'PATCH', path: '/blocks/:id', desc: 'ブロック更新' },
    { method: 'DELETE', path: '/blocks/:id', desc: 'ブロック削除' },
  ];

  const methodColor = (m: string) => {
    switch (m) {
      case 'GET': return 'text-emerald-600 bg-emerald-500/10';
      case 'POST': return 'text-blue-600 bg-blue-500/10';
      case 'PATCH': return 'text-amber-600 bg-amber-500/10';
      case 'DELETE': return 'text-red-600 bg-red-500/10';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-medium flex items-center gap-2 mb-4">
        <Plug className="h-5 w-5 text-primary" />
        API連携
      </h2>

      <p className="text-sm text-muted-foreground mb-6">
        MCP または REST API を使って、外部ツールからFlowLogのデータにアクセスできます。
      </p>

      {/* APIトークン管理 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Key className="h-4 w-4" />
            APIトークン
          </h3>
          <Button
            size="sm"
            onClick={() => setShowCreateDialog(true)}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            新規作成
          </Button>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            読み込み中...
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center bg-muted/30 rounded-lg">
            トークンがありません。「新規作成」ボタンからトークンを作成してください。
          </div>
        ) : (
          <div className="space-y-2">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{token.name}</div>
                  <div className="text-xs text-muted-foreground">
                    作成: {formatDistanceToNow(new Date(token.created_at), { addSuffix: true, locale: ja })}
                    {token.last_used_at && (
                      <> • 最終使用: {formatDistanceToNow(new Date(token.last_used_at), { addSuffix: true, locale: ja })}</>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowDeleteDialog(token.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MCP接続方法ガイド */}
      <Collapsible open={showGuide} onOpenChange={setShowGuide} className="mt-6">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-0 h-auto">
            <span className="text-sm font-medium flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              MCP接続方法
            </span>
            {showGuide ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">接続URL</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                {MCP_SERVER_URL}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigator.clipboard.writeText(MCP_SERVER_URL)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">OAuth 設定例（URLのみ）</div>
            <div className="relative">
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{`{
  "mcpServers": {
    "flowlog": {
      "url": "${MCP_SERVER_URL}",
      "transport": { "type": "streamable_http" }
    }
  }
}`}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={handleCopyOAuthConfig}
              >
                <Copy className="h-3 w-3 mr-1" />
                コピー
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              OAuth対応クライアントでは、接続時にブラウザでFlowLog認証・許可画面が開きます。
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">APIトークン（PAT）設定例</div>
            <div className="relative">
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{`{
  "mcpServers": {
    "flowlog": {
      "url": "${MCP_SERVER_URL}",
      "transport": { "type": "streamable_http" },
      "headers": {
        "Authorization": "Bearer YOUR_API_TOKEN"
      }
    }
  }
}`}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={handleCopyPatConfig}
              >
                <Copy className="h-3 w-3 mr-1" />
                コピー
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              OAuthが使えないクライアントでは、事前に発行したAPIトークンを `Authorization` ヘッダーに設定してください。
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">利用可能なツール</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div><code>list_events</code>, <code>add_event</code> - 出来事</div>
              <div><code>list_tasks</code>, <code>add_task</code>, <code>complete_task</code> - タスク</div>
              <div><code>list_schedules</code>, <code>add_schedule</code> - 予定</div>
              <div><code>list_memos</code>, <code>add_memo</code> - メモ</div>
              <div><code>list_read_later</code>, <code>add_read_later</code>, <code>mark_as_read</code> - あとで</div>
              <div><code>search_blocks</code> - 横断検索</div>
              <div><code>get_entry</code> - 日記取得</div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* REST API ドキュメント */}
      <Collapsible open={showRestApi} onOpenChange={setShowRestApi} className="mt-4">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-0 h-auto">
            <span className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              REST API
            </span>
            {showRestApi ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Base URL</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                {REST_API_BASE}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopyText(REST_API_BASE, 'base-url')}
              >
                {copiedField === 'base-url' ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">認証</div>
            <p className="text-xs text-muted-foreground">
              上記のAPIトークンを <code className="bg-muted px-1 rounded">Authorization: Bearer YOUR_TOKEN</code> ヘッダーに設定してください。
              <code className="bg-muted px-1 rounded">/health</code> と <code className="bg-muted px-1 rounded">/docs</code> は認証不要です。
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">エンドポイント一覧</div>
            <div className="space-y-1">
              {REST_ENDPOINTS.map((ep, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1">
                  <span className={`px-1.5 py-0.5 rounded font-mono font-medium ${methodColor(ep.method)}`}>
                    {ep.method}
                  </span>
                  <code className="text-foreground">{ep.path}</code>
                  <span className="text-muted-foreground ml-auto">{ep.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">curl サンプル</div>
            <div className="relative">
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap">
{`# タスク追加
curl -X POST ${REST_API_BASE}/tasks \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "買い物に行く", "priority": 1}'

# 出来事一覧
curl ${REST_API_BASE}/events?date=2025-01-01 \\
  -H "Authorization: Bearer YOUR_TOKEN"

# 全エンドポイント詳細（認証不要）
curl ${REST_API_BASE}/docs`}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => handleCopyText(
                  `curl -X POST ${REST_API_BASE}/tasks \\\n  -H "Authorization: Bearer YOUR_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"content": "買い物に行く", "priority": 1}'`,
                  'curl'
                )}
              >
                {copiedField === 'curl' ? <Check className="h-3 w-3 mr-1 text-primary" /> : <Copy className="h-3 w-3 mr-1" />}
                コピー
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            全エンドポイントの詳細（パラメータ・リクエストボディ）は <code className="bg-muted px-1 rounded">GET /docs</code> で取得できます。
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* トークン作成ダイアログ */}
      <Dialog open={showCreateDialog && !generatedToken} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新しいAPIトークンを作成</DialogTitle>
            <DialogDescription>
              トークンに名前をつけて識別しやすくしましょう。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="トークン名（例: Claude Code）"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={handleCreateToken}>
              作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 生成されたトークン表示ダイアログ */}
      <Dialog open={!!generatedToken} onOpenChange={handleCloseGeneratedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>トークンが生成されました</DialogTitle>
            <DialogDescription>
              このトークンは一度だけ表示されます。必ずコピーして安全な場所に保存してください。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-muted p-3 rounded break-all font-mono">
                {generatedToken}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyToken}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCloseGeneratedDialog}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>トークンを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              このトークンを使用しているアプリケーションはFlowLogにアクセスできなくなります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (showDeleteDialog) {
                  deleteToken(showDeleteDialog);
                  setShowDeleteDialog(null);
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