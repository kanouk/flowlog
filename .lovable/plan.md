# MCP OAuth認証ハンドシェイク修正計画

## ステータス: ✅ 完了

## 実装完了内容

### 1. RFC 9728 Protected Resource Metadata エンドポイント ✅

- `GET /.well-known/oauth-protected-resource` を追加
- レスポンス検証済み（200 OK + RFC 9728準拠JSON）

### 2. WWW-Authenticate ヘッダのRFC 9728準拠化 ✅

- `resource_metadata` パラメータを使用するよう修正
- 401レスポンス時に正しいヘッダを返却

### 3. Mcp-Session-Id セッション管理 ✅

- `initialize` リクエスト時にセッションIDを生成
- レスポンスヘッダに `Mcp-Session-Id` を付与
- インメモリセッション管理を実装

## 検証結果

| エンドポイント | ステータス | 結果 |
|---------------|-----------|------|
| `GET /.well-known/oauth-protected-resource` | ✅ 200 | RFC 9728準拠JSON |
| `GET /.well-known/oauth-authorization-server` | ✅ 200 | RFC 8414準拠JSON |
| `POST /mcp` (トークンなし) | ✅ 401 | `WWW-Authenticate: Bearer resource_metadata="..."` |
| `POST /mcp` (トークンあり) | ✅ 200 | `Mcp-Session-Id` ヘッダ付与 |

## OAuth発見フロー（修正後）

```
MCP Client → POST /mcp (no token) → 401 + WWW-Authenticate: Bearer resource_metadata="..."
MCP Client → GET /.well-known/oauth-protected-resource → { authorization_servers, resource, scopes }
MCP Client → GET /.well-known/oauth-authorization-server → { authorization_endpoint, token_endpoint, ... }
MCP Client → OAuth 2.1 フロー実行
MCP Client → POST /mcp (with token) → 200 + Mcp-Session-Id
```
