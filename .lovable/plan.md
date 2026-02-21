
# 「本文に追加」ボタン改善

## 変更内容

### `src/components/flow/BlockList.tsx`

- `Pencil` アイコンを `FileInput` に変更
- `<span>本文に追加</span>` ラベルを削除
- `bg-muted/50 hover:bg-muted rounded px-1.5 py-0.5` など余分なスタイルを削除し、隣の削除ボタン（Trash2）と同じ `text-xs text-muted-foreground hover:text-foreground transition-colors` スタイルに統一
- import に `FileInput` を追加、不要になった `Pencil` を削除

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `src/components/flow/BlockList.tsx` | アイコン変更、ラベル削除、スタイル統一 |
