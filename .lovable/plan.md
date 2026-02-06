
# タスク優先度機能の追加

## 概要
タスクに優先度（高・中・低・なし）を設定できる機能を追加し、未完了タスクを優先度順で並び替えられるようにします。

---

## データベース変更

### blocks テーブルに priority カラムを追加
```sql
ALTER TABLE blocks ADD COLUMN priority integer DEFAULT 0;
```

| 値 | 意味 |
|----|------|
| 0 | なし（デフォルト） |
| 1 | 低 |
| 2 | 中 |
| 3 | 高 |

---

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/hooks/useEntries.ts` | Block型・BlockUpdatePayloadにpriority追加 |
| `src/lib/categoryUtils.ts` | 優先度の定義・設定を追加 |
| `src/components/stock/TasksView.tsx` | 優先度インジケーター表示、並び替えロジック |
| `src/components/stock/QuickAddModal.tsx` | タスク追加時に優先度選択UI |
| `src/components/flow/BlockEditModal.tsx` | タスク編集時に優先度選択UI |
| `src/components/flow/FlowInput.tsx` | タスクカテゴリ時に優先度選択UI |

---

## UI デザイン

### 優先度セレクター（フラグアイコン）
```text
[🏴 なし] [🏳️ 低] [🏴 中] [🔴 高]
```

フラグアイコンを使用し、色で優先度を区別：
- **高**: 赤色 (`text-red-500`)
- **中**: 黄色 (`text-yellow-500`)
- **低**: 緑色 (`text-green-500`)
- **なし**: グレー（デフォルト）

### タスク一覧での表示
```text
┌─────────────────────────────────────────┐
│ ☐ 🔴 重要なタスク              12:30   │  ← 高優先度（赤フラグ）
│ ☐ 🟡 中程度のタスク            11:00   │  ← 中優先度（黄フラグ）
│ ☐ 🟢 軽いタスク               10:00   │  ← 低優先度（緑フラグ）
│ ☐    普通のタスク               9:00   │  ← 優先度なし
└─────────────────────────────────────────┘
```

---

## 並び替えロジック

### 現在の順序
1. 未完了 → 完了済み
2. 未完了内: `occurred_at` DESC（新しい順）
3. 完了内: `done_at` DESC

### 変更後の順序
1. 未完了 → 完了済み
2. 未完了内: **`priority` DESC（高い順）** → `occurred_at` DESC
3. 完了内: `done_at` DESC（変更なし）

---

## 実装詳細

### 1. categoryUtils.ts に優先度定義を追加
```typescript
export type TaskPriority = 0 | 1 | 2 | 3;

export const PRIORITY_CONFIG = {
  0: { label: 'なし', color: 'text-muted-foreground', bgColor: '' },
  1: { label: '低', color: 'text-green-500', bgColor: 'bg-green-500/10' },
  2: { label: '中', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  3: { label: '高', color: 'text-red-500', bgColor: 'bg-red-500/10' },
};
```

### 2. useEntries.ts の型更新
```typescript
export interface Block {
  // ... existing fields
  priority: number; // 0-3
}

export interface BlockUpdatePayload {
  // ... existing fields
  priority?: number;
}
```

### 3. TasksView.tsx の並び替え更新
```typescript
// 未完了タスクの並び替え
return updated.sort((a, b) => {
  if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
  if (!a.is_done && !b.is_done) {
    // 優先度で並び替え（高い順）
    const priorityDiff = (b.priority || 0) - (a.priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
  }
  // 同じ優先度なら日時順
  return parseTimestamp(b.occurred_at).getTime() - parseTimestamp(a.occurred_at).getTime();
});
```

### 4. PrioritySelector コンポーネント（新規）
```typescript
// タスクカテゴリ選択時のみ表示
// 4つのボタン（なし/低/中/高）
// 選択中はリング＋背景色
```

---

## 表示箇所

| 画面 | 優先度表示 | 優先度設定 |
|------|----------|----------|
| Flow入力フォーム（タスク時） | - | ○ |
| ブロック編集モーダル（タスク時） | - | ○ |
| QuickAddModal（タスク時） | - | ○ |
| TasksView 一覧 | ○（フラグアイコン） | - |
| BlockList（Flow内） | ○（フラグアイコン） | - |

---

## 実装順序

1. DBマイグレーション（priority カラム追加）
2. 型定義更新（useEntries.ts, categoryUtils.ts）
3. PrioritySelector コンポーネント作成
4. FlowInput に優先度選択UI追加
5. BlockEditModal に優先度選択UI追加
6. QuickAddModal に優先度選択UI追加
7. TasksView に優先度表示＋並び替えロジック追加
8. BlockList（Flow）に優先度表示追加
