# 投稿の再送と重複防止

2026-10-31。画面、REST、MCPのブロック新規作成は、所有者と投稿IDに対して一度だけ保存する。本文一致による自動統合は行わず、異なるIDなら同じ本文でも別の投稿として扱う。

- **画面**: 投稿IDと準備済みの本文・日時・画像URLを、保存確認が取れるまでブラウザに保持する。応答が失われた場合も同じID・同じ値で再試行する。送信中はフォームの二重送信を止める。主入力フォームでは未確認の写真・カテゴリー等も保持し、再読み込み後に復元する。
- **REST**: 新規作成の `POST /events`, `/tasks`, `/schedules`, `/memos`, `/read-later`, `/capture`, `/capture-image` に `Idempotency-Key` ヘッダーが必須。1〜128文字の英数字および `._:-` が使える。同じ投稿の再送では同じキーと同じ内容を送る。キーなしは428、同じキーの別内容は409で保存しない。
- **MCP**: `add_event`, `add_task`, `add_schedule`, `add_memo`, `add_read_later` の `idempotency_key` 引数が必須。JSON-RPCのリクエストIDとは別に、投稿IDを再送でも維持する。ツール定義をキャッシュするクライアントは再接続して更新する。
- **ブラウザAPI**: `POST /api/data/blocks` のinsertも同じ仕組みを通る。他テーブルの認証・保存方法は維持する。

`block_create_receipts` の一意制約と、ブロック・必要な日付エントリーの作成を同じD1トランザクションで確定する。競合した処理は自身のINSERTをロールバックして、先に保存された結果を返す。キーは所有者単位で、画面・REST・MCPに共通。同じキーの返答は最初の保存時点のsnapshotであり、後の編集を上書きせず、削除済みの投稿も再作成しない。receiptにはそのsnapshotが残る。過去の `event_api_receipts` も読み取り互換を維持する。

migration `0007_block_create_receipts.sql` は新しい空のreceipt表だけを追加する。既存のブロックや日記の統合・削除・更新は行わない。

REST・MCPのCloudflare版は、この保存契約を保つため手動で保守する。`port-functions.mjs` はこの2つを上書きしない。

再現試験は `node scripts/cloudflare/verify-idempotency.mjs`。同時送信、別内容でのキー再利用、キーなしの拒否、別IDでの同文投稿、編集・削除後の再送、画面／REST／MCP間の再送、一括保存のロールバック、写真取り込みを架空データで確認する。通常のWorker試験は `node scripts/cloudflare/verify-functions.mjs --production`。

API送信元が再送のたびに新しいキーを作ると、それは別投稿として扱われる。キーはリトライループの外で作成・保持する。旧キーなしクライアントは重複を作らず428で止まるため、キーを付けるよう更新する。
