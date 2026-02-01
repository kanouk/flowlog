
# Stockビューからの新規ブロック作成機能追加

## 概要
Stock画面の各カテゴリビュー（タスク、予定、メモ、あとで読む）に、該当カテゴリのブロックを直接追加できるUIを実装します。Flow画面に遷移することなく、その場で素早く追加できるようになります。

---

## UI設計

### 追加ボタンの配置
各ビューのヘッダーセクション右上に「+」ボタンを追加します。

```
┌─────────────────────────────────────────┐
│ [アイコン] タスク              [+追加] │
│ 未完了 3件 / 完了 5件                   │
│                                         │
│ [フィルター]                            │
└─────────────────────────────────────────┘
```

### 入力モーダル
ボタンをクリックすると、カテゴリに応じた入力モーダルが開きます。

**共通要素:**
- テキストエリア（内容入力）
- タグ選択ドロップダウン
- 保存ボタン / キャンセルボタン

**カテゴリ別の追加要素:**
- **予定（schedule）**: 開始日時、終了日時、終日チェックボックス
- **あとで読む（read_later）**: URL入力フィールド（任意）

---

## 実装方針

### 新規コンポーネント
`src/components/stock/QuickAddModal.tsx` を作成し、全カテゴリで共有可能な入力モーダルを実装します。

```typescript
interface QuickAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: BlockCategory;
  onAdd: (block: Block) => void;
}
```

### 各ビューへの統合

| ビュー | カテゴリ | 追加時の処理 |
|--------|----------|--------------|
| TasksView | task | リストに追加、未完了で表示 |
| ScheduleView | schedule | 開始日時でソート後挿入 |
| MemosView | thought | リストの先頭に追加 |
| ReadLaterView | read_later | 未読としてリスト先頭に追加 |

### データ保存ロジック
既存の `useEntries` フックの `addBlockWithDate` を使用します。
- `selectedDate` は今日（`getTodayKey()`）
- `mode` は `'toNow'`（現在時刻で記録）

---

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/components/stock/QuickAddModal.tsx` | 新規作成：汎用入力モーダル |
| `src/components/stock/TasksView.tsx` | 追加ボタンとモーダル統合 |
| `src/components/stock/ScheduleView.tsx` | 追加ボタンとモーダル統合 |
| `src/components/stock/MemosView.tsx` | 追加ボタンとモーダル統合 |
| `src/components/stock/ReadLaterView.tsx` | 追加ボタンとモーダル統合 |

---

## QuickAddModal の設計詳細

```typescript
// カテゴリごとのモーダル設定
const MODAL_CONFIG = {
  task: {
    title: 'タスクを追加',
    placeholder: 'タスクの内容を入力...',
    icon: ListTodo,
    color: 'orange',
  },
  schedule: {
    title: '予定を追加',
    placeholder: '予定のタイトルを入力...',
    icon: CalendarClock,
    color: 'cyan',
  },
  thought: {
    title: 'メモを追加',
    placeholder: 'メモの内容を入力...',
    icon: Brain,
    color: 'purple',
  },
  read_later: {
    title: 'あとで読むを追加',
    placeholder: 'URLまたはメモを入力...',
    icon: Bookmark,
    color: 'green',
  },
};
```

### scheduleカテゴリの入力UI
FlowInputのスケジュール入力UIを再利用し、以下を含みます：
- 終日チェックボックス
- 開始日時（日付カレンダー + 時刻入力）
- 終了日時（日付カレンダー + 時刻入力）
- 1時間後自動設定ロジック

---

## 期待される動作

1. ユーザーがStock > タスクタブを開く
2. 右上の「+」ボタンをクリック
3. モーダルが開き、タスク内容を入力
4. 「保存」をクリック
5. モーダルが閉じ、タスクリストの先頭（未完了セクション）に新しいタスクが表示される
6. toast で「タスクを追加しました」と表示

---

## 技術的注意点

- **JournalViewには追加しない**: 日記は出来事＋メモの整形結果であり、直接追加する概念がない
- **occurred_at**: 現在時刻で自動設定
- **entry_id**: 今日のentryを自動取得/作成
- **画像アップロード**: 初期実装では対応しない（シンプルさ優先）
- **タグ選択**: FlowInputと同じTagDropdownを再利用
