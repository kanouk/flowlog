

# format-entries Edge Function: dayBoundaryHour AI文脈反映

## 変更ファイル
`supabase/functions/format-entries/index.ts` のみ

## 変更内容

### 1. 生活日基準ヘルパー関数を追加（3つ）

```typescript
// occurred_at → 生活日基準の時刻表示 (例: dbh=5, 03:00→"27:00")
function formatTimeWithBoundary(occurredAt, dayBoundaryHour)

// 生活日基準の時間帯バケット (dbh未満の時刻→「夜」)
function getTimeBucketWithBoundary(occurredAt, dayBoundaryHour)

// プロンプト用の生活日説明テキスト生成
function buildDayBoundaryContext(dayBoundaryHour)
// → "1日の区切りは5:00です。0:00〜4:59は前日の続きとして扱います..."
```

### 2. `createOccurredAtFromTime` を dayBoundaryHour 対応に修正
- `dbh > 0` かつ推測時刻が `dbh` 未満 → 翌calendar dayの時刻として UTC ISO を生成
- これにより、Phase 1 で推測された深夜時刻が正しい calendar day に保存される

### 3. `TIME_ANALYSIS_PROMPT` を動的生成に変更
- `buildTimeAnalysisPrompt(dayBoundaryHour)` 関数化
- `dbh > 0` の場合: 深夜時刻は「この生活日の夜の延長」として扱い、`inferred_time` は実時刻 HH:mm で返すよう指示
- `dbh = 0` の場合: 既存の 23:59 マッピングロジックを維持

### 4. Phase 1（時刻推測）の変更
- ブロック一覧に生活日基準時刻を表示（例: `生活日時刻: 25:30 (実時刻: 01:30)`）
- プロンプトに `buildDayBoundaryContext()` の説明を挿入
- `createOccurredAtFromTime(date, time, dayBoundaryHour)` で保存

### 5. Phase 2（日記整形）の変更
- `blocksText` の時刻を `formatTimeWithBoundary()` で生活日基準表示に
- `DEFAULT_SYSTEM_PROMPT` の時間帯セクション定義を dbh 対応（夜が翌 dbh-1:59 まで）
- ユーザープロンプトに `buildDayBoundaryContext()` を挿入
- フォールバック日記生成で `getTimeBucketWithBoundary()` を使用

### 6. Phase 3（スコアリング）の変更
- `SCORE_PROMPT` に生活日基準の説明を追加（`dbh > 0` の場合のみ）
- 「25時に寝た」をこの生活日内の出来事として評価するよう指示

### 7. TS2345 ビルドエラー修正
- L612 の `.update({ occurred_at: newOccurredAt } as any)` → `as any` を除去（型が合うように修正）

## 既存構造への影響
- 3フェーズ構成は維持
- `dbh = 0` の場合、全ヘルパーは既存動作と同一（後方互換）
- blocks.occurred_at の保存値ロジックは変更なし（createOccurredAtFromTime が正しい calendar day を計算するだけ）

