## 調査結果

- 現在の公開版 `https://flowlog.jp` はまだ古い bundle `/assets/index-BjwtQXqm.js` を配信しており、その bundle 内にバックエンド接続URLが埋め込まれていません。
- エラー `Uncaught Error: supabaseUrl is required.` は、アプリ起動時にブラウザ側の接続クライアントが `VITE_SUPABASE_URL` を `undefined` として初期化しているのが直接原因です。
- 最新PRに含まれていた `.sql` はこの白画面の直接原因ではありません。SQLはデータベース側の変更で、今回のエラーはReactアプリが描画される前のフロントエンド初期化で発生しています。
- ただし `.env` が `.gitignore` 対象のままなので、公開ビルド時に `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` が欠落しやすい構造になっています。

## 修正方針

1. **接続設定を正規ルートに戻す**
   - `vite.config.ts` に入れた一時的な直書きフォールバックは撤去します。
   - 公開鍵とはいえ設定値の直書きではなく、Vite標準の `import.meta.env.VITE_SUPABASE_*` を使う構成に戻します。

2. **公開ビルドで値が欠落しないようにする**
   - `.env` をこのクラシックVite構成ではコミット対象にできるよう、`.gitignore` の `.env` 除外を調整します。
   - `.env` には公開可能な接続URLと publishable key のみを置き、service role key などの秘密鍵は入れません。

3. **起動時の失敗を明示化する**
   - 自動生成クライアントは直接編集しない方針なので、必要なら別の安全な設定チェック層を追加し、欠落時に原因が分かるエラーにします。
   - 今回はまず公開ビルドで値が入る状態を優先します。

4. **検証**
   - ローカル preview で白画面が出ないことを確認します。
   - 本番相当ビルドの bundle に接続URLが含まれることを確認します。
   - 公開版が古い `/assets/index-BjwtQXqm.js` ではなく新しい bundle に切り替わることを確認します。

5. **再公開**
   - セキュリティスキャンの critical 状態を確認します。
   - ブロック要因がなければ再公開します。
   - 公開反映後、`https://flowlog.jp` を実ブラウザで開き、`supabaseUrl is required` が消えてログイン/ダッシュボード画面まで到達することを確認します。

## 期待される結果

- `Uncaught Error: supabaseUrl is required.` が解消されます。
- 白画面ではなく通常のFlowLog画面が表示されます。
- `.sql` 変更とは別問題として、フロントエンド公開ビルドの環境変数欠落を恒久的に防ぎます。