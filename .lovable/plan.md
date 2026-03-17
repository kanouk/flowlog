

# 同期後に一覧が空になるバグ修正 + Raindropラベル表示

## 問題の原因

`ReadLaterView` の Raindrop同期エフェクト (line 103-115) は依存配列が `[]` のため、マウント時の `loadData` をクロージャにキャプチャしている。この時点で `userId` が未設定の場合、同期完了後に呼ばれる `loadData()` 内の `getBlocksByCategory` が `if (!userId) return []` で空配列を返し、`setBlocks([])` で一覧がリセットされる。

## 修正内容

### 1. `ReadLaterView.tsx` - 同期エフェクトの修正

同期完了後に `loadData` を呼ぶのではなく、同期結果のフラグで状態を更新し、初回ロード完了後にのみ同期を実行するように変更:

- `loadData` 完了後にのみ同期を開始する (loading === false を条件に)
- 同期完了時は最新の `loadData` 参照を使う (ref を使うか、依存配列を正しく設定)

### 2. `raindrop-sync/index.ts` - `source` フィールド追加

`url_metadata` に `source: 'raindrop'` を追加して、外部取得元を識別可能にする。

### 3. `ReadLaterView.tsx` - Raindropラベル表示

`url_metadata?.source === 'raindrop'` のブロックに、控えめなラベル (`CloudDownload` アイコン + "Raindrop") を表示。既存の日時表示エリアの横に小さくバッジ表示する。

### ファイル変更

| File | Change |
|---|---|
| `src/components/stock/ReadLaterView.tsx` | 同期タイミング修正 + Raindropラベル |
| `supabase/functions/raindrop-sync/index.ts` | `source: 'raindrop'` を url_metadata に追加 |

