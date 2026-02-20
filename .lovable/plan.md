

# メモ画像のOCR（テキスト抽出）機能

## 概要
メモ（thought）カテゴリに添付された画像の内容をAIで読み取り、テキスト情報として保存する機能を追加する。元画像はそのまま保持する。

## 実装方針

### 1. データベース変更
- `blocks` テーブルに `extracted_text` カラム（text, nullable）を追加
- 画像から抽出されたテキストを保存する場所として使用

### 2. 新規Edge Function: `ocr-image`
- 画像URLを受け取り、Lovable AI Gateway（Gemini のマルチモーダル対応）を使って画像内のテキストを読み取る
- Gemini 2.5 Flash はマルチモーダル対応なので、画像URLを直接送信可能
- 抽出したテキストを `blocks.extracted_text` に保存して返却
- 複数画像がある場合はまとめて1回のリクエストで処理

### 3. UI変更

#### `src/components/flow/BlockList.tsx`
- 画像付きブロックに「📝 テキスト抽出」ボタンを追加（画像の下に表示）
- 抽出済みの場合は `extracted_text` を折りたたみ表示
- 抽出中はローディングスピナーを表示

#### `src/components/flow/BlockEditModal.tsx`
- 画像付きの場合、モーダル内にも「テキスト抽出」ボタンを追加
- 抽出結果を表示・編集可能に

#### `src/hooks/useEntries.ts`
- `Block` インターフェースに `extracted_text: string | null` を追加
- `BlockUpdatePayload` に `extracted_text` を追加

### 4. FormattedView / StockView（メモビュー）
- 抽出テキストがある場合、ブロック表示に含める

## 処理フロー

1. ユーザーがメモブロックの「テキスト抽出」ボタンをクリック
2. フロントエンドから `ocr-image` Edge Function を呼び出し（画像URLリストを送信）
3. Edge Function が Lovable AI Gateway に画像を送り、テキストを抽出
4. 抽出テキストを `blocks.extracted_text` に保存
5. UIに抽出結果を表示

## 技術詳細

### Edge Function (`supabase/functions/ocr-image/index.ts`)
- Lovable AI Gateway の `google/gemini-2.5-flash` を使用（マルチモーダル対応）
- メッセージに画像URLを `image_url` タイプで含めて送信
- システムプロンプト: 「画像内のテキストを正確に読み取り、そのまま出力してください。テキストがない場合は画像の内容を簡潔に説明してください。」
- 認証: Bearer トークンでユーザーを特定し、ブロックの所有者確認を行う

### Gemini マルチモーダルリクエスト形式
```text
messages: [
  { role: "system", content: "画像内のテキストを読み取って..." },
  { role: "user", content: [
    { type: "image_url", image_url: { url: "https://..." } },
    { type: "text", text: "この画像のテキストを抽出してください" }
  ]}
]
```

### カテゴリ制限
- 全カテゴリで使用可能（メモに限定しない）
- 画像が添付されているブロックであれば、どのカテゴリでも抽出ボタンを表示

### UI表示
- 抽出済みテキストは薄い背景のカード内に表示
- 「再抽出」ボタンで再実行可能
- テキストはコピー可能

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| DB migration | `extracted_text` カラム追加 |
| `supabase/functions/ocr-image/index.ts` | 新規作成 |
| `supabase/config.toml` | 新関数の設定追加 |
| `src/hooks/useEntries.ts` | Block型に `extracted_text` 追加 |
| `src/components/flow/BlockList.tsx` | 抽出ボタン・結果表示追加 |
| `src/components/flow/BlockEditModal.tsx` | 抽出ボタン・結果表示追加 |

