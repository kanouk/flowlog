

# 検索キーワードのブロック内ハイライト機能

## 概要
検索結果クリック後、遷移先のブロック内で検索キーワードをハイライト表示する機能を追加します。

## 現状と目標

| 場所 | 現状 | 目標 |
|------|------|------|
| 検索結果ドロップダウン | ハイライトあり ✅ | - |
| 遷移後のブロック | 外枠ハイライトのみ | **テキスト内もハイライト** |

---

## 変更内容

### 1. Dashboard.tsx
検索キーワードをFlowViewに渡すためのstateを追加します。

```typescript
// 追加するstate
const [searchQuery, setSearchQuery] = useState<string | null>(null);

// handleSearchNavigate を更新
const handleSearchNavigate = (date: string, tab?: 'flow' | 'stock', blockId?: string, query?: string) => {
  // ... 既存の処理 ...
  if (query) {
    setSearchQuery(query);
  }
};

// FlowView に渡す
<FlowView 
  ...
  searchQuery={searchQuery}
  onSearchCleared={() => setSearchQuery(null)}
/>
```

### 2. SearchBar.tsx
検索キーワードを上位に渡すように更新します。

```typescript
// propsの更新
onNavigateToDate: (date: string, tab?: 'flow' | 'stock', blockId?: string, query?: string) => void;

// handleSelectBlock を更新
const handleSelectBlock = (date: string, blockId: string) => {
  onNavigateToDate(date, 'flow', blockId, query);  // ← query を追加
  ...
};
```

### 3. FlowView.tsx
検索キーワードをBlockListに渡します。

```typescript
interface FlowViewProps {
  ...
  searchQuery?: string | null;
  onSearchCleared?: () => void;
}

// BlockList に渡す
<BlockList 
  ...
  highlightQuery={searchQuery}
/>

// スクロール完了時にクリア
useEffect(() => {
  if (targetBlockId && blocks.length > 0 && !loading) {
    ...
    setTimeout(() => {
      ...
      // スクロール完了後、一定時間後にハイライトをクリア
      setTimeout(() => {
        onSearchCleared?.();
      }, 5000);
    }, 100);
  }
}, [...]);
```

### 4. BlockList.tsx
テキスト内のキーワードをハイライト表示します。

```typescript
interface BlockListProps {
  ...
  highlightQuery?: string | null;
}

// ハイライト関数を追加
const highlightText = (text: string, query: string | null | undefined) => {
  if (!query?.trim()) return text;
  
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, i) => 
    i % 2 === 1 ? (
      <mark key={i} className="bg-primary/30 text-foreground rounded px-0.5">
        {part}
      </mark>
    ) : part
  );
};

// コンテンツ表示部分を更新
<p ...>
  {highlightText(block.content, highlightQuery)}
</p>
```

---

## データフロー

```text
SearchBar: query (検索キーワード)
    ↓
Dashboard: searchQuery state に保存
    ↓
FlowView: searchQuery props で受け取り
    ↓
BlockList: highlightQuery props で受け取り → テキストをハイライト表示
    ↓
スクロール完了後5秒: onSearchCleared → searchQuery をクリア
```

---

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/components/search/SearchBar.tsx` | `onNavigateToDate` にqueryを追加 |
| `src/pages/Dashboard.tsx` | `searchQuery` state追加、FlowViewに渡す |
| `src/components/flow/FlowView.tsx` | `searchQuery` を受け取りBlockListに渡す |
| `src/components/flow/BlockList.tsx` | `highlightQuery` でテキスト内ハイライト |

