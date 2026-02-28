

# Edge Function デプロイ

現在のプロジェクトにある全Edge Functionを再デプロイします。

## 対象ファイル

| Function | パス |
|---|---|
| `format-entries` | `supabase/functions/format-entries/index.ts` |
| `mcp-server` | `supabase/functions/mcp-server/index.ts` |
| `api` | `supabase/functions/api/index.ts` |
| `summarize-url` | `supabase/functions/summarize-url/index.ts` |
| `test-ai-connection` | `supabase/functions/test-ai-connection/index.ts` |
| `ocr-image` | `supabase/functions/ocr-image/index.ts` |

## 実行内容

- 上記6つのEdge Functionすべてを `deploy_edge_functions` ツールで一括デプロイ
- コード変更は不要（GitHub経由で更新済みのコードをそのままデプロイ）

