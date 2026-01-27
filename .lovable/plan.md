
# FlowInput/TasksView の改善

## 概要
3つの改善を実施します:
1. カテゴリ切り替え時にタグをクリア
2. フロー画面を開いたらテキストエリアに自動フォーカス
3. タスク一覧クリックで編集モーダルを表示

---

## 1. カテゴリ切り替え時にタグをクリア

**ファイル: `src/components/flow/FlowInput.tsx`**

`handleCategoryChange` 関数でタグをリセット:

```typescript
const handleCategoryChange = (cat: BlockCategory) => {
  setCategory(cat);
  setLastCategory(cat);
  // タグをクリア
  setTag(null);
  setLastTag(null);
};
```

---

## 2. テキストエリアに自動フォーカス

**ファイル: `src/components/flow/FlowInput.tsx`**

マウント時と日付変更時にフォーカスを設定:

```typescript
// 初回マウント時にカテゴリ・タグを復元し、フォーカス
useEffect(() => {
  setCategory(getLastCategory());
  setTag(getLastTag());
  // テキストエリアにフォーカス
  setTimeout(() => {
    textareaRef.current?.focus();
  }, 100);
}, []);
```

---

## 3. タスク一覧に編集モーダルを追加

**ファイル: `src/components/stock/TasksView.tsx`**

ScheduleViewと同様の実装パターンで編集機能を追加:

### インポート追加
```typescript
import { BlockEditModal } from '@/components/flow/BlockEditModal';
```

### ステート追加
```typescript
const [editingBlock, setEditingBlock] = useState<Block | null>(null);
```

### 編集保存ハンドラー追加
```typescript
const handleEditSave = async (updates: BlockUpdatePayload & { images?: string[] }) => {
  if (!editingBlock) return;
  const updated = await updateBlock(editingBlock.id, updates);
  if (updated) {
    setBlocks(prev => {
      const mapped = prev.map(b => b.id === editingBlock.id ? updated : b);
      // 再ソート
      return mapped.sort((a, b) => {
        if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
        // ...
      });
    });
  }
  setEditingBlock(null);
};

const handleEditDelete = async (blockId: string) => {
  const success = await deleteBlock(blockId);
  if (success) {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
  }
};
```

### タスクアイテムをクリック可能に
```typescript
<div 
  key={block.id} 
  className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${...}`}
  onClick={() => setEditingBlock(block)}  // ← 追加
>
```

### モーダルコンポーネント追加
```tsx
{/* 編集モーダル */}
{editingBlock && (
  <BlockEditModal
    block={editingBlock}
    isOpen={!!editingBlock}
    onClose={() => setEditingBlock(null)}
    onSave={handleEditSave}
    onDelete={handleEditDelete}
  />
)}
```

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/components/flow/FlowInput.tsx` | カテゴリ変更時にタグクリア、初期フォーカス設定 |
| `src/components/stock/TasksView.tsx` | BlockEditModal追加、クリックで編集可能に |

---

## 期待する動作

1. **カテゴリ変更**: 「出来事」→「タスク」などカテゴリを切り替えるとタグが「なし」にリセット
2. **フォーカス**: フロー画面を開くと自動的にテキスト入力欄にカーソルが移動し、すぐに入力開始可能
3. **タスク編集**: タスク一覧のアイテムをクリックすると編集モーダルが開き、内容・カテゴリ・タグ・日時を変更可能
