# FlowLog 完全リファクタリング計画書

作成日: 2026-06-10
対象リビジョン: `4a9acd4` 時点のコードベース(src 配下 + supabase/functions 配下、計約26,000行)

この文書は、Codex / Cursor などのAIコーディングエージェントがそのまま実装に着手できる粒度で書かれた実装指示書である。各フェーズは独立したPR(または独立したコミット群)として実装し、**フェーズをまたいで一度に実装しないこと**。

---

## 0. 現状診断サマリ(検証済みの事実)

以下はすべて実際にコードベースを検査して確認した事実である。

| # | 問題 | 詳細 |
|---|------|------|
| 1 | 未使用UIコンポーネント | `src/components/ui/` 配下48ファイル中、**26ファイルがアプリコードから一度もimportされていない**(Lovableが生成したshadcn全部入りの残骸) |
| 2 | トースト実装の二重化 | radix-toast系(`ui/toast.tsx`+`ui/toaster.tsx`+`hooks/use-toast.ts`)とsonner系が**両方** `App.tsx` にマウントされている。sonnerが主流で、radix系の利用は3ファイルのみ |
| 3 | 未使用フック | `src/hooks/useSwipeGesture.ts`、`src/hooks/useTabSwipe.ts` はどこからもimportされていない |
| 4 | 未使用npm依存 | `@hookform/resolvers` ほか、未使用UIコンポーネント削除後に7個以上が削除可能になる |
| 5 | TypeScript設定が緩い | `strictNullChecks: false`、`noImplicitAny: false`、`noUnusedLocals: false`。tsconfigとESLint双方で未使用変数検出が無効化されている |
| 6 | ESLintエラー63件 | `npm run lint` で63 errors / 14 warnings(主に `no-explicit-any`、`prefer-const`) |
| 7 | Edge Functions間の大規模重複 | 全10関数がCORSヘッダーを個別定義(3バリエーション)。`authenticateUser()` が `mcp-server` と `api` に完全重複(33行×2)。`callOpenAI/callAnthropic/callGoogle` が `format-entries` と `summarize-url` に重複。`FeatureAIConfig` 型が3ファイルに重複定義。`_shared/` ディレクトリが存在しない |
| 8 | フロントエンドの重複 | `BlockEditModal.tsx` 内に `src/lib/entryFormUtils.ts` の `buildScheduleDateTime()`/`formatScheduleDateDisplay()` 相当のヘルパーが再実装されている。stock系ビュー(Tasks/Memos/ReadLater)に `kebabToPascal()`/`getIconComponent()` が3回コピペされている |
| 9 | React Query未活用 | `@tanstack/react-query` 導入済み・`QueryClientProvider` マウント済みだが、実際に使っているのは `useAnalytics.ts` のみ。他の全フック(useEntries, useCustomTags, useAIApiKeys, useApiTokens, useAIModels, useAIFeatureSettings, useImageStorageSettings)は手書きの useState+useEffect+toast パターンで合計300行以上のボイラープレート |
| 10 | 神コンポーネント | `FlowInput.tsx`(1,070行・useState 15個以上)、`BlockEditModal.tsx`(976行)、`useEntries.ts`(703行・CRUD+整形+URL要約が混在) |
| 11 | バンドル肥大 | プロダクションビルドが**単一チャンク2.1MB(gzip 523KB)**。ルート分割なし。`TasksView.tsx` 等の `import { icons } from 'lucide-react'` が全アイコン(1,500個以上)をバンドルに含めている |
| 12 | テストほぼゼロ | テストは `supabase/functions/format-entries/score-parser.test.ts` の1ファイルのみ。フロントエンドのテスト基盤(Vitest等)が存在しない |
| 13 | Lovable残骸 | `README.md` に `REPLACE_WITH_PROJECT_ID` プレースホルダー、`index.html` にlovable.devのOG画像、`vite.config.ts` に `lovable-tagger` |
| 14 | `.env` がgit管理下 | 内容はSupabaseのanonキー(公開前提の値)のみだが、`.gitignore` に入っておらず運用として危険 |
| 15 | `*.tsbuildinfo` が `.gitignore` に無い | `tsc -b` 実行で未追跡ファイルが発生する |

---

## 1. 全フェーズ共通ルール(実装エージェントへの指示)

1. **挙動を変えないこと。** このリファクタリングは全フェーズを通じて外部から観測可能な挙動(UI、API レスポンス、DB書き込み内容)を一切変更しない。「ついでの改善」は禁止。
2. **各タスクの完了条件を必ず実行して確認すること。** 最低限、以下が全タスク共通の完了条件:
   ```bash
   npx tsc -b --force   # エラー0(終了コード0)
   npm run build        # ビルド成功
   npm run lint         # フェーズ2以降はエラー0。フェーズ0-1ではエラー数が増えていないこと
   ```
3. **1タスク=1コミット**を原則とし、コミットメッセージにタスクID(例: `P1-3`)を含める。
4. 削除系タスクでは、削除前に必ず `grep -rn "<シンボル名>" src supabase --include="*.ts" --include="*.tsx"` で参照ゼロを再確認する。本書のファイル一覧は2026-06-10時点のものであり、**実装時点で再検証すること**。
5. 行番号は「目安」である。実装時はシンボル名で検索して特定すること。
6. Edge Functions(Deno)を変更した場合、ローカルで `deno check supabase/functions/<name>/index.ts` で型チェックする(Denoが無い環境ではスキップ可。その場合はレビューで指摘)。デプロイは人間が `supabase functions deploy` で行うため、エージェントは行わない。
7. **`supabase/migrations/` 配下のSQLファイルは一切変更・削除しないこと。**

### フェーズ一覧と依存関係

| フェーズ | 内容 | 規模目安 | 依存 |
|---------|------|---------|------|
| Phase 0 | 安全網の構築(テスト基盤+特性テスト) | 小 | なし |
| Phase 1 | デッドコード・未使用依存・Lovable残骸の削除 | 中 | なし(Phase 0 推奨) |
| Phase 2 | 型・Lintの健全化(strict化) | 中 | Phase 1 |
| Phase 3 | Edge Functions の共通化(`_shared/`) | 中 | Phase 0 |
| Phase 4 | フロントエンドのデータ層刷新(React Query 移行 + useEntries 分割) | 大 | Phase 0, 2 |
| Phase 5 | 神コンポーネントの分解 + stock ビュー共通化 | 大 | Phase 4 |
| Phase 6 | パフォーマンス(コード分割・lucide対策)と仕上げ | 中 | Phase 1 |

Phase 1〜3 は互いに独立しており並行実装可能。Phase 4→5 は順序厳守。

---

## Phase 0: 安全網の構築

**目的**: 以降のフェーズで挙動が壊れていないことを機械的に検証できる状態を作る。リファクタリング対象のロジック(特に日付処理とパース処理)は仕様書が無いため、**現在の挙動こそが仕様**として特性テスト(characterization test)で固定する。

### P0-1: Vitest の導入

1. devDependencies に追加: `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`
2. `vite.config.ts` に test 設定を追加:
   ```ts
   /// <reference types="vitest" />
   // defineConfig 内に追加
   test: {
     environment: "jsdom",
     globals: true,
     include: ["src/**/*.test.{ts,tsx}"],
   },
   ```
3. `package.json` に script 追加: `"test": "vitest run"`, `"test:watch": "vitest"`
4. 完了条件: ダミーテスト1件が `npm run test` でパスする。

### P0-2: `src/lib/` の特性テスト作成

対象(優先順): `dateUtils.ts`(242行)、`entryFormUtils.ts`、`diaryParser.ts`、`taskPriority.ts`、`categoryUtils.ts`、`feedbackUtils.ts`

各ファイルの **export されている全関数** について、現在の入出力をそのまま固定するテストを書く。

- 「正しいはずの挙動」ではなく「**現在の実際の挙動**」をテストにすること。テスト作成中に挙動がバグに見えても修正せず、`// NOTE: 現状の挙動を固定。要確認` とコメントを付けてそのまま固定する。
- 日付系関数はタイムゾーン依存があるため、`vitest` 実行時に `TZ=Asia/Tokyo` を固定する(`package.json` の test script を `"test": "TZ=Asia/Tokyo vitest run"` にする)。
- 境界値を必ず含める: 日境界(day boundary)設定をまたぐ時刻、月末、`undefined`/`null`/空文字入力。

完了条件: 上記6ファイルの全export関数に最低1ケース、日付系・パース系関数には境界値含め3ケース以上。`npm run test` パス。

### P0-3: Edge Functions のpure logic特性テスト

`supabase/functions/format-entries/score-parser.test.ts` が既にあるので、同じスタイル(Deno test)で以下を追加:

- `mcp-server/index.ts` と `api/index.ts` の `getTodayDate()` 相当、およびブロックフィルタリングのpureな部分(関数として切り出せない場合はPhase 3で切り出した後にテストを書くこと、とTODOコメントを残すだけでよい)
- 完了条件: `deno test supabase/functions/` がパス(Deno利用可能な場合)。

---

## Phase 1: デッドコード・未使用依存・残骸の削除

**目的**: 削除のみで挙動が変わらない「確実な無駄」を消し、以降のフェーズの作業面積を減らす。このフェーズではロジックの書き換えを行わない(P1-2のトースト移行のみ例外)。

### P1-1: 未使用 shadcn UI コンポーネントの削除

**手順**:

1. まず以下の検証スクリプトを実行し、削除候補の現時点での被参照数を確認する:
   ```bash
   for f in src/components/ui/*.tsx src/components/ui/*.ts; do
     name=$(basename "$f"); base="${name%.*}"
     count=$(grep -rl "components/ui/${base}[\"']" src --include="*.tsx" --include="*.ts" | grep -v "components/ui/" | wc -l)
     internal=$(grep -rl "components/ui/${base}[\"']" src/components/ui --include="*.tsx" --include="*.ts" | grep -v "/${name}$" | wc -l)
     echo "external=$count internal=$internal $name"
   done | sort
   ```
2. `external=0` かつ `internal=0`、または `internal` の参照元自体が削除対象のものを削除する。2026-06-10時点の削除対象(26ファイル):

   `accordion.tsx`, `alert.tsx`, `aspect-ratio.tsx`, `avatar.tsx`, `badge.tsx`, `breadcrumb.tsx`, `carousel.tsx`, `chart.tsx`, `command.tsx`, `context-menu.tsx`, `drawer.tsx`, `form.tsx`, `hover-card.tsx`, `input-otp.tsx`, `menubar.tsx`, `navigation-menu.tsx`, `pagination.tsx`, `progress.tsx`, `radio-group.tsx`, `resizable.tsx`, `separator.tsx`, `sidebar.tsx`, `table.tsx`, `toggle-group.tsx`, `toggle.tsx`, `use-toast.ts`

   注意(連鎖関係、検証済み):
   - `sidebar.tsx`(未使用)が `separator`/`sheet`/`skeleton`/`tooltip` を内部参照している。`sidebar` 削除により `separator` も削除可能になる。**`sheet`/`skeleton`/`tooltip` はアプリコードからも使われているため削除しない。**
   - `toggle.tsx` の唯一の参照元は `toggle-group.tsx`(共に未使用)。両方削除。
   - `ui/use-toast.ts` は `hooks/use-toast.ts` の再エクスポート。P1-2 とセットで削除。
3. 削除後、`npm run build` を実行して import エラーが無いことを確認。
4. **shadcnの将来の再追加は `npx shadcn@latest add <name>` でいつでも可能**なので遠慮なく消してよい。

完了条件: `npx tsc -b --force` && `npm run build` 成功。`src/components/ui/` のファイル数が48→22前後になっている。

### P1-2: トースト実装の sonner への一本化

**現状**: `App.tsx` で radix系 `<Toaster />`(1行目)と sonner系 `<Sonner />`(2行目)が両方マウントされている。radix系を使っているのは以下の3ファイルのみ:

- `src/components/settings/RaindropIntegrationSection.tsx`: `import { toast } from '@/hooks/use-toast'`
- `src/hooks/useApiTokens.ts`: `import { useToast } from '@/hooks/use-toast'`
- `src/hooks/useExternalSync.ts`: `import { toast } from '@/hooks/use-toast'`

**手順**:

1. 上記3ファイルを sonner 流儀に書き換える:
   - `import { toast } from 'sonner'` に変更。
   - radix流の `toast({ title, description, variant: 'destructive' })` を sonner流の `toast.error(title, { description })` / `toast.success(title, { description })` / `toast(title, { description })` に変換する。`variant: 'destructive'` → `toast.error`、それ以外 → `toast.success` または `toast`(文脈で判断。成功通知なら success)。
   - `useToast()` フック経由の場合はフック呼び出しを削除してモジュールレベルの `toast` を直接使う。
2. `App.tsx` から `import { Toaster } from "@/components/ui/toaster"` と `<Toaster />` を削除。
3. `src/components/ui/toast.tsx`、`src/components/ui/toaster.tsx`、`src/components/ui/use-toast.ts`、`src/hooks/use-toast.ts` を削除。
4. `package.json` から `@radix-ui/react-toast` を削除。

完了条件: `grep -rn "use-toast\|@radix-ui/react-toast" src package.json` がヒット0。ビルド成功。実機確認項目: Raindrop連携セクション・APIトークン管理・外部同期でエラー/成功トーストが表示されること。

### P1-3: 未使用フックの削除

`src/hooks/useSwipeGesture.ts` と `src/hooks/useTabSwipe.ts` を削除(参照ゼロ検証済み。削除前に共通ルール4で再検証)。

### P1-4: 未使用 npm 依存の削除

P1-1/P1-2 完了後に、dependencies の各パッケージについて `grep -rn "from [\"']<pkg>" src` で参照を確認し、ヒット0のものを `npm uninstall` する。2026-06-10時点の削除見込み:

- `@hookform/resolvers`(現時点で既に未使用)
- `react-hook-form`, `cmdk`, `embla-carousel-react`, `vaul`, `input-otp`, `react-resizable-panels`(P1-1の form/command/carousel/drawer/input-otp/resizable 削除により未使用化)
- `@radix-ui/react-*` のうち P1-1 で削除したコンポーネントだけが使っていたもの(accordion, aspect-ratio, avatar, context-menu, hover-card, menubar, navigation-menu, progress, radio-group, separator, toggle, toggle-group を個別にgrepで確認)
- `@radix-ui/react-toast`(P1-2で削除済みのはず)

**削除してはいけないもの(検証済みの誤検知)**:
- `tailwindcss-animate` — `tailwind.config.ts` から require されている
- `next-themes` — `ui/sonner.tsx` が使用
- `react-day-picker` — `ui/calendar.tsx` が使用(calendarは5ファイルから利用)
- `recharts` — `pages/Analytics.tsx` が直接使用

完了条件: `npm install && npm run build` 成功。`npm ls` でエラーなし。

### P1-5: Lovable残骸・リポジトリ衛生

1. `README.md` を書き直す: プロジェクト概要(FlowLog: フロー型ライフログアプリ)、技術スタック、`npm run dev/build/lint/test` の説明、Supabase Edge Functions の一覧と役割、環境変数の説明。Lovable関連の記述(`REPLACE_WITH_PROJECT_ID` を含む全節)は削除。
2. `index.html` の OG画像(lovable.devのURL 2箇所)を削除または自前の画像パスに変更。title/descriptionが適切か確認。
3. `vite.config.ts` の `lovable-tagger`(`componentTagger()`)と devDependency `lovable-tagger` を削除(Lovableでの編集を継続しない前提。**継続する場合はこのタスクをスキップ**)。
4. `.gitignore` に追記: `.env`, `*.tsbuildinfo`
5. `git rm --cached .env` を実行し、`.env.example` を新規作成(キー名のみ、値はプレースホルダー: `VITE_SUPABASE_PROJECT_ID=`, `VITE_SUPABASE_PUBLISHABLE_KEY=`, `VITE_SUPABASE_URL=` 等、現 `.env` のキーをすべて列挙)。README に `.env.example` をコピーする手順を記載。
   - 補足: 含まれているのはanonキー(クライアントに埋め込まれる公開前提の値)のため履歴の書き換え(filter-repo)までは不要。
6. `package.json` の `name: "vite_react_shadcn_ts"` を `"flowlog"` に、`version` を `0.1.0` に変更。

完了条件: ビルド成功。`git status` で `.env` が untracked に見えないこと(ignored になること)。

---

## Phase 2: 型・Lint の健全化

**目的**: コンパイラとLinterを「無駄の再発を防ぐガードレール」として機能させる。一気に `strict: true` にすると数百エラーが出て収拾がつかなくなるため、**フラグを1つずつ**有効化する。各ステップは独立コミット。

### P2-1: 未使用コード検出の有効化

1. `tsconfig.json` と `tsconfig.app.json` の `noUnusedLocals` と `noUnusedParameters` を `true` に変更。
2. `eslint.config.js` から `"@typescript-eslint/no-unused-vars": "off"` を削除し、代わりに `"@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }]` を設定。
3. 出てきたエラーをすべて修正する。**修正方針: 原則「削除」。** 意図的に未使用の引数のみ `_` プレフィックスにリネーム。
4. 完了条件: `npx tsc -b --force` エラー0、`npm run lint` で no-unused-vars 起因のエラー0。

### P2-2: 既存 ESLint エラー63件の解消

1. `npm run lint -- --fix` で自動修正可能なもの(prefer-const等)を先に処理。
2. `@typescript-eslint/no-explicit-any` のエラーを1つずつ修正する。方針:
   - Supabaseのレスポンス型は `src/integrations/supabase/types.ts` の `Tables<'table_name'>` 型を使う。
   - `catch (error: any)` → `catch (error)` + `error instanceof Error ? error.message : String(error)` パターン。
   - Edge Functions(Deno)内の外部APIレスポンスは、最低限のフィールドだけ書いたinterfaceを各ファイル先頭(Phase 3後は `_shared/types.ts`)に定義。
   - **どうしても型が付けられない箇所のみ** `unknown` + 型ガード。`eslint-disable` コメントでの逃げは1ファイル1箇所まで。
   - `useAIApiKeys.ts` の `(supabase.rpc as any)` 5箇所: Supabase生成型に存在しないRPC関数が原因。`supabase gen types` で型を再生成するか、それが出来ない環境では `Database` 型を拡張したヘルパー(`src/integrations/supabase/rpc.ts` に型付きラッパー関数を定義)で `any` を局所化する。
3. `tailwind.config.ts` の `require()` → ESM import に変更。
4. 完了条件: `npm run lint` がエラー0(warningは残ってよいが14件から増やさない)。

### P2-3: `noImplicitAny` の有効化

1. `tsconfig.json`/`tsconfig.app.json` で `noImplicitAny: true`。
2. エラーになった箇所に明示的な型を付ける。完了条件: `npx tsc -b --force` エラー0。

### P2-4: `strictNullChecks` の有効化(このフェーズ最大のタスク)

1. `tsconfig.json`/`tsconfig.app.json` で `strictNullChecks: true` にし、`npx tsc -b --force 2>&1 | grep "error TS" | cut -d"(" -f1 | sort | uniq -c | sort -rn` でエラーをファイル別に集計する。
2. エラー数が多い場合(目安150超)はファイル単位で修正を分割コミットする。修正方針:
   - 安易な `!`(non-null assertion)は禁止。optional chaining (`?.`)、nullish coalescing (`??`)、early return で対処。
   - 「nullのはずがない」と判断した場合でも、データがDB由来なら必ずガードを書く。
3. すべて解消したら最後に `strict: true` を設定し(`strictNullChecks` 等の個別フラグは削除)、残りのstrict系フラグ(`strictFunctionTypes` 等)のエラーを解消する。
4. 完了条件: `tsconfig` が `strict: true`、`npx tsc -b --force` エラー0、`npm run test` パス、`npm run build` 成功。

---

## Phase 3: Edge Functions の共通化

**目的**: 10個のEdge Functions(`api`, `format-entries`, `mcp-server`, `summarize-url`, `ocr-image`, `raindrop-sync`, `gyazo-upload`, `gyazo-delete`, `test-ai-connection`, `save-image-storage-settings`)に散在する重複を `supabase/functions/_shared/` に集約する。

**重要な制約**:
- `_shared/` はSupabaseの公式パターン。各関数からは相対import(`import { corsHeaders } from "../_shared/cors.ts"`)する。
- `mcp-server` と `api` は外部クライアント(MCPクライアント・APIユーザー)が依存している。**レスポンスのJSON構造・ステータスコード・エラーメッセージ文字列を1文字も変えないこと。**
- トークン認証のSHA-256ハッシュ計算手順を変えると**既存の全APIトークンが無効化される**。バイト単位で同一の実装を維持すること。

### P3-1: `_shared/cors.ts` の作成と適用

1. `supabase/functions/_shared/cors.ts` を作成:
   ```ts
   export const corsHeaders = {
     "Access-Control-Allow-Origin": "*",
     "Access-Control-Allow-Headers":
       "authorization, x-client-info, apikey, content-type, " +
       "x-supabase-client-platform, x-supabase-client-platform-version, " +
       "x-supabase-client-runtime, x-supabase-client-runtime-version",
   };
   ```
   ヘッダー集合は**現存3バリエーションの和集合**とする(許可ヘッダーの追加は後方互換)。`mcp-server` だけが持つ `Access-Control-Allow-Methods` は `mcp-server` 側でスプレッドで追加する: `{ ...corsHeaders, "Access-Control-Allow-Methods": "..." }`。
2. 全10関数の冒頭にある `corsHeaders` 定義を削除し、importに置換。
3. 完了条件: 各関数で `deno check` パス。`grep -rn "Access-Control-Allow-Headers" supabase/functions --include="*.ts" | grep -v _shared` のヒットが `mcp-server` のMethods行以外0。

### P3-2: `_shared/auth.ts` の作成(APIトークン認証の一本化)

1. `mcp-server/index.ts`(92-125行付近)と `api/index.ts`(26-59行付近)の `authenticateUser()` をdiffして完全一致を確認する(微差があれば両方の挙動を保つ方を採用し、差分をコミットメッセージに明記)。
2. `supabase/functions/_shared/auth.ts` に移動:
   - Bearerトークン抽出 → SHA-256ハッシュ化 → `user_api_tokens` テーブル照合 → `last_used_at` 更新、を行う `authenticateUser(req: Request, supabase: SupabaseClient): Promise<{ userId: string } | null>` (シグネチャは既存実装に合わせて調整)。
3. 両関数のローカル定義を削除しimportに置換。
4. 完了条件: deno check パス。**手動確認項目(人間向けにPR説明に記載): 既存APIトークンでの `api` 関数呼び出しと、MCPクライアントからの接続が引き続き成功すること。**

### P3-3: `_shared/types.ts` と `_shared/ai-providers.ts` の作成

1. `_shared/types.ts`: `FeatureAIConfig`(現在 `format-entries`/`summarize-url`/`ocr-image` の3箇所に重複定義)、`AIResult`(`format-entries` のみに定義)を移動。3ファイルのローカル定義を削除しimportに置換。フィールドに差分がある場合は和集合を取り、optionalで吸収する。
2. `_shared/ai-providers.ts`: `format-entries`(267-359行付近)と `summarize-url`(28-103行付近)の `callOpenAI()/callAnthropic()/callGoogle()` を統合する。
   - インターフェース案:
     ```ts
     export interface CallAIOptions {
       provider: "openai" | "anthropic" | "google";
       apiKey: string;
       model: string;
       systemPrompt: string;
       userPrompt: string;
       maxTokens?: number;
       temperature?: number;
       jsonResponse?: boolean; // OpenAI response_format: json_object(format-entriesのみ使用)
     }
     export interface CallAIResult {
       text: string;
       usage?: { inputTokens: number; outputTokens: number };
     }
     export async function callAI(options: CallAIOptions): Promise<CallAIResult>;
     ```
   - `format-entries` 版(usage返却あり・response_format対応)を基準実装とし、`summarize-url` は `result.text` だけ使う形に書き換える。
   - 各プロバイダーへのリクエストボディ・エンドポイントURL・ヘッダーは既存実装から変更しない。
   - エラーハンドリング(非2xx時のメッセージ)は既存の文字列を維持。
3. `test-ai-connection` の `testOpenAI()` 等は責務が異なる(疎通確認のみ)ためこのタスクでは統合しない。ただし `callAI()` を流用できるなら、最小プロンプトで `callAI()` を呼ぶ形にリライトしてよい(レスポンス形式は維持)。
4. 完了条件: deno check パス。`format-entries` のトークン使用量記録(usage)が引き続き機能すること。`deno test supabase/functions/` パス。

### P3-4: `_shared/blocks.ts`(ブロック取得クエリの共通化)

1. `mcp-server/index.ts`(134行付近〜)の `getBlocks()` と `api/index.ts`(127行付近〜)の `getBlocksHelper()` をdiffし、フィルタリング(category / tag / 日付範囲 / 完了状態 / `occurred_at` ソート)を共通関数 `queryBlocks(supabase, userId, filters)` として `_shared/blocks.ts` に抽出。
2. 両者に差分がある場合: 差分部分はオプションフラグで分岐させ、各呼び出し元の挙動を完全維持する。
3. `getTodayDate()`(両ファイルに重複、4行)も `_shared/date.ts` または `blocks.ts` に移動。
4. 完了条件: deno check パス。`mcp-server` と `api` のレスポンスが変更前と一致すること(可能なら代表的なリクエストのレスポンスJSONをbefore/afterで比較)。

### P3-5: 小物関数のボイラープレート整理

1. `gyazo-upload`/`gyazo-delete`/`save-image-storage-settings` に重複する `jsonResponse()` ヘルパーを `_shared/http.ts` に移動: `jsonResponse(body: unknown, status = 200, extraHeaders = {})` が corsHeaders を自動付与する形。
2. 各関数のOPTIONSプリフライト処理(`if (req.method === "OPTIONS")`)も `_shared/http.ts` の `handleCors(req)` に共通化(returnするResponseは既存と同一に)。
3. 完了条件: 全10関数で deno check パス。重複定義のgrepヒット0。

---

## Phase 4: フロントエンドのデータ層刷新

**目的**: 手書き useState+useEffect フェッチを React Query に統一し、`useEntries.ts`(703行)を責務ごとに分割する。これにより Phase 5 のコンポーネント分解が安全になる。

### P4-1: クエリキー設計と共通規約の作成

1. `src/lib/queryKeys.ts` を新規作成し、全クエリキーを一元定義する:
   ```ts
   export const queryKeys = {
     entries: (userId: string) => ["entries", userId] as const,
     entry: (userId: string, date: string) => ["entries", userId, date] as const,
     blocksByDate: (userId: string, date: string) => ["blocks", userId, "date", date] as const,
     blocksByCategory: (userId: string, category: string, filters?: object) =>
       ["blocks", userId, "category", category, filters] as const,
     customTags: (userId: string) => ["customTags", userId] as const,
     aiApiKeys: (userId: string) => ["aiApiKeys", userId] as const,
     aiModels: (userId: string) => ["aiModels", userId] as const,
     aiFeatureSettings: (userId: string) => ["aiFeatureSettings", userId] as const,
     apiTokens: (userId: string) => ["apiTokens", userId] as const,
     imageStorageSettings: (userId: string) => ["imageStorageSettings", userId] as const,
   };
   ```
2. ミューテーション成功時は該当キーを `queryClient.invalidateQueries()` で無効化する方針とする(楽観的更新は現状の挙動を維持したい箇所のみ。下記P4-3参照)。

### P4-2: 設定系フックの React Query 移行(小さく始める)

対象(この順で1フックずつ移行・コミット): `useAIApiKeys` → `useApiTokens` → `useAIModels` → `useAIFeatureSettings` → `useImageStorageSettings` → `useCustomTags`

各フックの移行手順(テンプレート):

1. フェッチ部分を `useQuery({ queryKey: queryKeys.xxx(userId), queryFn, enabled: !!userId })` に置換。
2. create/update/delete を `useMutation` に置換し、`onSuccess` で invalidate + 既存のsonner成功トースト、`onError` で既存のエラートースト(**トースト文言は現状のまま**)。
3. **フックの公開シグネチャ(返り値のプロパティ名・関数名)は変えない。** 呼び出し側コンポーネントの変更が不要であることが理想。`loading` は `isPending`/`isLoading` から導出して同名で返す。
4. 完了条件(各フック毎): tsc/lint/build パス。該当画面(設定画面の各セクション)で 一覧表示・作成・更新・削除・エラートースト を実機確認する旨をPR説明に記載。

### P4-3: `useEntries.ts`(703行)の分割と React Query 移行

現状の `useEntries` は (a) Entry/Block の CRUD、(b) AI整形(`formatEntry`、76行)、(c) URL要約(`summarizeUrl`、37行)の3責務が混在している。以下に分割:

1. **`src/hooks/useBlocks.ts`**(CRUD専用):
   - `getBlocksByDate` / `getBlocksByCategory` → `useQuery` 化。`getBlocksByCategory` 内のタスク用クライアントサイドソート(243-251行付近)は `src/lib/taskPriority.ts` 側に `sortTaskBlocks(blocks)` として移動し、queryFn から呼ぶ。
   - `addBlockWithDate` / `updateBlock` / `deleteBlock` → `useMutation` 化。
   - **注意**: FlowViewなどは現在、ミューテーション後に `setBlocks(prev => ...)` 型の楽観的更新をしている。移行時は (i) invalidate で再フェッチに統一しても表示がちらつかないか確認し、ちらつく場合は (ii) `onMutate` での楽観的更新(React Query公式パターン)を実装する。**体感速度を劣化させないこと。**
   - `getOrCreateEntryForDate` / `cleanupEmptyEntry` は mutation のヘルパーとして同ファイル内の非公開関数に。
2. **`src/hooks/useEntryFormatter.ts`**: `formatEntry()`(format-entries Edge Function 呼び出し+結果反映)を移動。`formatting` 状態は mutation の `isPending` で表現。
3. **`src/hooks/useUrlSummarizer.ts`**: `summarizeUrl()` を移動。
4. 型定義 `Block` / `Entry` / `UrlMetadata`(useEntries.ts 15-61行付近)は `src/types/domain.ts` を新設して移動し、`useEntries.ts` からの re-export を一時的に残して呼び出し側を順次切り替える(最終的に re-export 削除)。
5. 既存の `useEntries` は上記3フックを合成する薄いファサードとして残すか、呼び出し側(FlowView, FlowInput, BlockEditModal, stock系ビュー, SearchResults 等)を直接新フックに切り替えて削除する。**推奨: ファサードを残して呼び出し側変更を最小化し、Phase 5 で呼び出し側を整理する際に直接参照へ切り替える。**
6. 完了条件: tsc/lint/build/test パス。実機確認項目: ブロックの追加・編集・削除・日付切替・カテゴリ別表示(Tasks/Memos/Journal/Schedule/ReadLater)・AI整形・URL要約。

### P4-4: `useAnalytics.ts` のクエリキーを `queryKeys` に統一

既存の React Query 利用箇所(3クエリ)のキーを P4-1 の `queryKeys` 体系に合わせる。

---

## Phase 5: 神コンポーネントの分解と stock ビュー共通化

**目的**: 1,000行級コンポーネントを責務単位に分解し、コピペされた3ビューを共通基盤に乗せる。**このフェーズは見た目・操作感を1pxも変えないこと。**

### P5-1: 重複ヘルパーの即時解消(最優先・小)

1. `BlockEditModal.tsx` 内のローカル関数 `buildScheduleDateTime()`(55-70行付近)と `formatDateDisplay()`(73-78行付近)を削除し、`src/lib/entryFormUtils.ts` の `buildScheduleDateTime()` / `formatScheduleDateDisplay()` をimportする。
   - **事前にdiff必須**: ローカル版とlib版の実装に差分がないか確認。差分がある場合は P0 の特性テストでlib版の挙動を確認した上で、BlockEditModal の現挙動に合う方へ寄せる(現挙動の維持が最優先)。
2. `formatTimeFromISO()`(46-52行付近)は `src/lib/dateUtils.ts` に移動して共有化。
3. stock系3ビュー(TasksView 31-40行付近、MemosView 24-34行付近、ReadLaterView 25-35行付近)に重複する `kebabToPascal()` / `getIconComponent()` を `src/lib/iconUtils.ts` に1本化(P6-2のlucide対策と同じファイルを使うこと)。

### P5-2: stock ビューの共通化

TasksView(496行)/ MemosView(271行)/ JournalView(476行)/ ScheduleView(400行)/ ReadLaterView(531行)は「フェッチ→ローディング→フィルタ→ブロックリスト→編集モーダル→削除」の同型パターンを持つ。

1. `src/components/stock/hooks/useStockBlocks.ts` を新設:
   - 入力: `category`, フィルタ条件(tag / priority / read状態 など、ビューごとに任意)
   - 出力: `blocks`, `isLoading`, `updateBlock`, `deleteBlock`, 編集モーダル用の `editingBlock`/`openEdit`/`closeEdit`
   - 内部は P4-3 の `useBlocks` を使用。`useTargetBlockHighlight()` の呼び出しもここに含める(全ビューで同一パターンのため)。
2. 各ビューを `useStockBlocks` に乗せ替え、ビュー固有部分(フィルタUI、行レンダリング)だけを残す。**一気に5ビュー書き換えず、MemosView(最小)→ ReadLaterView → TasksView → ScheduleView → JournalView の順で1ビュー1コミット。**
3. 共通フィルタUI(`TagFilterDropdown`/`PriorityFilterDropdown` は既存コンポーネントを継続利用)の状態管理だけ `useStockBlocks` のオプションに含めるかは実装中の判断に委ねる(無理に共通化して可読性を落とさないこと)。
4. 完了条件: 各ビューで一覧・フィルタ・編集・削除・ハイライトジャンプが従前どおり動作。各ビューのファイルサイズが概ね半減。

### P5-3: `FlowInput.tsx`(1,070行)の分解

現状の責務: 本文入力 / カテゴリ・タグ・優先度選択 / スケジュール入力(isAllDay, start/end 日時)/ タスク期限入力(dueDate 等)/ 画像添付 / 下書きのlocalStorage永続化 / トップタグ取得 / バッチモード / IME対応キーハンドリング。

抽出計画(上から順に、1抽出=1コミット):

1. **`useDraftPersistence.ts`**(フック): localStorage への下書き保存・復元(162-203行付近)。入力: 対象フィールド群とキー。出力: 復元値と保存関数。
2. **`useTopTags.ts`**(フック): トップタグのSupabase取得(220-252行付近)。React Query化(queryKey: `["topTags", userId]` を `queryKeys` に追加)。
3. **`ScheduleFields.tsx`**(コンポーネント): スケジュール入力UI(isAllDay/start/end)。状態は親が持ち、props(`value`/`onChange`)で受け渡す**制御コンポーネント**にする。BlockEditModal の P5-4 でも再利用するため、`src/components/flow/fields/` に置く。
4. **`DueDateFields.tsx`**(コンポーネント): タスク期限入力UI。同上。
5. **`AttachedImageStrip.tsx`**(コンポーネント): 添付画像のプレビュー・削除UI。`useImageUpload`/`useImageAttachments` の呼び出しは親に残す。
6. カテゴリ/タグ/優先度の選択UIは既存の `TagChipSelector`/`PrioritySelector` 等があるため、FlowInput 内のインライン実装をそれらに寄せられるか確認し、寄せられる場合のみ統合。
7. 完了条件: FlowInput.tsx が**500行以下**。入力→送信→各カテゴリのブロック生成、下書き復元、画像添付、バッチモード、IME入力(日本語変換中のEnterで送信されない)を実機確認。

### P5-4: `BlockEditModal.tsx`(976行)の分解

1. P5-3 で作った `ScheduleFields.tsx` / `DueDateFields.tsx` を編集モーダルでも使用(制御コンポーネントなので流用可能なはず。差異があればpropsで吸収)。
2. OCR処理・画像管理セクションを `BlockImageEditSection.tsx` として抽出。
3. カテゴリ別の条件分岐レンダリング(task/schedule/readlater固有フィールド)をセクションコンポーネントに分割: `TaskEditSection.tsx`、`ScheduleEditSection.tsx`、`ReadLaterEditSection.tsx`。
4. 完了条件: BlockEditModal.tsx が**400行以下**。全カテゴリのブロックで編集→保存が従前どおり動作。OCR・画像差し替え・スケジュール変更・期限変更を実機確認。

---

## Phase 6: パフォーマンスと仕上げ

### P6-1: ルートベースのコード分割

1. `src/App.tsx` のページimportを `React.lazy()` + `<Suspense>` に変更:
   ```tsx
   const Dashboard = lazy(() => import("./pages/Dashboard"));
   const Settings = lazy(() => import("./pages/Settings"));
   const Analytics = lazy(() => import("./pages/Analytics")); // rechartsを巻き込む最重要分割点
   const OAuthAuthorize = lazy(() => import("./pages/OAuthAuthorize"));
   // Index, Auth, NotFound は初期表示に近いため直接importのままでよい
   ```
   `<Routes>` を `<Suspense fallback={<AppSplash />}>`(既存の `src/components/common/AppSplash.tsx` を流用)で包む。
2. `vite.config.ts` に `build.rollupOptions.output.manualChunks` を設定し、`react`/`react-dom`/`react-router-dom` を `vendor`、`@supabase/supabase-js` を `supabase` チャンクに分離。
3. 完了条件: `npm run build` で初期チャンク(index-*.js)が**1MB未満**(目標700KB台)。チャンク警告が消えるか大幅減。全ページ遷移が動作。

### P6-2: lucide-react 全量import の解消

1. `grep -rn "import { icons }\|import \* as.*lucide" src` で全量importを特定(2026-06-10時点: `TasksView.tsx` ほか stock系ビューの `getIconComponent()` パターン)。
2. `src/lib/iconUtils.ts`(P5-1で作成済み)を「**アプリで実際に使われるアイコン名→コンポーネントの明示的マップ**」方式に変更する:
   ```ts
   import { CheckSquare, FileText, Bookmark /* …カスタムタグで選択可能な全アイコン */ } from "lucide-react";
   export const iconMap: Record<string, LucideIcon> = { "check-square": CheckSquare, /* … */ };
   export function getIconComponent(name: string): LucideIcon | null { return iconMap[name] ?? null; }
   ```
   - カスタムタグで選択可能なアイコン名の全リストは `useCustomTags.ts` / `TagEditModal.tsx` のアイコン選択UIを確認して列挙すること。DB(`custom_tags` テーブル)に保存済みのアイコン名がマップに漏れるとアイコンが消えるため、**アイコン選択UIが提示する全候補をマップに含める**こと。マップに無い名前はフォールバックアイコン(例: `Tag`)を返す。
3. 完了条件: ビルドサイズがさらに減少(lucide全量で数百KB減を見込む)。既存カスタムタグのアイコンが全て表示される。

### P6-3: console.log の整理

1. `src/` 配下の `console.log`(エラー以外のデバッグ出力)を削除。`console.error`/`console.warn` は維持してよい。
2. Edge Functions 内のログは運用上の観測手段(Supabaseログ)なので**削除しない**。ただし リクエストボディやトークン等の機密がログに出ていないかを確認し、出ていればマスクする。
3. `eslint.config.js` に `"no-console": ["warn", { allow: ["warn", "error"] }]` を src 配下スコープで追加。

### P6-4: ドキュメント整備

1. `docs/architecture.md` を新規作成: ディレクトリ構成、データフロー(React Query / Supabase / Edge Functions)、`_shared/` の使い方、クエリキー規約、新しいビュー/フックを追加するときの手順。
2. 既存 `docs/input-flow.md` / `docs/mcp-integration.md` / `docs/ui-selection-controls.md` の記述がリファクタリング後の実態と合っているか確認し、ずれを修正。

---

## 付録A: フェーズ完了時の検証チェックリスト(全フェーズ共通)

```bash
npx tsc -b --force                 # エラー0
npm run lint                       # Phase 2以降: エラー0
npm run test                       # Phase 0以降: 全テストパス
npm run build                      # 成功。バンドルサイズをPR説明に記録
git status --short                 # 意図しない未追跡ファイルなし
```

実機スモークテスト(Phase 4以降は必須):
- [ ] ログイン → ダッシュボード表示
- [ ] フロー入力: 各カテゴリ(diary/memo/task/schedule/readlater)でブロック作成
- [ ] ブロック編集・削除・完了チェック
- [ ] 日付ナビゲーション(前日/翌日/日付選択)
- [ ] Stock各ビューの表示とフィルタ
- [ ] AI整形(format)実行
- [ ] 検索
- [ ] 設定画面: タグ管理 / AIキー / APIトークン / 画像ストレージ
- [ ] Analytics 表示

## 付録B: 実装しない(スコープ外)と明示する事項

- DBスキーマ・マイグレーションの変更
- 機能追加・UI変更・文言変更
- Supabaseプロジェクトの設定変更・Edge Functionsのデプロイ(コード変更のみ行い、デプロイは人間が実施)
- git履歴の書き換え(`.env` のanonキーは公開前提の値のため不要と判断)
