

# MCP OAuth認証対応

## 概要
Claude DesktopやChatGPTなどのAIアシスタントは、MCPサーバーに接続する際にOAuth 2.0 (Authorization Code Grant) を前提としています。現在のAPIトークン方式（Bearer Token手動コピー）から、OAuthフローに対応することで、ユーザーが認可ボタンをクリックするだけで接続できるようになります。

---

## OAuth 2.0 フロー

```text
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│ Claude/     │      │  FlowLog    │      │  FlowLog    │
│ ChatGPT     │      │ OAuth EP   │      │   App       │
└─────┬───────┘      └─────┬───────┘      └─────┬───────┘
      │                    │                    │
      │ 1. /authorize?...  │                    │
      │───────────────────>│                    │
      │                    │ 2. Redirect to App │
      │                    │───────────────────>│
      │                    │                    │
      │                    │  3. ユーザー認証   │
      │                    │  4. 認可確認画面   │
      │                    │<───────────────────│
      │                    │                    │
      │ 5. callback?code=  │                    │
      │<───────────────────│                    │
      │                    │                    │
      │ 6. /token          │                    │
      │───────────────────>│                    │
      │                    │                    │
      │ 7. access_token    │                    │
      │<───────────────────│                    │
      │                    │                    │
      │ 8. MCP calls       │                    │
      │   (Bearer token)   │                    │
```

---

## エンドポイント設計

| エンドポイント | 説明 |
|---------------|------|
| `GET /.well-known/oauth-authorization-server` | OAuth Server Metadata |
| `GET /oauth/authorize` | 認可エンドポイント（認可画面へリダイレクト） |
| `POST /oauth/token` | トークン交換エンドポイント |
| `POST /oauth/revoke` | トークン失効（オプション） |

---

## 変更対象

| ファイル | 変更内容 |
|----------|----------|
| `supabase/functions/mcp-server/index.ts` | OAuthエンドポイント追加 |
| `src/pages/OAuthAuthorize.tsx` | 認可確認画面（新規） |
| `src/App.tsx` | ルート追加 |
| DB: `oauth_authorization_codes` | 認可コード一時保存テーブル（新規） |
| DB: `oauth_clients` | クライアント情報テーブル（オプション） |

---

## データベース設計

### 新規テーブル: oauth_authorization_codes

```sql
CREATE TABLE oauth_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  code_challenge text,              -- PKCE用
  code_challenge_method text,       -- 'S256' or 'plain'
  redirect_uri text NOT NULL,
  client_id text NOT NULL,
  scope text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 期限切れコードの自動削除
CREATE INDEX idx_oauth_codes_expires ON oauth_authorization_codes(expires_at);
```

---

## MCPサーバー拡張

### 1. OAuth Server Metadata

```typescript
// /.well-known/oauth-authorization-server
{
  "issuer": "https://wdvwnbeofakzihmjacko.supabase.co/functions/v1/mcp-server",
  "authorization_endpoint": ".../oauth/authorize",
  "token_endpoint": ".../oauth/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

### 2. 認可エンドポイント

```typescript
// GET /oauth/authorize
// → FlowLogの認可確認ページにリダイレクト
// パラメータ: client_id, redirect_uri, scope, state, code_challenge, code_challenge_method
```

### 3. トークンエンドポイント

```typescript
// POST /oauth/token
// grant_type: authorization_code
// code: 認可コード
// code_verifier: PKCE検証用
// → access_token (= APIトークン形式) を返却
```

---

## 認可確認画面 (OAuthAuthorize.tsx)

```text
┌────────────────────────────────────────────────────────┐
│                                                        │
│               🔐 FlowLog への接続許可                  │
│                                                        │
│  「Claude Desktop」が FlowLog へのアクセスを          │
│  リクエストしています。                               │
│                                                        │
│  許可される操作:                                       │
│  ✓ 出来事、タスク、予定などの読み取り                 │
│  ✓ 新しいエントリの追加                               │
│  ✓ タスクの完了状態変更                               │
│                                                        │
│  ┌──────────┐    ┌──────────┐                         │
│  │ キャンセル │    │  許可する │                         │
│  └──────────┘    └──────────┘                         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## 実装詳細

### PKCE (Proof Key for Code Exchange)

セキュリティ強化のためPKCEをサポート：

1. クライアントが `code_verifier` を生成
2. `code_challenge = SHA256(code_verifier)` を認可リクエストに含める
3. トークンリクエスト時に `code_verifier` を送信
4. サーバーが検証

### スコープ

シンプルに単一スコープで開始：
- `mcp:full` - 全ツールへのアクセス

将来的には細分化可能：
- `mcp:read` - 読み取りのみ
- `mcp:write` - 書き込み可能

---

## セキュリティ考慮事項

1. **認可コードは10分で期限切れ**
2. **PKCEを推奨（必須にもできる）**
3. **redirect_uriの厳密な検証**
4. **既存のトークンハッシュ方式をそのまま利用**
5. **アクセストークンは長期有効（手動削除まで）**

---

## 設定画面の更新

McpSettingsSectionに追加：

```text
┌───────────────────────────────────────────────────────────┐
│  🔌 API連携                                               │
│                                                           │
│  ▼ OAuth接続（推奨）                          [NEW]       │
│    Claude DesktopやChatGPTから直接接続できます           │
│                                                           │
│    接続済みアプリ:                                        │
│    ┌────────────────────────────────────────────┐        │
│    │ Claude Desktop  接続: 1時間前              │ 🗑      │
│    └────────────────────────────────────────────┘        │
│                                                           │
│  ▼ 手動トークン設定                                       │
│    (既存のAPIトークン管理UI)                              │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

## 実装順序

1. **DBマイグレーション**
   - `oauth_authorization_codes` テーブル作成
   - インデックス追加

2. **MCPサーバー拡張**
   - `/.well-known/oauth-authorization-server` エンドポイント
   - `/oauth/authorize` エンドポイント
   - `/oauth/token` エンドポイント

3. **認可確認画面**
   - `/oauth/authorize` ページ作成
   - ログイン状態確認
   - 認可ボタン処理

4. **設定画面更新**
   - OAuth接続済みアプリ一覧表示
   - 接続解除機能

5. **テスト**
   - Claude Desktopで接続テスト

---

## クライアント設定例（Claude Desktop）

OAuth対応後、ユーザーは以下の設定だけでOK：

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

