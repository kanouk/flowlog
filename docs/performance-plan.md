# FlowLog パフォーマンス改善計画書

作成日: 2026-06-11
対象リビジョン: `24e1245` 時点のコードベース
姉妹文書: `docs/refactoring-plan.md`(以下「リファクタリング計画」)

この文書は、実際にコードベースを監査して確認したパフォーマンス問題と、その修正案を優先度順にまとめた実装指示書である。リファクタリング計画と同様、Codex / Cursor などのAIコーディングエージェントがそのまま着手できる粒度で書く。

**リファクタリング計画との関係**: 本計画の一部(PF-2のキャッシュ導入)はリファクタリング計画 Phase 4(React Query 移行)と同じコードを触る。**Phase 4 を先に実施してから PF-2 を適用するのが最も手戻りが少ない。** それ以外のタスク(PF-1, PF-3〜PF-8)はリファクタリングと独立に実施できる。

---

## 0. 現状診断サマリ(検証済みの事実)

| # | 問題 | ユーザー体感への影響 |
|---|------|---------------------|
| 1 | 単一チャンク2.1MB(gzip 523KB)、コード分割なし、`import { icons } from 'lucide-react'` で全約1,500アイコンをバンドル | 初回ロードが遅い(特にモバイル回線) |
| 2 | Dashboardのタブ(flow/journal/tasks/schedule/memos/readLater)が**非アクティブ時にアンマウント**され、`QueryClient` も `staleTime` 未設定(=0)のため、**タブを切り替えるたびに全データを再フェッチ** | タブ切替のたびにスピナー表示 |
| 3 | `useCustomTags()` が BlockList / TasksView / ReadLaterView 等で個別にインスタンス化され、**同一内容の `custom_tags` クエリが画面遷移ごとに重複発行** | 無駄なリクエストとタグ表示の遅延 |
| 4 | `blocks` テーブルに **(user_id, category) 系のインデックスが無い**(既存は entries(user_id,date) / blocks(entry_id) / blocks(created_at) / blocks(user_id,occurred_at,created_at) のみ)。stock系ビューのカテゴリ別クエリがインデックスを使えない。`custom_tags(user_id)` のインデックスも無い | ブロック数が増えるほどstock系タブの表示が遅化 |
| 5 | `select('*')` が7箇所。特に `getEntries()` は `formatted_content`(AI整形済み全文、エントリあたり数KB〜)を**一覧表示に不要なのに全件分転送** | 一覧表示のための転送量が肥大 |
| 6 | flow系コンポーネントに `React.memo` がゼロ。`BlockList` はブロックごとに約140行のJSXをインライン生成し、`highlightText()` が**レンダーごとに全ブロックでRegExp生成+split** を実行。`DayBoundaryContext` のProvider valueが毎レンダー新規オブジェクト | ブロック数が多い日や検索ハイライト時に入力・スクロールがもたつく |
| 7 | stock系ビューは `limit: 200` で最大200ブロックを一括レンダリング。仮想化なし | タスク200件超でタブ初回表示に体感数秒の遅延(特にモバイル) |
| 8 | `<img>` に `loading="lazy"` がゼロ。アップロード前のクライアント側圧縮・リサイズなし(10MB上限チェックのみ) | 画像の多い日で初期表示時に全画像を一括ダウンロード。スマホ写真(3〜10MB)がそのまま保存・配信される |
| 9 | `mcp-server` / `api` の認証で `last_used_at` 更新を**インラインでawait**(全リクエストに1往復分のレイテンシ加算)。`addBlockWithDate` は過去日付への追加時に「最終ブロック取得→entry取得or作成→insert」を直列実行 | API応答とブロック追加がワンテンポ遅い |

---

## 1. 共通ルールと計測基盤

### 共通ルール

- リファクタリング計画の「全フェーズ共通ルール」(挙動不変、1タスク=1コミット、完了条件の機械的検証)を本計画にも適用する。
- パフォーマンス改善は**計測とセットで初めて完了**とする。各タスクの完了条件にbefore/after計測を含めた。数値はPR説明に記録すること。

### PF-0: 計測基盤の整備(最初に実施)

1. `package.json` に追加: `"analyze": "vite build && npx vite-bundle-visualizer"`(または `rollup-plugin-visualizer` をdevDependencyに追加して `build.rollupOptions.plugins` に組み込み、`stats.html` を出力)。`stats.html` は `.gitignore` に追加。
2. 計測手順を `docs/performance-plan.md` 末尾(付録A)のとおり固定し、**着手前に一度ベースラインを計測してPRに記録**する:
   - バンドル: `npm run build` の出力サイズ(チャンク別)
   - 初期ロード: Chrome DevTools Lighthouse(モバイル設定)の LCP / TBT
   - タブ切替: DevTools Network タブで flow→tasks→flow と切り替えた際のリクエスト数
   - レンダリング: React DevTools Profiler で「ブロック50件の日で検索バーに1文字入力」したときのcommit時間

---

## 2. 修正案(優先度順)

優先度は「ユーザー体感の改善幅 ÷ 実装コスト」で並べている。

### PF-1: 初期ロードの高速化(バンドル分割) — 優先度: 最高

**内容はリファクタリング計画 P6-1(ルート分割+manualChunks)と P6-2(lucideアイコンマップ化)と同一。** 本計画では重複記載しない。未実施ならこれを最優先で実施すること。

- 期待効果: 初期チャンク 2.1MB → 1MB未満(Analytics分割でrechartsを排除、lucideマップ化で数百KB減)。
- 完了条件: P6-1/P6-2 の完了条件に加え、Lighthouse(モバイル)の LCP がベースライン比で改善していること。

### PF-2: データ取得キャッシュの導入(タブ切替スピナーの根絶) — 優先度: 最高

**前提**: リファクタリング計画 Phase 4(React Query 移行)完了後に実施。Phase 4 を未実施の場合は先にそちらを行う(手書きフェッチ層にキャッシュを自前実装してはならない)。

1. `src/App.tsx` の `QueryClient` にデフォルトオプションを設定:
   ```ts
   const queryClient = new QueryClient({
     defaultOptions: {
       queries: {
         staleTime: 60_000,        // 1分以内の再マウントは再フェッチしない
         gcTime: 10 * 60_000,
         refetchOnWindowFocus: false,
       },
     },
   });
   ```
   - `staleTime` の方針: マスタ系(customTags, aiModels, 設定系)は `5 * 60_000` をクエリ個別に設定。ブロック/エントリ系はデフォルト(60秒)とし、ミューテーション時のinvalidateで即時整合を取る(Phase 4 のinvalidate設計がそのまま効く)。
2. これにより以下が同時に解決することを確認する:
   - **タブ切替の再フェッチ**(Dashboard.tsx 207-258行のTabsContentアンマウント問題): 再マウント時にキャッシュから即時表示され、スピナーが出なくなる。タブ側の変更(forceMount等)は**不要**。アンマウント方式はDOMを軽く保つ利点があるためそのまま維持する。
   - **`useCustomTags` の重複フェッチ**: 全インスタンスが同一 `queryKey` を共有するため、何個マウントしてもリクエストは1本になる。
3. ローディングUIの調整: 各ビューのスピナー表示条件を `isLoading`(初回のみtrue)にする。`isFetching` でスピナーを出すとバックグラウンド再フェッチでもちらつくため使わない。
4. 完了条件: DevTools Network で flow→tasks→memos→flow と切り替えた際、2周目以降に `blocks` / `custom_tags` へのリクエストが発生しない(60秒以内)。タブ切替時にスピナーが表示されない。ブロックの追加・編集・削除が即座に各ビューへ反映される(invalidate確認)。

### PF-3: DBインデックスの追加 — 優先度: 高

**注意**: 新規マイグレーションファイルの**追加**で行う(既存マイグレーションの変更は禁止)。`CREATE INDEX` は追加的・冪等(IF NOT EXISTS)でアプリ挙動を変えないため安全。

1. `supabase/migrations/<timestamp>_add_performance_indexes.sql` を新規作成:
   ```sql
   -- stock系ビューのカテゴリ別クエリ用(useEntries.getBlocksByCategory)
   CREATE INDEX IF NOT EXISTS idx_blocks_user_category_occurred
     ON public.blocks (user_id, category, occurred_at DESC);

   -- タスクビューの未完了フィルタ用
   CREATE INDEX IF NOT EXISTS idx_blocks_user_category_done
     ON public.blocks (user_id, category, is_done);

   -- カスタムタグ取得用(useCustomTags)
   CREATE INDEX IF NOT EXISTS idx_custom_tags_user_sort
     ON public.custom_tags (user_id, sort_order);
   ```
   - 実装時の確認事項: 上記カラム名(`category`, `is_done`, `sort_order`)が実際のスキーマと一致するか `src/integrations/supabase/types.ts` で確認すること。`getBlocksByCategory` がタグでもフィルタしている場合は `tag` カラムを含めるかをクエリ実態に合わせて判断。
2. 適用は人間が `supabase db push`(またはダッシュボード)で行う。エージェントはSQLファイル作成まで。
3. 完了条件: マイグレーションファイルがリポジトリに追加されている。PR説明に「適用後、Supabaseダッシュボードの Query Performance で対象クエリのインデックス使用を確認すること」と記載。

### PF-4: 転送量削減(`select('*')` の列指定化) — 優先度: 高

1. `src/hooks/useEntries.ts` の `getEntries()`(619行付近)を最優先で修正: エントリ一覧表示に必要な列のみ指定する。
   ```ts
   .select('id, user_id, date, created_at, updated_at, summary')
   ```
   - **手順**: まず呼び出し側(JournalView 等)が実際に参照しているプロパティを洗い出し、その和集合を列指定にする。`formatted_content` を一覧で参照している場合は、参照箇所を「詳細表示時に `getEntry(id)` で個別取得」に変える(この変更だけ挙動に関わるため、表示が変わらないことを実機確認)。
2. 残りの `select('*')` 7箇所(useEntries.ts 163/192/223/638行付近、useCustomTags.ts 100行付近、useAIFeatureSettings.ts 94行付近)も同様に、呼び出し側が使う列のみに変更。判断に迷う場合(列が10個以上必要等)は `*` のまま残してよい — 効果が大きいのは大型テキスト列(`formatted_content`, `extracted_text`)を持つテーブルのみ。
3. **型の整合**: 列を絞ると返り値型が `Tables<'entries'>` の部分型になる。Phase 2(strict化)済みの場合、`Pick<Entry, ...>` 型を定義して呼び出し側まで一貫させること。
4. 完了条件: tsc/build パス。DevTools Network でエントリ一覧取得のレスポンスサイズがベースライン比で減少(`formatted_content` を持つユーザーで顕著)。一覧・詳細表示が従前どおり。

### PF-5: レンダリング最適化(flow画面のもたつき解消) — 優先度: 高

対象: `src/components/flow/BlockList.tsx`、`src/contexts/DayBoundaryContext.tsx`、`src/components/stock/TasksView.tsx`

1. **DayBoundaryContext の value をメモ化**(DayBoundaryContext.tsx 90行付近):
   ```tsx
   const value = useMemo(
     () => ({ dayBoundaryHour, loading, setDayBoundaryHour, saveDayBoundaryHour }),
     [dayBoundaryHour, loading, setDayBoundaryHour, saveDayBoundaryHour]
   );
   return <DayBoundaryContext.Provider value={value}>{children}</DayBoundaryContext.Provider>;
   ```
   `setDayBoundaryHour` / `saveDayBoundaryHour` が `useCallback` で安定化されていることも確認し、されていなければ安定化する。
2. **ブロック行コンポーネントの抽出とメモ化**(BlockList.tsx 292-450行付近):
   - `blocks.map()` 内の約140行のインラインJSXを `BlockListItem.tsx`(props: `block`, `editable`, `highlightQuery`, 各種ハンドラ)として抽出し、`React.memo` でラップする。
   - **前提条件**: 親から渡すハンドラ(編集・削除・完了トグル・画像クリック等)がすべて `useCallback` で安定していること。ブロックIDを引数で受けるシグネチャ(`onEdit(blockId)`)にして、ブロックごとのクロージャ生成(`() => onEdit(block)`)を `BlockListItem` 内部に移す。
   - これはリファクタリング計画 Phase 5 と同じ領域を触る。**Phase 5 実施予定があるなら P5 の分解作業に本タスクを統合してよい**(その場合は分解時に memo 化まで行う)。
3. **`highlightText()` の最適化**(BlockList.tsx 41-54行付近):
   - RegExpの生成を呼び出しごとに行わない。`useMemo` で `highlightQuery` から `RegExp` を1回だけ生成し、`BlockListItem` にRegExpを渡す。さらに `highlightQuery` が falsy のときは分割処理を完全スキップ(現状もearly returnがあるが、memo化と組み合わせて「query不変ならsplit自体走らない」状態にする)。
4. **TasksView の派生値メモ化**(TasksView.tsx 211-212行付近): `incompleteCount` / `completedCount` を `useMemo(() => ..., [blocks])` 化。1つの `useMemo` で `{ incomplete, completed }` を一度のループで数える。
5. 完了条件: React DevTools Profiler で「ブロック50件表示中に検索クエリを1文字変更」した際、変更に関係しないブロック行が re-render されないこと(Profilerの「Why did this render?」で確認)。commit時間がベースライン比で減少。表示・操作は従前どおり。

### PF-6: stock系ビューの仮想化 — 優先度: 中(条件付き)

**前提**: リファクタリング計画 P5-2(useStockBlocks共通化)完了後に実施すると5ビューに一括適用できる。**ユーザーのブロック数が常時100件未満ならスキップしてよい**(PF-5のmemo化だけで足りる)。

1. devDependencyに `@tanstack/react-virtual` を追加。
2. `useStockBlocks` を使う共通リスト描画部に `useVirtualizer` を導入(スクロールコンテナ基準、`estimateSize` はブロック行の実測高さ中央値、`overscan: 8`)。
   - 注意: ブロック行は可変高(画像・長文)のため `measureElement` による実測モードを使う。
   - dnd-kit を使う flow 画面(BlockList)は並べ替えと仮想化の両立が複雑なため**対象外**とする(flowは1日分のみで件数が限られる)。
3. 完了条件: タスク200件のデータでTasksView初回表示時のDOMノード数が大幅減(Elementsパネルで確認)、スクロールが60fpsを維持(Performanceパネル)。フィルタ・編集・削除・ハイライトジャンプ(`useTargetBlockHighlight` のスクロール先が仮想化で未マウントの場合の挙動に注意 — `scrollToIndex` で対応)が従前どおり。

### PF-7: 画像の最適化 — 優先度: 中

1. **遅延読み込み**(即効・低リスク): 全 `<img>` に `loading="lazy"` と `decoding="async"` を付与する。対象は `grep -rn "<img" src --include="*.tsx"` の全ヒット(BlockList.tsx 341行付近、FormattedView.tsx 49-62行付近、ReadLaterView ほか)。モーダル内の拡大画像(クリックで開くもの)は `loading` 指定不要。
2. **アップロード前のクライアント側圧縮**(`src/hooks/useImageUpload.ts` 15-81行付近):
   - devDependencyではなくdependencyに `browser-image-compression` を追加し、アップロード前に圧縮を挟む:
     ```ts
     import imageCompression from 'browser-image-compression';
     const compressed = await imageCompression(file, {
       maxSizeMB: 1,
       maxWidthOrHeight: 2048,
       useWebWorker: true,
     });
     ```
   - HEIC等、圧縮ライブラリが扱えない形式は圧縮失敗時に元ファイルでフォールバックする(現挙動の維持)。既存の10MB上限チェックは圧縮**後**のサイズに対して適用。
   - 注意: GIF(アニメーション)は圧縮すると静止画化するため、`file.type === 'image/gif'` はスキップして元ファイルをアップロード。
3. **既存画像のサムネイル配信**(任意・要判断): Supabase Storageの画像変換(`getPublicUrl(path, { transform: { width: 400 } })`)は**Proプラン以上の機能**。プランが対応している場合のみ、一覧表示のサムネイルに `transform` を適用し、モーダル拡大時のみ原寸URLを使う。プラン非対応なら本項はスキップ(2の圧縮だけで新規画像は軽くなる)。
4. 完了条件: 画像5枚以上ある日を開いた際、ビューポート外の画像が初期ロードで取得されない(Networkパネル)。新規アップロード画像が概ね1MB以下になる。アップロード→表示→拡大→削除が従前どおり。

### PF-8: レイテンシ削減(API・ブロック追加) — 優先度: 低〜中

1. **`last_used_at` 更新の非同期化**(mcp-server/index.ts 119-122行付近、api/index.ts の同等箇所。Phase 3 実施済みなら `_shared/auth.ts` の1箇所):
   - 認証結果の返却をブロックしないよう、`EdgeRuntime.waitUntil()` を使う:
     ```ts
     EdgeRuntime.waitUntil(
       supabase.from("user_api_tokens")
         .update({ last_used_at: new Date().toISOString() })
         .eq("token_hash", tokenHash)
         .then(() => {})
     );
     ```
   - `EdgeRuntime` が型エラーになる場合は `declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };` を `_shared/` に置く。**認証の成否判定そのもの(token照合)は同期のまま変えないこと。**
2. **`addBlockWithDate` の直列解消**(useEntries.ts 306-332行付近、Phase 4 実施済みなら `useBlocks.ts`):
   - 過去日付への追加時、「最終ブロックの `occurred_at` 取得」と「`getOrCreateEntryForDate`」は互いに依存しないため `Promise.all` で並列化する:
     ```ts
     const [lastBlocks, entry] = await Promise.all([
       fetchLastBlockOccurredAt(dayKey),
       getOrCreateEntryForDate(dayKey),
     ]);
     ```
   - insertは両者の結果に依存するため従来どおり後段で実行。エラーハンドリングは現挙動(どちらかが失敗したら追加失敗)を維持。
3. 完了条件: deno check / tsc / build パス。MCPクライアントおよびAPIトークンでの呼び出しが従前どおり成功し、`last_used_at` も(遅延して)更新されること。過去日付へのブロック追加が従前どおり正しい `occurred_at` で作成されること。

---

## 3. 実装順序の推奨

```
PF-0 計測ベースライン
  │
  ├─ PF-1 バンドル分割(=リファクタリング計画 P6-1/P6-2)   ← 独立・最優先
  ├─ PF-3 DBインデックス                                     ← 独立・即効
  ├─ PF-7-1 loading="lazy"                                   ← 独立・5分で終わる
  │
  ├─ (リファクタリング計画 Phase 4 完了後)
  │    └─ PF-2 React Query キャッシュ設定
  │
  ├─ PF-4 select列指定 / PF-5 レンダリング最適化 / PF-7-2 画像圧縮 / PF-8 レイテンシ
  │
  └─ (リファクタリング計画 P5-2 完了後・必要なら)
       └─ PF-6 仮想化
```

クイックウィン(半日以内・独立実施可能): **PF-3 + PF-7-1 + PF-8**。
体感改善が最大のもの: **PF-1(初回ロード)と PF-2(タブ切替)**。

## 付録A: 計測手順(before/after共通)

1. `npm run build` → チャンク別サイズを記録
2. `npm run preview` → Chrome シークレットウィンドウで Lighthouse(Mobile / Navigation)→ LCP, TBT, Speed Index を記録
3. ログイン済み状態で DevTools Network(Disable cache ON)→ flow→tasks→memos→flow とタブ切替 → リクエスト数と転送量を記録
4. React DevTools Profiler → ブロック50件の日で検索バーに1文字入力 → commit時間と再レンダーされたコンポーネント数を記録
5. 画像5枚以上の日を開く → Networkで画像リクエスト数と合計サイズを記録

## 付録B: スコープ外

- サーバー(Supabase)プラン変更を前提とする施策(画像変換CDNはプラン確認の上で任意)
- Service Worker / オフラインキャッシュ(効果はあるが複雑性が高く、まずは上記で十分)
- DBスキーマ変更(インデックス追加を除く)・既存マイグレーションの変更
