# FlowLog

思考ログを記録・整形するアプリケーション

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## ブロック編集仕様

- **content**: 全日付で編集可能
- **occurred_at**: 編集可能（未来日時は禁止、+5分まで許容）
  - 日付が変わった場合、ブロックは自動的に該当日に移動
  - 元の日のentryが空になった場合、自動削除

## 技術仕様

- **Supabase TIMESTAMPTZ**: ISO8601 形式で返る前提
- **TZ処理**: date-fns-tz の formatInTimeZone / fromZonedTime に統一
- **occurred_at パース**: parseISO() を使用（new Date(str) は使わない）
- **occurred_at 生成**: createOccurredAt(dayKey, time) を使用（Date直操作禁止）
- **未来日時禁止**: UI + DBトリガーで二重担保
- **空entry削除**: クライアント側実装（将来的にDBトリガー化を検討）
- **Edge Function**: parseISO + formatInTimeZone に統一

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
