

# format-entries Edge Function にトークン数ログを追加

## 概要
各AI API呼び出しの結果からトークン使用量（input/output/total）を抽出し、`console.log` でログに記録します。Phase 1（時刻推測）、Phase 2（日記整形）、Phase 3（スコアリング）それぞれのトークン数が確認できるようになります。

## 変更対象
`supabase/functions/format-entries/index.ts` のみ

## 変更内容

### 1. トークン使用量の型定義を追加

```typescript
interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}
```

### 2. 各AI呼び出し関数の戻り値を拡張

`callOpenAI`, `callAnthropic`, `callGoogle`, `callLovableAI` の4関数で、レスポンスからトークン使用量を抽出し、テキストとともに返すように変更します。

| プロバイダ | トークン情報の取得元 |
|-----------|-------------------|
| OpenAI | `data.usage.prompt_tokens` / `completion_tokens` / `total_tokens` |
| Anthropic | `data.usage.input_tokens` / `output_tokens` |
| Google | `data.usageMetadata.promptTokenCount` / `candidatesTokenCount` / `totalTokenCount` |
| Lovable AI | `data.usage`（OpenAI互換フォーマット） |

戻り値を `{ text: string, usage: TokenUsage | null }` に変更。

### 3. `callAI` ラッパーも戻り値を拡張

`callAI` の戻り値を `string` から `{ text: string, usage: TokenUsage | null }` に変更。

### 4. 各フェーズでトークン数をログ出力

Phase 1, 2, 3 それぞれの呼び出し後に以下の形式でログ出力：

```
Phase 1 token usage: {"prompt_tokens":1200,"completion_tokens":300,"total_tokens":1500}
Phase 2 token usage: {"prompt_tokens":2000,"completion_tokens":800,"total_tokens":2800}
Phase 3 token usage: {"prompt_tokens":1500,"completion_tokens":200,"total_tokens":1700}
Total token usage: {"prompt_tokens":4700,"completion_tokens":1300,"total_tokens":6000}
```

### 5. 既存ロジックへの影響

- `callAI` の戻り値が変わるため、各フェーズの呼び出し箇所で `.text` を使うように修正
- エラーハンドリングやレスポンス構造はそのまま維持

