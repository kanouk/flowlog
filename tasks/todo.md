# ユニバーサルキャプチャ配線計画（2026-07-25開始）

設計の合意内容: どのデバイスからも「一番近いマイク」に投げるだけで FlowLog に集まり、
宣言済みチャネル（時計のタスク追加・共有シートのURL）は即時に本カテゴリーへ、
自由テキストは event に落として 03:00 デイリーレビューが意味づけする。
場所は FlowLog ただ一つ。分類は本人の仕事にしない。

## ステップ（この順に人間が確認する）

- [ ] 1. `POST /capture` を FlowLog API に追加
  - [x] blocks に `source TEXT` カラム追加（migration作成済み: `20260725034837_add_source_to_blocks.sql`。**DB適用は未**）
  - [x] `addBlockHelper` に source 対応
  - [x] `/capture` ハンドラ: 形式判別のみ（URL→read_later、テキスト→event）
  - [x] 既存 POST（events/tasks/schedules/memos/read-later）でも optional `source` を受ける
  - [x] /docs と /openapi.json を更新
  - [x] deno check（新規エラーなし。59行目の型エラーは既存）
  - [ ] デプロイ → curl で動作確認（ローカルCLIアカウントに権限なく403でブロック中）
- [ ] 2. Mac CLI `flow`（curlラッパー）＋ Raycast スクリプトコマンド
- [ ] 3. HTTP Shortcuts 設定ファイル生成（共有ターゲット「FlowLogへ」＋ホームボタン「ひとこと」）
- [ ] 4. Google Tasks 中継（Supabase pg_cron、数分おき、`POST /tasks` 直行 source=watch-voice）
- [ ] 5. IFTTT applet（Alexa やることリスト → Webhook → `/tasks`、source=alexa）
- [ ] 6. 03:00 レビュー拡張（イベントの意味づけ→FlowLogへ書き戻し、read-laterナレッジ化、朝の1行レポート。AGENTS.md追記）

## 設計メモ

- `/capture` は意味の分類をしない。URLの正規表現判別と source の記録だけ。
- summarize-url はユーザーJWT認証前提なので `/capture` からは呼ばない。
  取得・要約・翻訳・接続はステップ6の夜間ナレッジ化に集約（Xもローカルブラウザで取れる）。
- read_later の content 形式は既存 addReadLater と同じ「URL\n\nコメント」。
- source の語彙（想定）: mac-cli / raycast / share / phone-text / watch-voice / alexa / mcp

## レビュー

（各ステップ完了時に記録する）
