# ユニバーサルキャプチャ配線計画（2026-07-25開始）

設計の合意内容: どのデバイスからも「一番近いマイク」に投げるだけで FlowLog に集まり、
宣言済みチャネル（時計のタスク追加・共有シートのURL）は即時に本カテゴリーへ、
自由テキストは event に落として 03:00 デイリーレビューが意味づけする。
場所は FlowLog ただ一つ。分類は本人の仕事にしない。

## ステップ（この順に人間が確認する）

- [x] 1. `POST /capture` を FlowLog API に追加（2026-07-25完了）
  - PR #4 → マージ → Lovableチャットでmigration適用＋関数デプロイ（この儀式は毎回必要）
  - curl検証済み: テキスト→event / URL→read_later / source記録、テストデータ削除済み
- [x] 2. Mac CLI `flow`＋Raycastスクリプトコマンド（2026-07-25完了）
  - `~/scripts/flow`（ターミナル用、/opt/homebrew/bin/flow にsymlink、source=mac-cli）
  - `~/scripts/flowlog-capture.sh`（Raycast「FlowLogへ」、source=raycast、mode silent）
  - トークンは `10_sensitive/api-keys/FlowLog.md` から実行時に読む（コピーを作らない）
- [x] 3. HTTP Shortcuts 設定ファイル生成（2026-07-25完了）
  - 実エクスポート形式（version 91）に合わせたJSONを生成しインポート成功
  - 共有ターゲット「FlowLogへ」（source=share、share_title+share_text）＋「ひとこと」（source=phone-text、launcherShortcut）
  - Raycast側も2本目「FlowLogタスクへ」（source=raycast、/tasks直行）を追加
- [x] 4. Google Tasks 中継（2026-07-25完了）
  - 設計変更: Supabase pg_cronではなくMacのlaunchd 5分おき（Macは常時稼働、Lovable経由のシークレット儀式を回避）
  - `09_imports/google-tasks/relay_tasks.py`（OAuthはGoogle Health連携のクライアント共用、redirect 8765）
  - `com.kanouk.flowlog-tasks-relay.plist` ロード済み。E2E検証済み（Tasks→FlowLog source=watch-voice→Tasks削除）
  - 既存の実タスク4件はユーザーがdone化して退避。Google Tasksは以後この配管専用
- [~] 5. IFTTT applet → **スキップ**（時計・スマホ・Macで動線を網羅、Alexaマイク不要と判断。手順書は会話ログに残存）
- [x] 6. 03:00 レビュー拡張（2026-07-25完了）
  - `09_imports/flowlog/scripts/capture_triage.py`（prepare→AI記入→apply、mark-read、summary）。E2E検証済み
  - AGENTS.mdに3段落追記: 夜間仕分け（task/schedule/memo/keep/drop書き戻し）、read-laterナレッジ化（新規のみ・1晩5件・朝の必須経路外）、朝の1行レポート
  - 未読read-laterバックログ約173件は夜間処理の対象外とし、本人と別途整理

## 追加候補

- [ ] 7. 写真キャプチャ（共有シート→FlowLog）。現状の共有ターゲットはテキストのみ。
      /capture-image をapiに追加し、サーバー側でGyazoアップロード→imagesつきevent化する案

## 設計メモ

- `/capture` は意味の分類をしない。URLの正規表現判別と source の記録だけ。
- summarize-url はユーザーJWT認証前提なので `/capture` からは呼ばない。
  取得・要約・翻訳・接続はステップ6の夜間ナレッジ化に集約（Xもローカルブラウザで取れる）。
- read_later の content 形式は既存 addReadLater と同じ「URL\n\nコメント」。
- source の語彙（想定）: mac-cli / raycast / share / phone-text / watch-voice / alexa / mcp

## レビュー

（各ステップ完了時に記録する）
