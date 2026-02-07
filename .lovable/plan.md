
# 日付ナビゲーションの美しいデザインへの刷新

## 現状の問題
- シンプルすぎるデザイン
- 視覚的なインパクトが弱い
- 今日と過去日の区別が分かりにくい

---

## デザインコンセプト

### 新しいレイアウト
```text
┌────────────────────────────────────────────────────────────┐
│                                                            │
│        ┌─────────────────────────────────────────┐         │
│        │   ◀   │   ☀️ 今日   2/7（金）   │   ▶   │         │
│        │       │ ───────────────────── │       │         │
│        │       │        📅              │       │         │
│        └─────────────────────────────────────────┘         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### カード型デザイン
- 背景にグラデーション（今日：primary系、過去：muted系）
- 角丸のカード形状
- 今日はアイコン（太陽）と「今日」ラベル
- 過去は日付を大きく表示

---

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/components/flow/DateNavigation.tsx` | デザイン全面刷新 |

---

## デザイン詳細

### 今日の場合
```tsx
<div className="date-nav-card bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
  <button>◀</button>
  <div className="text-center">
    <div className="flex items-center justify-center gap-2">
      <Sun className="text-primary h-5 w-5" />
      <span className="text-lg font-semibold text-primary">今日</span>
    </div>
    <span className="text-sm text-muted-foreground">2月7日（金）</span>
  </div>
  <button disabled>▶</button>
  <button>📅</button>
</div>
```

### 過去日の場合
```tsx
<div className="date-nav-card bg-muted/50 border-border">
  <button>◀</button>
  <div className="text-center">
    <span className="text-lg font-semibold">2月6日</span>
    <span className="text-sm text-muted-foreground">（木）</span>
  </div>
  <button>▶</button>
  <button className="text-primary">今日へ</button>
  <button>📅</button>
</div>
```

---

## スタイリング

### カード全体
```css
- px-4 py-3
- rounded-xl
- border
- shadow-sm
- 今日: グラデーション背景 + primary色のアクセント
- 過去: muted背景 + subtle border
```

### ナビゲーションボタン
```css
- 円形ボタン（w-10 h-10）
- ホバー時にスケールアップ
- 今日: primary色
- 過去: muted-foreground色
```

### 日付表示
```css
- 2行構成（日付 + 曜日/サブラベル）
- 今日: アイコン + 「今日」+ 日付
- 過去: 日付を大きく表示
```

### アニメーション
```css
- ボタンホバー: scale(1.1)
- カード: subtle shadow on hover
- 日付変更時: fade transition
```

---

## 完成イメージ

### 今日
```text
┌──────────────────────────────────────────────────┐
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │  (◀)    ☀️ 今日                     (📅) │   │
│   │         2月7日（金）                     │   │
│   └──────────────────────────────────────────┘   │
│         ↑ グラデーション背景（primary系）        │
└──────────────────────────────────────────────────┘
```

### 過去日
```text
┌──────────────────────────────────────────────────┐
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │  (◀)    2月6日（木）      [今日] (▶)(📅) │   │
│   └──────────────────────────────────────────┘   │
│         ↑ muted背景                             │
└──────────────────────────────────────────────────┘
```

---

## 実装ポイント

1. **カード型コンテナ**
   - `rounded-xl border shadow-sm`
   - 条件付きグラデーション背景

2. **今日と過去の視覚的区別**
   - 今日: Sun アイコン + 「今日」ラベル + primary カラー
   - 過去: 日付のみ + 「今日へ」ボタン

3. **ボタンのインタラクション**
   - ホバー時のスケールアニメーション
   - disabled 状態の適切な表示

4. **日付のフォーマット**
   - 今日: "今日" + "M月d日（E）"
   - 過去: "M月d日（E）"

5. **レスポンシブ対応**
   - モバイルでもコンパクトに表示
