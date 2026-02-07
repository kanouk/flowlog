# FlowLog API Integration

## 完了した機能

### 1. REST API (完了)
- Hono ベースの Edge Function `/api`
- Bearer トークン認証
- 18 エンドポイント（events, tasks, schedules, memos, search, entries）

### 2. MCP OAuth認証 (完了)
Claude Desktop、ChatGPT などの AI アシスタント向けに OAuth 2.0 対応を実装。

#### OAuthエンドポイント
| エンドポイント | 説明 |
|---------------|------|
| `GET /.well-known/oauth-authorization-server` | OAuth Server Metadata |
| `POST /oauth/register` | 動的クライアント登録 |
| `GET /oauth/authorize` | 認可エンドポイント |
| `POST /oauth/token` | トークン交換 |

#### クライアント設定例（Claude Desktop）
```json
{
  "mcpServers": {
    "flowlog": {
      "url": "https://wdvwnbeofakzihmjacko.supabase.co/functions/v1/mcp-server/mcp",
      "transport": { "type": "streamable_http" }
    }
  }
}
```

初回接続時にブラウザが開き、FlowLogにログイン → 認可確認 → 自動的にトークンが設定されます。

---

## 今後の拡張候補
- 設定画面での OAuth 接続済みアプリ一覧表示
- REST API ドキュメント UI

