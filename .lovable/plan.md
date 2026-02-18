

# デスクトップタブのラベル常時表示 & Flow スタイル修正

## 変更対象
`src/pages/Dashboard.tsx` のみ（2箇所）

### 1. ラベルを常に表示（212行目）
- `hidden lg:inline` → `text-sm` のみに変更
- これにより md 以上のデスクトップビューで常にラベルが表示される

### 2. Flow タブの非アクティブスタイルを控えめに（205-208行目）
- 非アクティブ時の `bg-primary/10 border border-primary/20` を削除
- `text-primary font-semibold` のみ残し、背景なしで区別
- アクティブ時は引き続き `bg-primary text-primary-foreground shadow-md` を適用

