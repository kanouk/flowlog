
# ブロックへのパーマリンク機能実装

## 概要
検索結果から該当ブロックに直接スクロールできるパーマリンク機能を実装します。既存の `blocks.id`（UUID）を活用し、URLパラメータとして渡すことで特定ブロックへの遷移を実現します。

## 実装アプローチ

### URL形式
```
/dashboard?date=2026-01-28&block=abc123-uuid
```

- `date`: 対象日付（既存）
- `block`: スクロール対象のブロックID（新規追加）

---

## 変更内容

### 1. SearchBar.tsx - ブロックID渡し対応

`onNavigateToDate` のシグネチャを拡張し、オプションでブロックIDを渡せるようにします。

```typescript
// 変更前
onNavigateToDate: (date: string, tab?: 'flow' | 'stock') => void;

// 変更後
onNavigateToDate: (date: string, tab?: 'flow' | 'stock', blockId?: string) => void;
```

`handleSelectBlock` で日付とブロックIDの両方を渡します。

### 2. SearchResults.tsx - ブロックID渡し対応

`onSelectBlock` のコールバックにブロックIDを含めます。

```typescript
// 変更前
onSelectBlock: (date: string) => void;

// 変更後
onSelectBlock: (date: string, blockId: string) => void;
```

### 3. Dashboard.tsx - URLパラメータ処理

URLから `block` パラメータを読み取り、FlowViewに渡します。

```typescript
const blockId = searchParams.get('block');
```

`handleSearchNavigate` を更新してブロックIDをURLに含めます。また、スクロール完了後にURLからブロックIDをクリアします。

### 4. FlowView.tsx - スクロール対象ブロックID対応

新しいprops `targetBlockId` を受け取り、スクロール完了時にコールバックを呼び出します。

```typescript
interface FlowViewProps {
  selectedDate: string;
  onNavigateToDate?: (date: string) => void;
  targetBlockId?: string | null;        // 新規追加
  onBlockScrolled?: () => void;         // 新規追加
}
```

`useEffect` でブロックへのスクロール処理を実装します。

### 5. BlockList.tsx - ブロックにDOM ID付与

各ブロック要素に一意のIDを付与してDOM操作でアクセス可能にします。

```html
<div id={`block-${block.id}`} ...>
```

さらに、ハイライトのためのpropsとスタイルを追加します。

---

## 技術詳細

### スクロールロジック（FlowView.tsx）

```typescript
useEffect(() => {
  if (targetBlockId && blocks.length > 0 && !loading) {
    const element = document.getElementById(`block-${targetBlockId}`);
    if (element) {
      // 少し遅延を入れてDOMが安定してからスクロール
      setTimeout(() => {
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        // ハイライトアニメーション
        element.classList.add('block-highlight');
        setTimeout(() => {
          element.classList.remove('block-highlight');
        }, 2000);
        // URLからblockパラメータをクリア
        onBlockScrolled?.();
      }, 100);
    }
  }
}, [targetBlockId, blocks, loading, onBlockScrolled]);
```

### ハイライトアニメーション（App.css）

```css
@keyframes block-highlight {
  0% { box-shadow: 0 0 0 0 rgba(var(--primary), 0.4); }
  50% { box-shadow: 0 0 0 4px rgba(var(--primary), 0.2); }
  100% { box-shadow: 0 0 0 0 rgba(var(--primary), 0); }
}

.block-highlight {
  animation: block-highlight 2s ease-out;
}
```

---

## データフロー

```text
[検索結果クリック]
        ↓
SearchResults.tsx: onSelectBlock(date, blockId)
        ↓
SearchBar.tsx: handleSelectBlock → onNavigateToDate(date, 'flow', blockId)
        ↓
Dashboard.tsx: handleSearchNavigate → setSearchParams({ date, block: blockId })
        ↓
FlowView.tsx: targetBlockId を受け取り → スクロール実行
        ↓
Dashboard.tsx: onBlockScrolled → block パラメータをURLから削除
```

---

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/components/search/SearchResults.tsx` | `onSelectBlock` にブロックIDを追加 |
| `src/components/search/SearchBar.tsx` | ブロックIDを上位コンポーネントに渡す |
| `src/pages/Dashboard.tsx` | URLパラメータ `block` の処理、FlowViewへの渡し |
| `src/components/flow/FlowView.tsx` | `targetBlockId` props追加、スクロール処理 |
| `src/components/flow/BlockList.tsx` | ブロック要素にDOM ID付与、ハイライト対応 |
| `src/App.css` | ハイライトアニメーション追加 |
