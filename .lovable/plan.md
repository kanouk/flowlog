
# 抽出テキスト削除機能 + コピーボタン移動

## 概要
1. 抽出テキストを削除（クリア）するボタンを追加
2. コピーボタンを抽出テキストではなく本文側に移動

## 変更内容

### `src/components/flow/BlockList.tsx`

**本文にコピーボタンを追加:**
- 本文（content）表示の横にコピーボタンを追加（hover時に表示）
- クリックで `block.content` をクリップボードにコピー

**抽出テキストからコピーボタンを削除、削除ボタンを追加:**
- 抽出テキスト行のコピーボタン（Copy アイコン）を削除
- 代わりに削除ボタン（Trash2 アイコン）を追加
- クリック時に `onUpdate(block.id, { extracted_text: null })` を実行
- toast で「抽出テキストを削除しました」と通知

### `src/components/flow/BlockEditModal.tsx`

**本文 textarea の近くにコピーボタンを追加:**
- textarea の上部ラベル付近にコピーボタンを配置
- クリックで `content` state をコピー

**抽出テキストのコピーボタンを削除、削除ボタンを追加:**
- OCR セクションのコピーボタンを削除
- 削除ボタンを追加（クリックで `setExtractedText('')` → 保存時に `null` として反映）

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `src/components/flow/BlockList.tsx` | 本文にコピー追加、抽出テキストのコピー→削除に変更 |
| `src/components/flow/BlockEditModal.tsx` | 同上 |
