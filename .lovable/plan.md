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

## セキュリティ設計

### RLS（Row Level Security）ポリシー

全テーブルで RLS が有効化されており、`auth.uid() = user_id` による厳密なアクセス制御を実施。

| テーブル | SELECT | INSERT | UPDATE | DELETE | 備考 |
|----------|--------|--------|--------|--------|------|
| `profiles` | ✅ own | ✅ own | ✅ own | ✅ own | |
| `entries` | ✅ own | ✅ own | ✅ own | ✅ own | |
| `blocks` | ✅ own | ✅ own | ✅ own | ✅ own | |
| `custom_tags` | ✅ own | ✅ own | ✅ own | ✅ own | |
| `user_ai_settings` | ✅ own | ✅ own | ✅ own | ✅ own | write-onlyパターン |
| `user_api_tokens` | ✅ own | ✅ own | ❌ なし | ✅ own | immutableパターン |
| `oauth_authorization_codes` | ✅ own | service role | ❌ なし | ✅ own | 10分期限・単一使用 |
| `storage.objects` | ✅ public | ✅ own | ✅ own | ✅ own | block-imagesバケット |

### セキュリティパターン

#### 1. Write-Only パターン（user_ai_settings）
- APIキー（OpenAI, Anthropic, Google）はフロントエンドに返却しない
- `get_user_ai_settings_safe()` RPC でフラグのみ返却（`has_openai_key` 等）
- 実際のキー値は Edge Functions（service role）経由でのみアクセス

#### 2. Immutable パターン（user_api_tokens）
- トークンは発行後に更新不可（UPDATE ポリシーなし）
- トークン値変更は「削除 → 新規発行」フローで対応
- `last_used_at` 更新は Edge Function（service role）で実行

#### 3. 短命トークンパターン（oauth_authorization_codes）
- 認可コードは10分で期限切れ
- 単一使用（トークン交換後に削除）
- PKCE（code_challenge）でセキュリティ強化

### 匿名アクセスについて

セキュリティスキャンで「Anonymous Access Policies」警告が出ることがありますが、これは**誤検知**です：

1. **匿名サインアップは無効化済み** - Supabase Auth 設定で `external_anonymous_users_enabled: false`
2. **RLS は認証済みユーザーのみ対象** - `auth.uid()` は認証ユーザーでないと NULL を返す
3. **全 RLS ポリシーで user_id チェック** - `auth.uid() = user_id` で厳密に制限

---

## 今後の拡張候補
- 設定画面での OAuth 接続済みアプリ一覧表示
- REST API ドキュメント UI

