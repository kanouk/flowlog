最新版ソースを確認したところ、別開発分として `format-entries` はすでに「今日の3行まとめ」を出力しない設計に変わっています。この変更は維持しつつ、写真マーカー仕様だけを新仕様へ変更します。

## 現状確認

- `format-entries` はまだ旧形式 `{{PHOTO:block_id:count}}` を生成しています。
  - 通常AI入力用: `blocksText` 内
  - fallback formatter: 2箇所
- 現在のAIプロンプトは旧ルールのままです。
  - 写真マーカーを文末インラインに置く
  - 改行して別行にしない
- `JournalView` は旧形式のみ対応しています。
- `/entries/:date` は `entries.formatted_content` をそのまま返しています。
- MCP `get_entry` も `formatted_content` をそのまま返しています。
- OpenAPI の `Entry.formatted_content` に写真マーカー展開仕様の説明はありません。

## 実装方針

1. `format-entries` の写真マーカー生成を新形式へ変更
   - `block.images` を画像URLごとのマーカーに変換します。
   - 例:
     ```md
     {{PHOTO:https://example.com/1.jpg}}
     {{PHOTO:https://example.com/2.jpg}}
     ```
   - 入力ブロックに複数画像がある場合は、1枚につき1マーカーにします。
   - 現在の「今日の3行まとめを出力しない」仕様は維持します。

2. AIプロンプトを新ルールへ更新
   - 旧ルールを削除します。
     - `{{PHOTO:xxx:N}}`
     - 文中に自然に配置
     - 改行して別行にしない
     - 文末配置
   - 新ルールを追加します。
     - `{{PHOTO:https://...}}` は必ずそのまま出力
     - URLを書き換えない、省略しない
     - 写真マーカーは独立行に置く
     - 前後に空行を入れる
     - 複数写真は1行に1つずつ並べる
     - 文末インラインにしない
   - `DIARY_OUTPUT_GUARD` にも写真マーカーの空行・独立行ルールを追加して、カスタムプロンプトがある場合でも優先されるようにします。

3. 保存前の正規化を追加
   - AI出力が多少崩れても、`normalizeDiaryMarkdown()` で `{{PHOTO:https://...}}` の前後に空行を入れるよう補正します。
   - 旧形式マーカーも後方互換のため同様に独立行化します。
   - 既存のコードフェンス除去、見出し正規化、まとめセクション除去は維持します。

4. fallback formatter を新仕様へ変更
   - 写真ありブロックは、本文行の直後に空行を入れて画像URLごとのマーカーを出力します。
   - 画像のみブロックは `写真を記録した` など既存相当の本文を残し、その下にマーカーを出します。
   - 文末インライン形式は使いません。

5. Journal 表示を新旧両対応に変更
   - `src/components/stock/JournalView.tsx` の写真マーカー処理を更新します。
   - 対応形式:
     - 新形式: `{{PHOTO:https://...}}`
     - 旧形式: `{{PHOTO:block_id:count}}`
   - 新形式はマーカー内URLを `PhotoMarker` に渡します。
   - 旧形式は既存通り `blocksById` から `block.images` を取得します。
   - 複数行に複数マーカーが並んでも写真UIとして表示します。
   - block が見つからない旧形式マーカーは、表示を壊さないよう安全にスキップまたは元テキスト保持にします。

6. コピー処理を新旧両対応に変更
   - `JournalView` のコピー処理で、どちらの形式も実URLへ変換します。
   - URLは文末に詰めず、前後に空行を入れます。
   - 新形式はマーカー内URLをそのまま使用します。
   - 旧形式は `blocksById` から `block.images` を展開します。

7. REST API `/entries/:date` の返却を変更
   - 保存値は変更せず、返却時だけ `formatted_content` を展開します。
   - 新形式 `{{PHOTO:https://...}}` はURL文字列へ変換します。
   - 旧形式 `{{PHOTO:block_id:count}}` は同一ユーザーの `blocks.images` を参照してURL複数行へ変換します。
   - block 不在・画像なしの場合は元マーカーを残し、データ破壊を避けます。
   - 展開時は前後空行を確保します。

8. MCP `get_entry` の返却を変更
   - REST API と同じ写真マーカー展開ヘルパーを `mcp-server` 側にも実装します。
   - `formatted_content` が外部利用者へ渡る時点では、`{{PHOTO:...}}` ではなくURLが見える状態にします。
   - 旧形式も同一ユーザーの `blocks.images` から展開します。

9. OpenAPI / API docs を更新
   - `/entries/:date` の説明に「写真マーカーはAPI返却時にURLへ展開される」ことを追記します。
   - `Entry.formatted_content` の schema description にも、返却時は写真URL展開済みである旨を追加します。

10. 過去データ移行を追加
   - 既存 `entries.formatted_content` の旧形式 `{{PHOTO:block_id:count}}` を、可能な範囲で新形式へ変換します。
   - 対象:
     - 全 `entries`
     - `formatted_content` に旧形式マーカーが含まれるものだけ
   - 同一 `user_id` の `blocks` を参照します。
   - `blocks.images` がある場合のみ、画像URLごとの `{{PHOTO:url}}` に置換します。
   - block 不在・画像なしの場合は元マーカーを残します。
   - 更新前に dry-run 相当の件数確認を行い、更新後に何件更新したかログ確認します。

## 技術詳細

- 新形式検出:
  ```ts
  /\{\{PHOTO:(https?:\/\/[^}\s]+)\}\}/g
  ```
- 旧形式検出:
  ```ts
  /\{\{PHOTO:([a-zA-Z0-9-]+):(\d+)\}\}/g
  ```
- URL展開時の基本形:
  ```md

  https://example.com/image.jpg

  ```
- 保存用マーカー整形の基本形:
  ```md

  {{PHOTO:https://example.com/image.jpg}}

  ```
- API/MCP では backend 側で `blocks` を `user_id` 条件付きで取得し、他ユーザーの画像を解決しないようにします。
- DBスキーマ変更は不要です。
- 既存の `blocks.images` URL配列、既存画像表示方式、Gyazo/デフォルト保存方式には触れません。
- 最新版で入っている「まとめセクションを出力しない」仕様は維持します。

## 確認項目

- 新規日記生成で `{{PHOTO:https://...}}` が保存される
- 写真マーカーが文末インラインではなく独立行になる
- `/entries/:date` で新形式マーカーがURL文字列に展開される
- `/entries/:date` で旧形式マーカーもURLに展開される
- MCP `get_entry` でも展開済み本文が返る
- Journal 表示で新旧両方のマーカーが写真UIとして表示される
- コピー時に新旧両方のマーカーがURLに変換され、前後空行が入る
- 過去データ移行で既存 `formatted_content` が可能な範囲で新形式へ変換される
- 画像なしブロックや存在しない `block_id` で壊れない