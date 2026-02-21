
# 画像アップロード時の自動テキスト抽出オプション

## 概要
画像付きブロックを投稿した際に、自動で OCR（テキスト抽出）を実行するオン/オフ設定を追加する。

## 変更内容

### 1. データベース
- `user_ai_settings` テーブルに `auto_ocr` カラム（boolean, default false）を追加

### 2. `src/hooks/useAISettings.ts`
- `AISettings` インターフェースに `auto_ocr: boolean` を追加
- `DEFAULT_SETTINGS` に `auto_ocr: false` を追加
- フェッチ・保存ロジックで `auto_ocr` を扱うようにする

### 3. `src/components/settings/AISettingsSection.tsx`
- 生成AI設定セクションの下部に「画像アップロード時に自動テキスト抽出」のスイッチ（Switch コンポーネント）を追加
- 説明文: 「画像を添付して投稿した際、自動でテキスト抽出を実行します」

### 4. `src/components/flow/FlowEditor.tsx`
- `useAISettings` フックをインポート
- `handleAddBlock` 内で、ブロック保存成功後に以下を実行:
  - `settings.auto_ocr` が true かつ `images.length > 0` の場合
  - `ocr-image` Edge Function を呼び出し（block ID と画像 URL を送信）
  - 抽出完了後、ローカル state のブロックに `extracted_text` を反映
  - バックグラウンドで実行するため、ユーザーの操作をブロックしない

## 処理フロー

```text
ユーザーが画像付きブロックを投稿
  ↓
ブロック保存成功
  ↓
auto_ocr が ON？ → Yes → バックグラウンドで ocr-image を呼び出し
                 → No  → 何もしない
  ↓
抽出完了 → blocks state を更新（extracted_text を反映）
         → toast で「テキストを自動抽出しました」
```

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| DB migration | `auto_ocr` カラム追加 |
| `src/hooks/useAISettings.ts` | `auto_ocr` フィールド追加 |
| `src/components/settings/AISettingsSection.tsx` | Switch トグル追加 |
| `src/components/flow/FlowEditor.tsx` | 自動 OCR トリガーロジック追加 |
