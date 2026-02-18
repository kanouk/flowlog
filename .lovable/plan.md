

# ナビゲーションのフラット化

## 概要
現在の2階層構造（Flow/Stock → Stockサブタブ）を廃止し、「入力・日記・タスク・予定・メモ・あとで読む」の6タブによるフラットなナビゲーションに変更する。

## 現在の構造

```text
[Flow] [Stock]
         └─ [日記] [タスク] [予定] [メモ] [あとで読む]
```

## 変更後の構造

```text
[入力] [日記] [タスク] [予定] [メモ] [あとで読む]
```

## 変更対象ファイル

### 1. `src/pages/Dashboard.tsx`（主要変更）

- `activeTab` の型を `'flow' | 'stock'` から `'flow' | 'journal' | 'tasks' | 'schedule' | 'memos' | 'readLater'` に変更
- デスクトップのタブリスト: `grid-cols-2` → `grid-cols-6` に変更し、6つの `TabsTrigger` を配置
- `TabsContent`: `stock` の1つを `journal` / `tasks` / `schedule` / `memos` / `readLater` の5つに分割し、それぞれ対応するビューコンポーネントを直接配置
- モバイルのボトムナビ: 2ボタン → 6ボタンに変更（アイコンのみ表示）
- StockView のインポートを削除し、各サブビュー（JournalView, TasksView, ScheduleView, MemosView, ReadLaterView）を直接インポート

#### モバイルボトムナビのレイアウト

```text
[PenLine] [BookOpen] [ListTodo] [CalendarClock] [Brain] [Bookmark]
  入力      日記      タスク       予定          メモ    あとで読む
```

- テキストラベルは非表示（アイコンのみ）でスペースを確保
- 各タブにカテゴリカラーのアクティブインジケーターを適用（青、青、オレンジ、シアン、紫、緑）

#### デスクトップタブのレイアウト

- アイコン + テキストラベルで6タブを横並び
- 各タブにカテゴリカラーを適用

### 2. `src/components/stock/StockView.tsx`（削除候補）

- フラット化により StockView 自体が不要になる。ただし、段階的に進めるなら残しておいてもよい
- 推奨: StockView を削除し、Dashboard から各サブビューを直接利用

### 3. 検索ナビゲーションの修正 (`handleSearchNavigate`)

- 検索結果からのナビゲーション時、`tab` パラメータが `'flow' | 'stock'` だったものを、カテゴリに応じた適切なタブ（`'journal'` / `'tasks'` など）に変更
- `SearchBar` や `SearchResults` でのタブ指定ロジックも合わせて更新

### 4. `src/components/search/SearchResults.tsx`（軽微な修正）

- 検索結果クリック時のナビゲーション先タブを、ブロックのカテゴリに応じて適切なタブ名に変換

### 5. `src/hooks/useTabSwipe.ts`（修正）

- StockView 内のスワイプ処理は不要になるが、ダッシュボード全体での6タブ間スワイプに対応させる場合は Dashboard 側にスワイプロジックを移動

## 各タブの構成

| タブ名 | アイコン | カラー | コンポーネント |
|--------|---------|--------|--------------|
| 入力 | PenLine | primary | FlowView |
| 日記 | BookOpen | 青 | JournalView |
| タスク | ListTodo | オレンジ | TasksView |
| 予定 | CalendarClock | シアン | ScheduleView |
| メモ | Brain | 紫 | MemosView |
| あとで読む | Bookmark | 緑 | ReadLaterView |

## 注意点

- ロゴクリック時の `handleLogoClick` は `setActiveTab('flow')` のままで問題なし
- URL パラメータの `tab` 指定があれば、新しいタブ名に対応させる
- StockView 内にあったスワイプジェスチャー（タブ間移動）は Dashboard レベルに移動して6タブ間で動作させる
