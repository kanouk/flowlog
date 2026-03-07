

# 「あとで読む」→「あとで」リネーム + 既読/完了日時表示強化 + タスク期限追加

## 変更概要

1. **ラベル変更**: 「あとで読む」→「あとで」（DB値 `read_later` は変更しない）
2. **既読ボタン改善 + done_at 日時表示**（ReadLaterView）
3. **タスク完了日時表示強化 + 期限（due_at）追加**（TasksView + BlockEditModal）
4. **日記・アナリティクスへの軽い反映**

## DB マイグレーション

```sql
ALTER TABLE blocks ADD COLUMN due_at TIMESTAMPTZ;
ALTER TABLE blocks ADD COLUMN due_all_day BOOLEAN DEFAULT false;
```

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| DB migration | `due_at`, `due_all_day` カラム追加 |
| `src/lib/categoryUtils.ts` | label を「あとで」に変更（2箇所） |
| `src/components/stock/ReadLaterView.tsx` | タイトル「あとで」、既読ボタンにラベル追加・大型化、done_at 日時表示 |
| `src/components/stock/QuickAddModal.tsx` | 「あとでを追加」に変更 |
| `src/components/stock/StockView.tsx` | タブラベル「あとで」 |
| `src/components/flow/FormattedView.tsx` | 空状態テキスト「あとで」 |
| `src/pages/Index.tsx` | ランディングのラベル「あとで」 |
| `src/pages/Analytics.tsx` | カテゴリラベル「あとで」 |
| `src/components/settings/McpSettingsSection.tsx` | ヘルプテキスト「あとで」 |
| `supabase/functions/format-entries/index.ts` | ラベル「あとで」+ 完了/既読日時・期限を日記に反映 |
| `supabase/functions/api/index.ts` | メッセージ文言「あとで」 |
| `supabase/functions/mcp-server/index.ts` | description「あとで」 |
| `src/hooks/useEntries.ts` | Block interface に `due_at`, `due_all_day` 追加、BlockUpdatePayload にも追加 |
| `src/components/flow/BlockEditModal.tsx` | タスクカテゴリ時に期限UI追加（終日/日時、スケジュールと同じパターン） |
| `src/components/stock/TasksView.tsx` | 完了日時の表示強化、期限表示（期限切れは赤字） |
| `src/hooks/useAnalytics.ts` | 期間内の完了タスク数・既読数を集計追加 |

## 実装詳細

### 1. ラベル変更
全14ファイルの「あとで読む」を「あとで」に一括変更。DB category値 `read_later` は変更しない。

### 2. ReadLaterView 既読ボタン改善
- ボタンを `w-8 h-8` → `px-3 py-1.5 rounded-full` のラベル付きトグルに変更
- 未読時: 緑色「未読」、既読時: グレー「既読」
- done_at がある場合: メタ行に `✓ 3月7日 14:30 に既読` を表示

### 3. タスク期限（due_at）
- BlockEditModal: タスクカテゴリ時にスケジュールと同じパターンで「期限」UI表示（終日チェック + 日付ピッカー + 時刻入力 + クリアボタン）
- TasksView: 期限表示（期限切れの未完了タスクは赤文字で「期限切れ」）
- handleSave で `due_at`, `due_all_day` を保存

### 4. 日記への反映（format-entries）
- タスク完了時: `[✓ 3/7 14:30完了]`
- 既読時: `[既読 3/7 14:30]`
- 期限あり: `[期限: 3/8 18:00]` or `[期限: 3/8 終日]`

### 5. アナリティクス
- `useAnalytics` の blocksQuery で `is_done, done_at` も select
- 期間内の完了タスク数・既読完了数をサマリーに追加して返す

