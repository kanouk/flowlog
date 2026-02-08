
# MCP OAuth認証ハンドシェイク修正計画

## 問題点の診断

現在の実装には、MCPクライアント（Claude Desktop / ChatGPT）が期待するOAuth発見フローと不整合があります：

| 問題 | 現状 | 仕様要件 |
|------|------|----------|
| RFC 9728 Protected Resource Metadata | 未実装（404） | `/.well-known/oauth-protected-resource` が必須 |
| WWW-Authenticate ヘッダ | `authorization_uri` のみ | `resource_metadata` パラメータが必須 |
| Mcp-Session-Id | 未実装 | Streamable HTTP でセッション管理が期待される |
| OAuth Authorization Server Metadata | 実装済み（正常動作） | RFC 8414 準拠 |

---

## 修正方針

### 1. RFC 9728 Protected Resource Metadata エンドポイント追加

```text
GET /.well-known/oauth-protected-resource

{
  "resource": "https://...supabase.co/functions/v1/mcp-server/mcp",
  "authorization_servers": [
    "https://...supabase.co/functions/v1/mcp-server"
  ],
  "scopes_supported": ["mcp:full"],
  "bearer_methods_supported": ["header"]
}
```

### 2. WWW-Authenticate ヘッダのRFC 9728準拠化

現在：
```text
WWW-Authenticate: Bearer realm="FlowLog MCP", authorization_uri="..."
```

修正後：
```text
WWW-Authenticate: Bearer resource_metadata="https://.../mcp-server/.well-known/oauth-protected-resource"
```

### 3. Mcp-Session-Id セッション管理

- initialize レスポンスで `Mcp-Session-Id` ヘッダを返す
- 以降のリクエストでセッションIDを検証（オプション）
- セッションごとの状態管理を追加

---

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `supabase/functions/mcp-server/index.ts` | OAuth Protected Resource Metadata追加、WWW-Authenticate修正、Session管理追加 |

---

## 詳細実装

### Protected Resource Metadata (新規追加)

```typescript
function getProtectedResourceMetadata() {
  const baseUrl = `${supabaseUrl}/functions/v1/mcp-server`;
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: ["mcp:full"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://flowlog.lovable.app/settings"
  };
}

// エンドポイント追加
if (path.endsWith("/.well-known/oauth-protected-resource")) {
  return new Response(JSON.stringify(getProtectedResourceMetadata()), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
```

### WWW-Authenticate ヘッダ修正

```typescript
// 401レスポンス時
const resourceMetadataUrl = `${supabaseUrl}/functions/v1/mcp-server/.well-known/oauth-protected-resource`;
return new Response(JSON.stringify({
  error: "unauthorized",
  error_description: "Bearer token required"
}), {
  status: 401,
  headers: {
    ...corsHeaders,
    "Content-Type": "application/json",
    "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`
  }
});
```

### Mcp-Session-Id セッション管理

```typescript
// インメモリセッション管理（Edge Functionでは簡易的に）
const sessions = new Map<string, { userId: string; createdAt: Date }>();

function generateSessionId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

// initialize時にセッションIDを返す
if (request.method === "initialize") {
  const sessionId = generateSessionId();
  sessions.set(sessionId, { userId, createdAt: new Date() });
  
  return new Response(JSON.stringify({...}), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Mcp-Session-Id": sessionId
    }
  });
}
```

---

## 修正後のOAuth発見フロー

```text
┌─────────────────┐         ┌─────────────────┐
│  MCP Client     │         │  FlowLog MCP    │
│ (Claude/ChatGPT)│         │    Server       │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │ POST /mcp (no token)      │
         │──────────────────────────>│
         │                           │
         │ 401 + WWW-Authenticate:   │
         │ Bearer resource_metadata= │
         │<──────────────────────────│
         │                           │
         │ GET /.well-known/         │
         │     oauth-protected-resource
         │──────────────────────────>│
         │                           │
         │ { authorization_servers,  │
         │   resource, scopes }      │
         │<──────────────────────────│
         │                           │
         │ GET /.well-known/         │
         │   oauth-authorization-server
         │──────────────────────────>│
         │                           │
         │ { authorization_endpoint, │
         │   token_endpoint, ... }   │
         │<──────────────────────────│
         │                           │
         │ ... OAuth 2.1 フロー ...  │
         │                           │
         │ POST /mcp (with token)    │
         │──────────────────────────>│
         │                           │
         │ 200 + Mcp-Session-Id      │
         │<──────────────────────────│
```

---

## 検証項目

修正後、以下を確認：

1. `GET /.well-known/oauth-protected-resource` → 200 + RFC 9728準拠JSON
2. `POST /mcp` (トークンなし) → 401 + `WWW-Authenticate: Bearer resource_metadata="..."`
3. `POST /mcp` (トークンあり、initialize) → 200 + `Mcp-Session-Id` ヘッダ
4. OAuth発見フローが正常に連携

---

## 実装順序

1. Protected Resource Metadata エンドポイント追加
2. WWW-Authenticate ヘッダをRFC 9728準拠に修正
3. Mcp-Session-Id セッション管理を追加
4. Edge Function デプロイ
5. 各エンドポイントの動作検証
