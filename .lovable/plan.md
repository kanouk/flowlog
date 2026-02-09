

# MCP接続エラー修正計画

## 根本原因の特定

検証の結果、以下の問題を発見しました：

| 問題 | 現状 | 影響 |
|------|------|------|
| protocolVersion が古い | `"2024-11-05"` を返している | Streamable HTTP は `2025-03-26` の機能。Claude が互換性エラーで接続拒否する |
| DELETE /mcp 未対応 | 405 エラーを返す | MCP 2025-03-26 ではセッション終了に DELETE を使用。Claude が正常終了できない |
| GET /mcp の挙動 | 空の SSE を即 close | 仕様上 GET は任意だが、不完全な実装は混乱を招く |
| ping メソッド未実装 | Method not found を返す | Claude はヘルスチェックに `ping` を使う場合がある |

**最重要**: `protocolVersion: "2024-11-05"` が Streamable HTTP トランスポートとの不整合を引き起こしている。Claude は `2025-03-26` を期待しているため、接続ハンドシェイクの段階で失敗する。

## 修正内容

### 変更対象ファイル

`supabase/functions/mcp-server/index.ts` のみ

### 1. protocolVersion を `"2025-03-26"` に更新

initialize レスポンスの protocolVersion を修正。これにより Claude が Streamable HTTP 互換サーバーとして認識する。

### 2. DELETE /mcp ハンドラー追加

MCP 2025-03-26 仕様に従い、セッション終了用の DELETE メソッドを処理。認証済みリクエストに対して 200 を返す。

### 3. GET /mcp を 405 に変更

サーバーからのプッシュ通知が不要なため、GET SSE を実装する代わりに 405 Method Not Allowed を返す。POST ベースの JSON-RPC のみで十分に動作する。

### 4. ping メソッド対応

`ping` リクエストに対して空の result を返すよう handleMcpRequest に追加。

## 技術詳細

```text
initialize レスポンス変更:
  before: protocolVersion: "2024-11-05"
  after:  protocolVersion: "2025-03-26"

新規ハンドラー:
  DELETE /mcp → 200 OK (セッション終了)
  ping method → { jsonrpc: "2.0", id: ..., result: {} }

変更ハンドラー:
  GET /mcp → 405 Method Not Allowed
```

## 検証項目

1. POST /mcp (initialize) が `protocolVersion: "2025-03-26"` を返す
2. DELETE /mcp が 200 を返す
3. GET /mcp が 405 を返す
4. ping メソッドが正常応答する
5. Edge Function 再デプロイ後に Claude Desktop から接続成功

