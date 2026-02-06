
# 日付ナビゲーションの配置変更

## 概要
日付ナビゲーションをヘッダーから FlowView 内の入力フォームの上に移動し、Stock ビューと同様のレイアウトに統一します。

---

## 変更内容

### Before（現在）
```text
┌────────────────────────────────────────────────────┐
│ [FlowLog]  [◀] 今日 [📅]          [🔍] [⚙] [→]   │  ← ヘッダーに日付ナビ
├────────────────────────────────────────────────────┤
│    入力フォーム                                    │
│    ───────────────                                │
│    今日のログ 3件                                  │
│    ログ一覧                                        │
└────────────────────────────────────────────────────┘
```

### After（変更後）
```text
┌────────────────────────────────────────────────────┐
│ [FlowLog]                         [🔍] [⚙] [→]   │  ← シンプルなヘッダー
├────────────────────────────────────────────────────┤
│    [◀] 今日 [▶] [今日] [📅]                       │  ← 日付ナビがここに
│    ───────────────                                │
│    入力フォーム                                    │
│    ───────────────                                │
│    今日のログ 3件                                  │
│    ログ一覧                                        │
└────────────────────────────────────────────────────┘
```

---

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/pages/Dashboard.tsx` | ヘッダーから DateNavigation を削除 |
| `src/components/flow/FlowView.tsx` | FlowInput の上に DateNavigation を追加 |

---

## 詳細な変更

### 1. Dashboard.tsx
- ヘッダーから `DateNavigation` コンポーネントを削除
- `DateNavigation` のインポートを削除（FlowView に移動）
- `datesWithEntries` の計算は FlowView に `entries` を渡すか、FlowView 内で計算

### 2. FlowView.tsx
- `DateNavigation` をインポート
- FlowInput の上に DateNavigation を配置
- `datesWithEntries` をローカルで計算（または props で受け取る）
- props に `onDateChange` と `datesWithEntries` を追加

---

## レイアウト

```tsx
// FlowView.tsx
return (
  <div className="space-y-6">
    {/* Date Navigation - 入力フォームの上 */}
    <div className="flex items-center justify-center pb-2 border-b border-border">
      <DateNavigation 
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        datesWithEntries={datesWithEntries}
      />
    </div>

    {/* Input Form */}
    <FlowInput ... />

    {/* 時刻質問エリア */}
    ...

    {/* Section Header + Block List */}
    ...
  </div>
);
```

---

## Props の変更

### FlowView
```typescript
interface FlowViewProps {
  selectedDate: string;
  onNavigateToDate?: (date: string) => void;
  onDateChange: (date: string) => void;  // 追加
  datesWithEntries?: string[];           // 追加
  targetBlockId?: string | null;
  onBlockScrolled?: () => void;
  searchQuery?: string | null;
  onSearchCleared?: () => void;
}
```
