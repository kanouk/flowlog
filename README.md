# FlowLog

思考ログを記録・整形するアプリケーション

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## ブロック編集仕様

- **content**: 全日付で編集可能
- **occurred_at**: 編集可能（未来日時は禁止、+5分まで許容）
  - 日付が変わった場合、ブロックは自動的に該当日に移動
  - 元の日のentryが空になった場合、自動削除
- **category**: 5種類（event, thought, task, read_later, schedule）
  - FlowInputでは入力後の確認シートで選択する
  - デフォルトは `event`（出来事）
- BlockListでPopoverから変更可能
- **is_done / done_at**: taskカテゴリのみ有効
  - チェックボックスで完了/未完了を切り替え
  - done_atは完了時刻を記録

## 入力フロー仕様

- **1段階目（キャプチャ）**: テキスト、写真、カメラのみを表示し、まだ保存しない
- **2段階目（整理）**: 下から出る確認シートでカテゴリを選択して保存する
  - カテゴリは大きいタップターゲットで選択
  - タグはドロップダウンではなくチップで単一選択
  - タグ未選択のまま保存可能
  - `task` は優先度と一括登録、`schedule` は日時入力を2段階目で補足する
- **保存タイミング**: Supabase への保存は2段階目でのみ実行し、1段階目では一時 state のみを更新する
- **データモデル**: `blocks.category` と `blocks.tag` のスキーマ変更は行わない

## 表示仕様

### フロー（Flow）
- **ソート順**: occurred_at 降順（新→古）
- **D&D並び替え**: ドラッグで並び替え可能
  - occurred_at を前後ブロックの中間時刻に更新
  - 日付境界を跨がない（selectedDateのJST範囲内にクランプ）

### ストック（Stock）
- **タブ**: 日記 / タスク / あとで読む
  - 日記: event + thought
  - タスク: task（未完了→完了の順、内部はoccurred_at昇順）
  - あとで読む: read_later
- **ソート順**: occurred_at 昇順（古→新）
- **AI整形版**: 日記タブでのみ表示

## 技術仕様

- **Supabase TIMESTAMPTZ**: ISO8601 形式で返る前提
- **TZ処理**: date-fns-tz の formatInTimeZone / fromZonedTime に統一
- **occurred_at パース**: parseISO() を使用（new Date(str) は使わない）
- **occurred_at 生成**: createOccurredAt(dayKey, time) を使用（Date直操作禁止）
  - **例外**: D&Dの中間時刻計算（calculateMiddleOccurredAt）のみ UTCミリ秒→ISO直接生成を許可
- **未来日時禁止**: UI + DBトリガーで二重担保
- **空entry削除**: クライアント側実装（将来的にDBトリガー化を検討）
- **Edge Function**: parseISO + formatInTimeZone に統一

## MCP連携仕様

MCP/OAuth/PAT連携の詳細仕様と運用確認観点は以下を参照:

- `docs/mcp-integration.md`
- `docs/input-flow.md`

## セキュリティ仕様（RLS）

全テーブルで RLS が有効。すべてのポリシーは `auth.uid() = user_id` を条件とし、認証なしでのアクセスは不可。

| テーブル | SELECT | INSERT | UPDATE | DELETE | 備考 |
|---------|--------|--------|--------|--------|------|
| entries | ✅ | ✅ | ✅ | ✅ | |
| blocks | ✅ | ✅ | ✅ (WITH CHECK付) | ✅ | |
| profiles | ✅ | ✅ | ✅ | ✅ | |
| custom_tags | ✅ | ✅ | ✅ | ✅ | |
| user_ai_settings | ✅ | ✅ | ✅ | ✅ | APIキーはget_user_ai_settings_safe経由のみ。フロントエンドにキー値は返さない |
| user_api_tokens | ✅ | ✅ | ❌ | ✅ | UPDATE不可（immutable設計、ローテーションはdelete→re-issue） |
| oauth_authorization_codes | ✅ | ✅ | ❌ | ✅ | UPDATE不可 |

### セキュリティパターン

- **user_ai_settings**: Write-onlyパターン。APIキーはEdge Functions（サービスロール）のみがアクセス。フロントエンドは`get_user_ai_settings_safe`関数経由で`has_*_key`フラグのみ取得
- **user_api_tokens**: Immutableパターン。トークン更新はdelete→再発行フロー
- **storage（block-images）**: 公開読み取り（画像共有用）、書き込み・削除は認証ユーザーのみ

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Supabase (Lovable Cloud)

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
