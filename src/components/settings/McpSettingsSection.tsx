import { useState } from 'react';
import { Plug, Plus, Copy, Trash2, ChevronDown, ChevronUp, Check, Key, ExternalLink } from 'lucide-react';
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

export function McpSettingsSection() {
  const { tokens, loading, generateToken, deleteToken } = useApiTokens();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

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

  const handleCopyConfig = async () => {
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

  const handleCloseGeneratedDialog = () => {
    setGeneratedToken(null);
    setShowCreateDialog(false);
    setCopied(false);
  };

  return (
    <section className="glass-card rounded-2xl p-6">
      <h2 className="text-lg font-medium flex items-center gap-2 mb-4">
        <Plug className="h-5 w-5 text-primary" />
        MCP連携
      </h2>

      <p className="text-sm text-muted-foreground mb-6">
        MCPを使うと、Claude CodeやCursorなどの外部AIアシスタントからFlowLogのデータにアクセスできます。
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

      {/* 接続方法ガイド */}
      <Collapsible open={showGuide} onOpenChange={setShowGuide} className="mt-6">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-0 h-auto">
            <span className="text-sm font-medium flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              接続方法
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
            <div className="text-sm font-medium">Claude Code / Cursor 設定例</div>
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
                onClick={handleCopyConfig}
              >
                <Copy className="h-3 w-3 mr-1" />
                コピー
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              YOUR_API_TOKEN を実際のトークンに置き換えてください。
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">利用可能なツール</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div><code>list_events</code>, <code>add_event</code> - 出来事</div>
              <div><code>list_tasks</code>, <code>add_task</code>, <code>complete_task</code> - タスク</div>
              <div><code>list_schedules</code>, <code>add_schedule</code> - 予定</div>
              <div><code>list_memos</code>, <code>add_memo</code> - メモ</div>
              <div><code>list_read_later</code>, <code>add_read_later</code>, <code>mark_as_read</code> - あとで読む</div>
              <div><code>search_blocks</code> - 横断検索</div>
              <div><code>get_entry</code> - 日記取得</div>
            </div>
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
