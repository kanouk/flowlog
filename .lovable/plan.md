
# 抽出テキストを本文にappendする機能

## 概要
OCRで抽出したテキストを、ブロックの本文（content）の末尾に追記するボタンを追加する。

## 変更対象

### `src/components/flow/BlockList.tsx`
- 抽出テキスト表示エリア（コピーボタンの横）に「本文に追加」ボタンを追加
- クリック時に `onUpdate(block.id, { content: (block.content || '') + '\n' + block.extracted_text })` を実行
- 追加後に toast で「本文に追加しました」と通知

### `src/components/flow/BlockEditModal.tsx`
- 抽出テキスト表示エリアに「本文に追加」ボタンを追加
- クリック時にモーダル内の `content` state の末尾に `extracted_text` を追記
- textarea に反映されるので、ユーザーが保存前に編集可能

## UI イメージ

```text
抽出テキスト:
[▼ 展開] [再抽出] [コピー] [📝 本文に追加]
```

## 技術詳細

- 本文が空の場合は改行なしでそのまま設定
- 本文がある場合は `\n\n` で区切って追記
- BlockList 側は即座に DB 更新（onUpdate 経由）
- BlockEditModal 側はローカル state 更新のみ（保存ボタンで確定）
