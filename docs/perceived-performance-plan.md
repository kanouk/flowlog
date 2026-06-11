# FlowLog 体感速度(Perceived Performance)改善計画書

作成日: 2026-06-11
対象リビジョン: `1e0e296` 時点のコードベース
姉妹文書: `docs/refactoring-plan.md`(リファクタリング計画)、`docs/performance-plan.md`(実測パフォーマンス計画)

実測パフォーマンス計画(PF-*)が「実際に速くする」施策なのに対し、本計画(PX-*)は「**待ち時間を感じさせない**」施策である。両者は補完関係にあり、特にPF-2(React Queryキャッシュ)は本計画の多くのタスクの土台になる。

---

## 0. 設計原則(全タスク共通の判断基準)

実装エージェントは個々のタスクで迷ったら以下に従うこと。

1. **応答時間の体感基準**:
   - 〜100ms: 「即時」。インジケーター不要(出すと逆にうるさい)
   - 100〜300ms: インジケーター不要だが、操作のエコー(押した感)は必要
   - 300ms〜1s: スケルトン表示。**スピナーの全面表示は禁止**
   - 1s〜: 進行状況の説明(「要約を生成中…」等)+可能ならキャンセル手段
2. **インジケーターの遅延表示**: 150ms未満で終わる処理にローディングUIを出すと「一瞬チラつく」ほうが遅く感じる。ローディングUIは**表示自体を150ms遅延**させる(CSSの `animation-delay` か、後述の `useDelayedFlag`)。
3. **古いデータ > 空白**: 再フェッチ中は古いデータを出し続ける(stale-while-revalidate)。データを消してスピナーに置き換えることを全面的に禁止する。
4. **楽観的更新の原則**: ユーザー操作の結果は即座にUIへ反映し、サーバー処理は背景で行う。失敗時はロールバック+エラートースト。この方式は**既にブロック追加で実装済み**(FlowView.tsx 243行・293行付近の `temp-` ID方式)であり、本計画はそれを全操作に広げるもの。
5. **レイアウトシフト(CLS)禁止**: 後から読み込まれる要素(画像、遅延データ)は必ず確保済みの枠(aspect-ratio / min-height)の中に現れること。「速く見せる」ためにガタつかせては本末転倒。

---

## 1. 現状診断(検証済みの事実)

| # | 現状 | 体感への影響 |
|---|------|-------------|
| 1 | `FlowView.loadData()`(62-73行)が日付変更のたびに `setLoading(true)` → 474-478行で**画面全体をスピナーに置換** | 前日/翌日へ移動するたびに画面が白紙化し「重いアプリ」と感じる |
| 2 | 同 `loadData()` 内で `getEntry()` → `getBlocksByDate()` を**直列await**(ウォーターフォール) | 日付表示の待ち時間が2往復分になっている |
| 3 | タブ切替で各ビューが再マウント・再フェッチ(PF-2で対策予定)。キャッシュも永続化もなし | タブ切替・アプリ再訪のたびにスピナー |
| 4 | スケルトンUIは `SearchResults.tsx`(122-126行)のみ。他は全て `Loader2` スピナー | 待ち時間の体感が長い(スケルトンは内容を予告するため待てる) |
| 5 | ブロック追加は楽観的更新済み(`temp-` ID)だが、**タスク完了トグル・削除・編集保存は実装がビューごとにバラバラ**で、サーバー応答待ちのものがある | チェックを押してから反映までワンテンポ遅れる箇所がある |
| 6 | URL要約・OCRは Edge Function 完了後にブロックが更新されるまで、**処理中であることが画面上ほぼ分からない**(FlowViewのformattingは523-525行の小スピナーのみ) | 「押したのに何も起きない」と感じ、二度押しの原因になる |
| 7 | アプリ起動時は `AppSplash`(Index.tsx 20行、Dashboard.tsx 146行)がauth解決まで全面表示。データキャッシュの永続化がないため、起動のたびに全データを取り直す | 毎回の起動が「初回起動」と同じ重さ |
| 8 | プリフェッチなし(タブ・隣接日付・lazyチャンクいずれも) | 全ての遷移が「クリックしてから取りに行く」 |

---

## 2. 修正案(優先度順)

### PX-1: 日付ナビゲーションの白紙化解消 — 優先度: 最高・即効

対象: `src/components/flow/FlowView.tsx`(62-73行、474-478行)

**Phase 4(React Query移行)前でも実施できる暫定版**と、移行後の本実装を示す。

1. **暫定版(現行の手書きフェッチのまま)**:
   - `loadData()` の `setLoading(true)` を「初回マウント時のみ」にする。`const isFirstLoad = blocks.length === 0 && !hasLoadedOnce` のようなフラグで、日付変更時は古いブロックを表示したままフェッチし、完了時に差し替える。
   - フェッチ中であることは、画面置換ではなく**日付ヘッダー横の小さなインジケーター**(既存の formatting 表示と同じ流儀)で示す。
   - `getEntry()` と `getBlocksByDate()` を `Promise.all` で並列化(PF-8と同種の修正。両者に依存関係がないことを確認済み)。
2. **本実装(Phase 4 完了後)**: `useQuery` の `placeholderData: keepPreviousData` を日付別ブロッククエリに設定するだけで同じ挙動になる。暫定版のフラグ類は削除する。
3. 切替中の旧データには `opacity-60 transition-opacity` 程度の控えめな表現を適用してよい(ガタつき・点滅は禁止)。
4. 完了条件: 前日/翌日ボタン連打時に一度もスピナー全面表示にならず、リストが古い内容→新しい内容へ直接切り替わる。初回表示のみPX-3のスケルトンが出る。

### PX-2: キャッシュの永続化(起動を「再開」にする) — 優先度: 高

**前提**: Phase 4 + PF-2 完了後。

1. dependenciesに `@tanstack/react-query-persist-client` と `@tanstack/query-sync-storage-persister` を追加。
2. `src/App.tsx` で `PersistQueryClientProvider` に差し替え:
   ```tsx
   const persister = createSyncStoragePersister({ storage: window.localStorage });
   <PersistQueryClientProvider
     client={queryClient}
     persistOptions={{
       persister,
       maxAge: 24 * 60 * 60 * 1000,
       dehydrateOptions: {
         // 大物・機微なものは永続化しない
         shouldDehydrateQuery: (q) =>
           q.state.status === "success" &&
           !["aiApiKeys", "apiTokens"].includes(String(q.queryKey[0])),
       },
     }}
   >
   ```
   - **必須**: `aiApiKeys` / `apiTokens` などの機微クエリを `shouldDehydrateQuery` で除外する(localStorageに平文で残さない)。
   - **必須**: サインアウト処理(`useAuth` の `signOut`)で `queryClient.clear()` を呼び、persisterのキーも削除する(共用端末でのユーザー切替時に前ユーザーのデータが見えてはならない)。queryKeyに userId が含まれている(P4-1設計)ことが二重の防御になる。
3. localStorageの容量(5MB)を超えないよう、永続化対象は「当日±数日のブロック」「customTags」「entries一覧」程度に留める。容量超過時にpersisterが例外を投げないことを確認(`@tanstack` のpersisterはtry-catch内蔵だが、念のためエラー時に全消去するハンドラを設定)。
4. 完了条件: アプリをリロードした際、ネットワーク応答前に前回のフロー画面の内容が表示され、背景で再検証されること(DevToolsでThrottling: Slow 3Gにして確認)。サインアウト→別ユーザーでサインインした際に前ユーザーのデータが一瞬も表示されないこと。

### PX-3: スピナー全廃とスケルトンUIへの統一 — 優先度: 高

1. `src/components/common/` に以下を新設:
   - `BlockListSkeleton.tsx`: 実際のブロック行のレイアウト(タグチップ+本文2行+余白)を模した `Skeleton` の3〜5行繰り返し。既存の `SearchResults.tsx` 122-126行のパターンを流用。
   - `useDelayedFlag.ts`(フック): `useDelayedFlag(isLoading, 150)` — trueになってから150ms経過後に初めてtrueを返す(チラつき防止。原則2)。
2. 全面 `Loader2` スピナーを使っている箇所を置換する。対象の探し方: `grep -rn "Loader2" src --include="*.tsx"` のうち「コンテンツ領域全体を置き換えているもの」(FlowView 474-478行、各stock系ビューの同等箇所)。**ボタン内の小スピナー(送信中表示など)は対象外**(あれは操作のエコーとして正しい)。
3. 表示条件は「初回ロードのみ」(React Query なら `isLoading`、暫定実装なら PX-1 のフラグ)。再検証中にスケルトンへ戻してはならない(原則3)。
4. 完了条件: アプリ内でコンテンツ領域の全面スピナーが1箇所もない。キャッシュが温まった状態の遷移ではスケルトンすら表示されない(150ms遅延が効いている)。

### PX-4: 楽観的更新の全面展開 — 優先度: 高

既存の `temp-` ID方式(ブロック追加)を基準に、残りの操作を即時反映にする。Phase 4 完了後は React Query の `onMutate` / `onError` ロールバックパターン(公式ドキュメントの optimistic updates)で統一実装すること。

1. **タスク完了トグル**(TasksView / BlockList のチェックボックス): タップ即時に `is_done` を反転表示し、背景で `updateBlock`。失敗時は反転を戻してエラートースト。チェック直後の並び替え(完了タスクが下へ移動)は**300ms程度ディレイ**させる(即座に行が飛ぶと誤タップに見えるため。`setTimeout` ではなくCSS transitionまたは並び替え遅延フラグで)。
2. **削除**: 確認ダイアログ承認後、行を即座に消す+sonnerの `toast('ブロックを削除しました', { action: { label: '元に戻す', onClick: restore } })` で**5秒間のUndo**を提供する。実装方式: 即時にUIから除去し、Undoされなければトースト消滅時に実際のdelete APIを発行する(「遅延実行+取り消し」方式。失敗リスクが最小)。Undoクリック時はUIへ復元するだけでよい。
   - **注記**: Undoは厳密には新規UXだが、楽観的削除の失敗時補償として導入する。不要ならトーストなし即時削除+失敗時復元でもよい(実装者はコミットメッセージにどちらを採ったか明記)。
3. **編集保存**(BlockEditModal): 保存ボタンでモーダルを**即座に閉じ**、リスト上の該当ブロックを編集後の内容で即時表示。背景の `updateBlock` 失敗時は元の内容に戻してエラートースト。現在の「保存完了までモーダルが開いたまま」の挙動を廃止する。
4. **タグ・優先度の変更**(ドロップダウン類): 選択即時反映+背景保存。同上。
5. 完了条件: DevToolsでThrottling: Slow 3Gにした状態で、トグル・削除・編集保存・タグ変更のすべてが**体感0msで反映**されること。オフライン(Network: Offline)で操作した場合にロールバック+エラートーストが正しく動くこと。

### PX-5: プリフェッチ(クリック前に取りに行く) — 優先度: 中

**前提**: Phase 4 + PF-2 完了後(prefetchはReact Queryのキャッシュに書き込むため)。

1. **タブのプリフェッチ**: Dashboard のタブトリガー(TabsTrigger、192行付近)に `onPointerEnter` / `onTouchStart` ハンドラを追加し、対応するカテゴリの `queryClient.prefetchQuery(queryKeys.blocksByCategory(...))` を発火。`staleTime` 内なら何度hoverしても再取得されない(PF-2が前提の理由)。
2. **隣接日付のプリフェッチ**: FlowView で当日データの表示完了後、`requestIdleCallback`(未対応環境は `setTimeout(fn, 1500)` フォールバック)で前日・翌日の `blocksByDate` をprefetch。日付ナビの主要動線(前日へ戻る)が即時表示になる。
3. **lazyチャンクのプリロード**(P6-1のルート分割後): Settings / Analytics へのナビゲーションリンクに `onPointerEnter={() => import("@/pages/Settings")}` を追加(dynamic importは2回目以降no-op)。
4. プリフェッチは**通信の先食い**なので節度を守る: hover起点とidle起点のみ。マウント時に全タブ分を一括prefetchするような実装は禁止(初期ロードを逆に遅くする)。
5. 完了条件: タブにhoverしてから300ms後にクリックした場合、コンテンツが即時表示される(Networkパネルでhover時点のリクエスト発火を確認)。初期ロードのリクエスト数が増えていないこと。

### PX-6: 二段階読み込み(見える部分を先に、重いものは後で) — 優先度: 中

ユーザー要望の「目に見える表示のみ先に返して、後でいいものはあとで読みに行く」の直接の実装。FlowLogで実際に効くのは以下の3点(ブロック本文は軽いので、ブロックリスト自体の分割クエリは**やらない** — 複雑さに見合わない)。

1. **エントリ一覧の軽量化**(PF-4と同一タスク): 一覧は `summary` までの軽量列のみ取得し、`formatted_content`(AI整形全文)は詳細を開いた時に `getEntry(id)` で取得。一覧→詳細の間は本文領域にスケルトンを表示。
2. **画像の枠先行+遅延実体化**:
   - PF-7-1の `loading="lazy"` に加え、`<img>` を `aspect-square` 等の**確保済み枠**でラップ(既にBlockList 341行付近は `aspect-square` クラスあり — 全画像表示箇所で同様にすることを確認)。
   - 読み込み完了までは枠を `bg-muted animate-pulse` にし、`onLoad` で `opacity` フェードイン(100〜150ms)。専用の `<LazyImage>` コンポーネントを `src/components/common/` に作って全箇所で使う。
3. **折りたたみコンテンツの遅延レンダリング**: ReadLater の `extracted_text` や長文ブロックなど「展開しないと見えない」要素は、展開操作まで**レンダリング自体を行わない**(`{expanded && <ExtractedText/>}`)。現状の実装が常時レンダリングになっていないか各ビューで確認し、なっていれば修正。
4. 完了条件: 一覧表示時に `formatted_content` がネットワークに乗らない(PF-4と共通)。画像の多い日でCLS(Lighthouse)が悪化しない(枠確保の確認)。スクロールで画像がフェードインする。

### PX-7: 長時間AI処理の「進行中」可視化 — 優先度: 中

URL要約・OCR・AI整形はEdge Function+外部AI呼び出しで数秒〜数十秒かかる。速くはできないが「動いている」ことを見せる。

1. **URL要約**: readlaterブロック作成直後、要約対象ブロックのカード内に「要約を生成中…」のプレースホルダー行(小スピナー+テキスト)を表示し、`summarizeUrl` 完了時に実データへ差し替える。実装: クライアント側で `summarizingBlockIds: Set<string>` 状態(Phase 4後は mutation の `variables` で表現可能)を持ち、`BlockListItem` がそれを参照。
2. **OCR**(BlockEditModal内): 実行ボタン押下→ボタンを「抽出中…」表示にし、結果テキストエリアにスケルトン。**モーダル全体やボタン以外の操作はブロックしない。**
3. **AI整形(formatEntry)**: 現在の小スピナー(FlowView 523-525行)に「日記を生成中…」のラベルを添える。完了時に FormattedView へ反映される流れは現状維持。
4. **二度押し防止**: 上記3操作とも、進行中は該当操作のトリガーのみdisabled(画面全体はdisabledにしない)。
5. 完了条件: Slow 3G + 各AI操作で、操作直後100ms以内に「進行中」表示が出ること。進行中も他のブロック操作ができること。

### PX-8: 入力と検索の即時反応 — 優先度: 低〜中

1. **検索のタイプ追従**(PF-5と連動): `SearchBar` の入力値に `useDeferredValue` を適用し、入力欄への文字反映(優先)と結果リスト/ハイライト更新(遅延可)を分離する。Supabaseへの検索クエリ自体は既存のdebounceがあるか確認し、なければ300msのdebounceを入れる。
2. **タブ切替に `startTransition`**: Dashboard の `setActiveTab`(181行)を `startTransition(() => setActiveTab(v))` でラップし、タブのアクティブ表示(即時)とコンテンツ描画(遅延可)を分離。PX-5のprefetchと組み合わせると切替が完全に同期的に見える。
3. **FlowInput送信**: 既存のtemp-ブロック方式で即時反映されていることを確認し、**送信時に入力欄を即クリア**していなければそうする(送信失敗時は内容を入力欄へ復元+エラートースト。下書き保存(P5-3のuseDraftPersistence)があるため復元は容易)。
4. 完了条件: 検索欄への高速タイプで入力文字の表示が遅延しない(Profilerで確認)。送信ボタン押下から入力欄クリアまで体感0ms。

### PX-9: 起動スプラッシュの最小化 — 優先度: 低

1. `src/hooks/useAuth.ts` を確認: セッション復元が `supabase.auth.getSession()`(localStorage読みで同期的に近い)で済んでいるか、`onAuthStateChange` の初回イベント待ちになっているかを調査。後者なら `getSession()` を先に呼んで `loading` を最短で解除する(Supabase公式推奨パターン: `getSession()` で初期化+`onAuthStateChange` で追従)。
2. PX-2(キャッシュ永続化)と組み合わせ、「セッションあり」が確定した瞬間にキャッシュ済みデータでダッシュボードを描画する。AppSplashの表示時間は「localStorage読みの数十ms」だけになるのが理想。
3. AppSplash自体にも `useDelayedFlag`(150ms)を適用し、高速起動時はスプラッシュ自体を出さない。
4. 完了条件: 2回目以降の起動(キャッシュあり)で、AppSplashが視認できない速さでダッシュボードが表示される。

---

## 3. 実装順序の推奨

```
PX-1 日付ナビ白紙化解消(暫定版)+ PX-3 スケルトン統一   ← Phase 4 前でも着手可・体感改善が最大
  │
  ├─ (Phase 4 + PF-2 完了後)
  │    ├─ PX-1 本実装(keepPreviousData)
  │    ├─ PX-2 キャッシュ永続化
  │    ├─ PX-4 楽観的更新の全面展開(onMutateパターン)
  │    └─ PX-5 プリフェッチ
  │
  ├─ PX-6 二段階読み込み(PF-4/PF-7と同時実施が効率的)
  ├─ PX-7 AI処理の進行中可視化                              ← 独立・いつでも可
  └─ PX-8 入力即時反応 / PX-9 起動最小化                    ← 仕上げ
```

**最小コストで最大の体感差**: PX-1暫定版 + PX-3 + PX-7 はリファクタリングを待たずに実施でき、「日付切替の白紙化」「全面スピナー」「AI処理の無反応」という3大ストレスを先に消せる。

## 4. 検証方法(全タスク共通)

体感施策は数値計測が難しいため、以下の**操作シナリオをSlow 3Gスロットリングで実施した画面録画**をbefore/afterでPRに添付する:

1. アプリ起動 → ダッシュボード表示まで
2. 前日へ3回連続移動 → 翌日へ3回連続移動
3. タブを flow→tasks→memos→flow と一巡
4. タスクのチェック → ブロック削除 → 編集保存
5. URLを含むreadlaterブロック作成 → 要約反映まで
6. 検索バーに10文字を高速タイプ

加えて Lighthouse の CLS がベースラインから悪化していないことを確認する(PX-6の枠確保の検証)。

## 付録: スコープ外

- Service Worker / オフライン完全対応(PX-2のキャッシュ永続化で「再訪が速い」までは達成できる。完全オフラインは別プロジェクト規模)
- View Transitions API などの演出強化(まず待ち時間の構造を直すのが先)
- サーバープッシュ/リアルタイム購読(Supabase Realtime)による多端末同期
