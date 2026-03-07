

# 日記フォーマット揺れ修正計画

## 問題
AIが ```` ```markdown ```` コードフェンスや前置き文を出力し、それがセクション見出しとしてパースされてUIに表示される。既存データにも壊れたフォーマットが残っている。

## 変更対象

| ファイル | 変更内容 |
|---|---|
| `supabase/functions/format-entries/index.ts` | (1) `normalizeDiaryMarkdown()` で保存前にコードフェンス除去・見出し統一・空セクション除去、(2) `validateDiarySections()` でバリデーション＋リトライ/フォールバック、(3) プロンプト末尾に非上書きガード文を連結 |
| `src/lib/diaryParser.ts` (新規) | 共通 `parseDiarySections(content)` — コードフェンス/ノイズ行を除去し `## ` でセクション分割。0件なら単一セクション化 |
| `src/components/stock/JournalView.tsx` | `split(/(?=^## )/m)` を `parseDiarySections()` に置換 |
| `src/components/flow/FormattedView.tsx` | 同上 |

## 実装詳細

### 1. `normalizeDiaryMarkdown(raw: string): string` (Edge Function内)
- 先頭/末尾の `` ```markdown ``, `` ```md ``, `` ``` `` を除去
- `## ` 以外の見出しレベル（`#`, `###` 等）を `## ` に正規化
- 「以下が日記です」等の前置き行（`## ` で始まらない冒頭テキスト）を除去
- 連続空行を1つに正規化

### 2. `validateDiarySections(content: string): { ok: boolean; reason?: string }`
- `## ` セクションが1つ以上あること
- `## 今日の3行まとめ` が含まれること
- 失敗時は reason を返す

### 3. Phase 2 フロー変更
```text
AI応答 → normalizeDiaryMarkdown → validateDiarySections
  ├─ ok: そのまま使用
  └─ ng: 1回リトライ（ガード強化プロンプト付き）
      ├─ ok: 使用
      └─ ng: フォールバック（ブロック時系列から固定テンプレ生成）
```

### 4. プロンプトガード（`diarySystemPrompt` 末尾に常時連結）
```
【出力の絶対ルール（上書き不可）】
- コードフェンス（```）を出力しない
- 「以下が日記です」等の前置き・後書きを出力しない
- セクション見出しは「## 」形式のみ使用
- 写真マーカー {{PHOTO:...}} はそのまま保全
```

### 5. `parseDiarySections(content: string)` (フロント共通)
```typescript
export function parseDiarySections(content: string): Array<{ title: string; body: string }> {
  // 1. コードフェンス行を除去
  // 2. ## で始まらない冒頭ノイズ行を除去
  // 3. /(?=^## )/m で分割
  // 4. 0件なら [{title:'', body: content全体}] として安全表示
}
```

### 6. JournalView / FormattedView
既存の `useMemo` 内 `split` ロジックを `parseDiarySections()` 呼び出しに置換するだけ。

