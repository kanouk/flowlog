# 写真付き日記API（1.1.0）

`codex/photo-diary-api` にあった未コミットの画像API案を引き継ぎ、生活日判定、永続的な冪等性、更新番号、長文をURLへ入れない原子的更新、読み戻しを追加した。

## 調査結果と変更範囲

- `blocks.images` はネイティブ添付の `text[]`（通常 `[]`、旧データはnullもあり得る）。既存DBトリガーは最大5枚と「本文または画像が必要」を検証する。今回のAPIは画像バイトを取得・アップロード・削除せず、HTTPS URLをそのまま保存する。Gyazoは `https://i.gyazo.com/<id>.jpg` などの直接画像URLを使う。
- 生活日は画面と同じ `Asia/Tokyo`、所有者の `user_ai_settings.day_boundary_hour`（0〜12、未設定0）で求める。境界5時なら `2026-09-21T02:00:00+09:00` は9/20に所属する。日時そのものは入力精度を保って `timestamptz` へ保存する。
- 認証は既存のBearer APIトークンをSHA-256にして `user_api_tokens` から所有者を得る。APIはservice roleを使うため、RLSだけに依存せず必ずこの所有者IDで絞る。リクエストの `user_id` や `entry_id` で更新先を変更する機能はない。
- 新しいDB RPCは `SECURITY INVOKER`、service_roleだけが実行可能。冪等記録はRLSを有効にし、anon/authenticatedへの読み書きを禁止する。
- 画像の追加・更新から `format-entries`、OCR、要約、Gyazoアップロードは呼ばない。既存エントリーを取得する際もINSERT競合時にUPDATEせず、整形済み本文・updated_atを変えない。更新番号だけは各ブロックの全UPDATEで増える。
- 2026-10-28にLovable接続で本番の列・RLS・トリガー定義を読み取り、画像・日時の検証以外に本文整形を呼ぶブロックトリガーがないことを確認した。画面を開く処理も読み取りのみ。画面からの本文/日時編集等には別途整形経路が残るため、本APIの画像更新とは区別する。
- `POST /capture-image` は既存どおり新規アップロード用。過去日指定や既存ブロックの更新を追加したわけではない。今回の用途は `/events` と `/blocks/{id}` を使う。

## 登録と再送

```http
POST /events
Authorization: Bearer <API token>
Content-Type: application/json
Idempotency-Key: diary-photo-20260920-example-1

{
  "content": "架空の日記。○○と食事をした。",
  "occurred_at": "2026-09-21T02:00:00+09:00",
  "tag": "private",
  "source": "photo-diary",
  "images": ["https://i.gyazo.com/0123456789abcdef0123456789abcdef.jpg"]
}
```

境界5時の応答例（他のBlockフィールドは省略）：

```json
{
  "success": true,
  "data": {
    "id": "33333333-3333-4333-8333-333333333333",
    "entry_id": "22222222-2222-4222-8222-222222222222",
    "content": "架空の日記。○○と食事をした。",
    "occurred_at": "2026-09-20T17:00:00+00:00",
    "date": "2026-09-20",
    "images": ["https://i.gyazo.com/0123456789abcdef0123456789abcdef.jpg"],
    "revision": 1,
    "replayed": false,
    "message": "出来事を追加しました"
  }
}
```

- `images` はHTTPSだけ、最大5枚、重複不可。ホストの大小文字・既定ポート・フラグメントの違いだけでも重複として拒否する。認証情報付きURL、空白・制御文字・バックスラッシュを含むURLも拒否する。到達性や画像の実体までは検査しない。
- `occurred_at` は時差を含むISO8601。省略時は初回登録時刻。最大5分先までという既存DB制約を維持する。
- 冪等キーは1〜128文字の英数字と `._:-`。同一所有者内でキーと正規化後の入力を保存し、ブロック作成と同じトランザクションで確定する。キーの同時再送は1件だけ作成する。内容が違えば409。失敗したトランザクションは予約も取り消す。
- 応答が途切れたら**同じキー・同じ入力**で再送する。省略した日時を再送時に補わない。`source` の前後空白など保存時の正規化は同一視するが、日時の表記変更は別入力になる。
- 再送応答は初回の保存スナップショットで `replayed: true`。作成後に本人が編集・削除しても再作成しない。現在の状態は対象日をGETする。記録にTTLは設けず、所有者のプロフィール削除で削除する。アカウント削除時も既存の `auth.users → profiles` と今回の `profiles → event_api_receipts` の削除連鎖で削除される。プロフィールの削除・再作成をまたぐ再送は冪等性の保証対象外。
- キーを省略すれば毎回新規作成。画像とキーを両方省略した従来の呼び出しは、既存の本文・タグ・source・日時の保存、従来の所属日判定、`data: {id, message}` を維持する。新しい生活日判定をテキストのみで使う場合も、キーまたは `images: []` を明示する。既存データの所属日は移行しない。

## 読み戻しと画像の置換

`GET /entries/2026-09-20` の `data.date` が所属日、`data.blocks[]` に保存された本文、画像URL、日時、ブロックID、entry_id、revisionが入る。従来の `formatted_content` の写真マーカー展開は維持し、`stored_formatted_content` にはDB保存値をそのまま返す。これらを別々に比較する。対象エントリーがなければ従来どおり `data: null`。

直前に読み取った対象Blockから、expectedの5項目をそのまま転記する。`images` は全置換。既存写真を残して追加する場合は既存URLも含め、全解除は `[]` を使う。空本文での全画像解除は既存DB制約で400となる。

```http
PATCH /blocks/33333333-3333-4333-8333-333333333333
Authorization: Bearer <API token>
Content-Type: application/json

{
  "images": [
    "https://i.gyazo.com/0123456789abcdef0123456789abcdef.jpg",
    "https://i.gyazo.com/fedcba9876543210fedcba9876543210.jpg"
  ],
  "expected": {
    "content": "架空の日記。○○と食事をした。",
    "images": ["https://i.gyazo.com/0123456789abcdef0123456789abcdef.jpg"],
    "occurred_at": "2026-09-20T17:00:00+00:00",
    "entry_id": "22222222-2222-4222-8222-222222222222",
    "revision": 1
  }
}
```

成功は `{"success":true,"data":{...更新後のBlock全体...},"message":"ブロックを更新しました"}`。revisionは2になる。`images` だけの更新は本文、tag、日時、entry_id、整形済み日記、他ブロックを変更しない。`images` 省略の従来PATCHは画像を保持する。

照合と更新はDB内の単一UPDATE。同時に本文・画像・日時・所属先のいずれかが変われば409、tagなどの別フィールド編集や「編集→元に戻す」もrevisionで409になる。長い日記本文をURLのフィルターへ埋め込まずJSON RPCで渡す。他所有者・削除済みも条件付き更新では409とし、存在の違いを公開しない。

| HTTP | 意味・対応 |
| --- | --- |
| 400 | JSON、URL、枚数、重複、日時、キー、expected不正、DB入力制約違反。修正してから送る |
| 401 | Bearerトークン不在・無効。更新しない |
| 404 | expectedなしの従来PATCHで対象がない／他所有者 |
| 409 | ブロック競合またはキーの別入力への再利用。再取得して本人の編集を確認する。盲目的にexpectedを差し替えない |
| 500 | DB等の失敗。POSTは同じキーで再送。PATCHは先に独立GETで結果を調べる |

エラー例：`{"success":false,"error":"Duplicate image URLs are not allowed"}`。詳細なリクエスト・レスポンスのスキーマと例は `/openapi.json`、要約は `/docs` にある。

## 検証結果（2026-10-28）

- APIテストはPGlite（PostgreSQL 17.5/WASM）へ過去のコアスキーマの実SQLと今回のマイグレーションを適用し、実際のSQL、制約、トリガー、RPC実行権限を検証する。認証トークン検索とPostgRESTのHTTP部分は模擬。PGliteは単一接続なので、同時Promiseによる再送・競合検証は複数接続のロック待ち試験とは区別する。
- 架空データで、境界前後・過去日・画像付き読み戻し・画像だけの更新・日記と他ブロックの不変・既存画像保持・競合/ABA/他所有者拒否・入力異常・既存テキストAPI・冪等性・失敗ロールバック・削除後の再送を検証する。長文やURLの記号、旧null画像も含む。
- 1件確認用スクリプトの差分検出テストも含め `npm run test:api`。本番APIや画面表示を検証したという意味ではない。

```bash
npm run test:api
deno check supabase/functions/api/index.ts scripts/photo-diary-canary.ts
npm test
npx tsc -b --force
npm run build
npm run lint
```

実行結果: API/DB/1件確認スクリプトのテスト11件、既存フロントテスト21件が成功。Deno型検査、TypeScriptビルド、Vite本番ビルドも成功。Lintはエラー0、既存警告7件。

## Cloud配備前検査への対応（2026-10-28）

Lovableから、未適用のSQLが「auth.usersへの直接外部キー参照」と「権限付与より先のRLS有効化」で配備前検査を通過しないとの報告があった。適用前に停止され、対象DBに追加構造がないことも読み取りで確認済みのため、この未適用マイグレーション自体を修正した。適用済みの過去マイグレーションは変更しない。

- 冪等記録の外部キーは既存の `public.profiles(user_id)` を参照する。ユーザーIDの一意制約とアカウント削除からの削除連鎖は既存スキーマで定義されている。プロフィールそのものの削除でも冪等記録は削除されるため、その操作をまたぐ再送は保証しない。
- `REVOKE` とservice_roleへの `GRANT` を先に実行し、最後にRLSを有効化する。匿名・ログインユーザーへの権限は追加しない。
- 報告された2条件をDDL実行時に検査するローカルガードと、広いデフォルト権限があっても冪等記録へのアクセスが拒否されること、別所有者のデータを残してアカウント削除が連鎖することをテストする。実際のCloud配備前検査の通過は再配備時に別途確認する。

## 配備と本人確認済み1件での確認

**現時点では未配備。** 本番OpenAPIは1.0.0で画像入力なし。CLIによる対象プロジェクトのfunctions一覧取得は403（必要権限なし）だった。Lovable経由の読み取りはできるが、それをEdge Function配備済みと扱わない。DBだけの先行適用も行っていない。

1. PRの実装を確認し、FlowLogの既存の配備担当経路で新規マイグレーション `20261028000000_photo_diary_api.sql` を適用、その後 `api` Edge Functionを配備する。プロジェクトは `wdvwnbeofakzihmjacko`。APIソース、`native-images.ts` と `_shared/cors.ts` も対象。既存マイグレーションの一括再実行はしない。フロントの変更・公開は不要。
2. 公開OpenAPIが1.1.0で画像・expected・冪等キー・readbackを記載していることを独立取得で確認する。実PostgREST経由の架空データ試験（2所有者、2接続の同時投稿/更新を含む）も本番の本人データを触る前に別途行う。
3. 本人が指定した日付・Block ID・画像URLの**1件だけ**を対象にする。未指定の実データを選ばない。トークンは既存の安全な読み込み経路で環境変数 `FLOWLOG_API_TOKEN` に設定し、値を表示・Git保存しない。
4. `prepare` でAPIから独立取得した全エントリー（保存済み日記、全ブロックの本文・日時・既存画像を含む）を保全する。出力先はGit対象外の `.migration-backups/` を用い、権限600で新規保存する。

```bash
# 実際の本人確認済みの値に置き換える。既存写真を残すなら全URLを列挙する。
deno run --allow-env=FLOWLOG_API_TOKEN --allow-net=wdvwnbeofakzihmjacko.supabase.co \
  --allow-read --allow-write scripts/photo-diary-canary.ts prepare \
  --date 2026-09-20 --block '<confirmed-block-uuid>' \
  --images '["https://i.gyazo.com/<confirmed-image-id>.jpg"]' \
  --out .migration-backups/photo-canary.json

# 更新直前の全体一致を確認し、画像だけPATCH。その後別GETで比較する。
deno run --allow-env=FLOWLOG_API_TOKEN --allow-net=wdvwnbeofakzihmjacko.supabase.co \
  --allow-read --allow-write scripts/photo-diary-canary.ts apply \
  --manifest .migration-backups/photo-canary.json

# 書き込みなしで再検証も可能。
deno run --allow-env=FLOWLOG_API_TOKEN --allow-net=wdvwnbeofakzihmjacko.supabase.co \
  --allow-read --allow-write scripts/photo-diary-canary.ts verify \
  --manifest .migration-backups/photo-canary.json
```

5. PATCH応答だけを根拠にせず、別GETの本文・日時・既存写真・所属日・保存済み整形本文・他ブロックをbeforeと比較する。スクリプトは更新番号と指定画像以外の変化を検出すると停止し、afterスナップショットも保全する。応答不明時も自動再送しない。
6. FlowLog画面の対象日を読み込み、該当ブロックの各画像が読み込まれ、画像の自然幅が0でないこと、本文・日時・既存写真が保持されることを確認する。スクリプトは画面成功を自動宣言しない。API読み戻しと画面確認を別々に記録する。
7. 想定外の変更があれば、後続の投稿/更新を止める。before/afterとHTTP状態を保持し、本人の新しい編集を上書きする自動復旧や一括適用は行わない。

ロールバックはAPIの配備だけを直前版へ戻す。追加のrevision列・トリガー・冪等記録は残す（互換性あり、記録を消すと再送重複の恐れがある）。新API再開時は同じ冪等記録を使う。実データの復元は差分と本人編集を確認した1件に限定し、別途判断する。
