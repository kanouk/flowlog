

# 夜更かしオフセット（day_boundary_hour）実装計画

## 概要
0時以降でも設定した区切り時刻までは前日の「生活日」として扱う機能。データ（occurred_at）は変えず、表示・所属判定・AI文脈のみ変更。

## 変更一覧

### 1. DB マイグレーション
`user_ai_settings` に `day_boundary_hour` カラム追加:
```sql
ALTER TABLE user_ai_settings 
  ADD COLUMN day_boundary_hour integer NOT NULL DEFAULT 0;

-- CHECK制約ではなくバリデーショントリガーで 0-12 を制約
CREATE OR REPLACE FUNCTION validate_day_boundary_hour() ...
CREATE TRIGGER ... BEFORE INSERT OR UPDATE ON user_ai_settings ...
```

### 2. 共有 Hook: `useDayBoundary`（新規）
`src/hooks/useDayBoundary.ts` — `user_ai_settings.day_boundary_hour` を1回取得し、コンテキスト的にキャッシュ。全コンポーネントが個別にfetchしない設計。

```typescript
export function useDayBoundary(): { dayBoundaryHour: number; loading: boolean }
```

`useAuth` の隣で Dashboard/Settings から呼び、子コンポーネントに prop として渡す。または React Context で提供。

### 3. `dateUtils.ts` 関数の拡張
全既存関数のシグネチャに `dayBoundaryHour` 引数を追加（デフォルト0で後方互換）:

| 関数 | 変更内容 |
|---|---|
| `getTodayKey(dbh)` | 現在時刻 - dbh時間 の JST 日付を返す |
| `getOccurredAtDayKey(iso, dbh)` | occurred_at - dbh時間 の JST 日付を返す |
| `getDateRangeUTC(date, dbh)` | 生活日の範囲を `date dbh:00 JST` 〜 `翌日 dbh:00 JST` に変更 |
| `createOccurredAt(dayKey, time, dbh)` | time >= 24:00 の場合は翌calendar dayの HH-24:mm として生成。time < dbh の場合は翌calendar dayとして解釈 |
| `calculateMiddleOccurredAt(prev, next, date, dbh)` | getDateRangeUTC に dbh を渡す |
| `formatTimeWithDayBoundary(iso, dbh)` | **新規** dbh未満の時刻を 24+HH:mm で表示 |
| `formatDisplayDateJST(iso, dbh)` | **新規** 生活日基準の M月d日 表示 |

`createOccurredAt` の動作例（dbh=5）:
- dayKey=2026-03-07, time=01:30 → 「生活日3/7の01:30」→ 実calendar 2026-03-08 01:30 JST の UTC ISO
- dayKey=2026-03-07, time=23:00 → 「生活日3/7の23:00」→ 実calendar 2026-03-07 23:00 JST の UTC ISO

### 4. Dashboard (`src/pages/Dashboard.tsx`)
- `useDayBoundary()` を呼び出し
- `getTodayKey(dayBoundaryHour)` で today を算出
- `dayBoundaryHour` を `FlowView`, `JournalView` 等に prop で渡す

### 5. FlowView (`src/components/flow/FlowView.tsx`)
- `dayBoundaryHour` prop を受け取り
- `getTodayKey(dbh)`, `getDateRangeUTC`, `calculateMiddleOccurredAt`, `getOccurredAtDayKey` に dbh を渡す
- `addBlockWithDate` 呼び出し時に dbh を渡す

### 6. useEntries (`src/hooks/useEntries.ts`)
- `getBlocksByDate(selectedDate, dbh)` — `getDateRangeUTC(date, dbh)` を使う
- `addBlockWithDate({ ..., dayBoundaryHour })` — today判定, dayKey算出, entry紐付けに dbh を使用
- `updateBlock` — `getOccurredAtDayKey(iso, dbh)` で新dayKeyを算出

### 7. BlockList (`src/components/flow/BlockList.tsx`)
- `dayBoundaryHour` prop 追加
- 時刻表示を `formatTimeWithDayBoundary(occurred_at, dbh)` に変更

### 8. BlockEditModal (`src/components/flow/BlockEditModal.tsx`)
- 時刻保存時に `createOccurredAt(dayKey, time, dbh)` を使用
- dayKey 算出に `getOccurredAtDayKey(iso, dbh)` を使用

### 9. FormattedView (`src/components/flow/FormattedView.tsx`)
- 時刻表示を `formatTimeWithDayBoundary` に変更

### 10. Stock Views (TasksView, MemosView, ReadLaterView, ScheduleView)
- 時刻・日付表示を `formatTimeWithDayBoundary` / `formatDisplayDateJST` に変更
- `dayBoundaryHour` を prop または useDayBoundary で取得

### 11. DateNavigation (`src/components/flow/DateNavigation.tsx`)
- `getTodayKey(dbh)` で today 判定

### 12. 検索 (`SearchBar.tsx`, `SearchResults.tsx`)
- `block.occurred_at.split('T')[0]` → `getOccurredAtDayKey(block.occurred_at, dbh)` に変更

### 13. QuickAddModal (`src/components/stock/QuickAddModal.tsx`)
- today判定を `getTodayKey(dbh)` に変更

### 14. JournalView (`src/components/stock/JournalView.tsx`)
- today判定を dbh 対応に変更

### 15. 設定UI（新規セクション）
Settings ページに「1日の区切り」設定を追加。`ScoreSettingsSection` と同様のパターンで実装。
- スライダーまたはセレクトで 0〜12 を選択
- 説明文: 「指定した時刻より前の記録は前日の日記に入ります。例えば 5:00 にすると 1:30 は前日の 25:30 として扱います。」
- `user_ai_settings.day_boundary_hour` に保存

### 16. AI文脈 (`format-entries/index.ts`)
- リクエストボディに `dayBoundaryHour` を含める
- 日記生成プロンプトの date を生活日基準に
- 時刻推測に生活日コンテキストを反映

### 17. REST API (`api/index.ts`)
- ブロック取得系に `day_boundary_hour` クエリパラメータ対応（任意）

## 設計上の注意

1. **後方互換**: 全関数のデフォルト引数 = 0 で、既存の呼び出し元を壊さない
2. **Context vs Props**: `useDayBoundary` の結果を `DayBoundaryContext` で提供し、深いコンポーネントでも props drilling を最小化
3. **entries テーブルの date**: 新規保存時は生活日基準の dayKey を使うが、過去の entry.date は変更しない
4. **D&D**: `calculateMiddleOccurredAt` が生活日境界を使うため、dbh=5 なら 05:00-翌05:00 の範囲でクランプされる

## 変更ファイル一覧

| ファイル | 変更 |
|---|---|
| DB migration | `day_boundary_hour` カラム + バリデーショントリガー |
| `src/lib/dateUtils.ts` | 全関数に dbh 引数追加 + 新関数2つ |
| `src/hooks/useDayBoundary.ts` | **新規** 設定取得 hook |
| `src/contexts/DayBoundaryContext.tsx` | **新規** Context Provider |
| `src/pages/Dashboard.tsx` | Context Provider でラップ、today 算出変更 |
| `src/pages/Settings.tsx` | 新セクション追加 |
| `src/components/settings/DayBoundarySection.tsx` | **新規** 設定UI |
| `src/hooks/useEntries.ts` | getBlocksByDate, addBlockWithDate, updateBlock に dbh 対応 |
| `src/components/flow/FlowView.tsx` | dbh 対応 |
| `src/components/flow/BlockList.tsx` | 時刻表示変更 |
| `src/components/flow/BlockEditModal.tsx` | 保存/表示変更 |
| `src/components/flow/FormattedView.tsx` | 時刻表示変更 |
| `src/components/flow/DateNavigation.tsx` | today判定変更 |
| `src/components/stock/TasksView.tsx` | 時刻表示変更 |
| `src/components/stock/MemosView.tsx` | 時刻表示変更 |
| `src/components/stock/ReadLaterView.tsx` | 時刻表示変更 |
| `src/components/stock/JournalView.tsx` | today判定変更 |
| `src/components/stock/QuickAddModal.tsx` | today判定変更 |
| `src/components/search/SearchBar.tsx` | dayKey算出変更 |
| `src/components/search/SearchResults.tsx` | dayKey算出変更 |
| `supabase/functions/format-entries/index.ts` | dbh 対応 |

