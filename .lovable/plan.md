

# 「外部連携」メニュー + Raindrop.io連携

## 同期タイミング
- **初期同期**: トークン設定・保存時に全件インポート
- **差分同期**: 「あとで読む」タブを開いたときに、前回同期以降の新規ブックマークのみ取得

## 実装計画

### 1. DB: `user_external_tokens` テーブル作成
```sql
CREATE TABLE public.user_external_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service TEXT NOT NULL,
  token TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, service)
);
-- RLS: auth.uid() = user_id (ALL operations)
```
`last_synced_at` で差分同期の基準時刻を管理。

### 2. Edge Function: `raindrop-sync/index.ts`
- ユーザーの Raindrop テストトークンを `user_external_tokens` から取得（service_role）
- Raindrop API `GET /rest/raindrops/0` でブックマーク取得
  - 初期同期: 全件（ページネーション対応）
  - 差分同期: `last_synced_at` 以降の `lastUpdate` のみ
- 取得データを `blocks` テーブルに挿入（URL重複スキップ）
- マッピング: `link` → `content`, `title`/`excerpt`/`cover` → `url_metadata`, `category` = `read_later`
- 完了後 `last_synced_at` を更新
- インポート件数を返す

### 3. 設定画面: 「外部連携」セクション追加
**`src/pages/Settings.tsx`**: `integrations` セクション追加（Link2 アイコン）

**`src/components/settings/ExternalIntegrationsSection.tsx`**: サービス一覧ハブ

**`src/components/settings/RaindropIntegrationSection.tsx`**:
- テストトークン入力・保存
- 保存時に初期同期を自動実行
- 同期結果（件数）をトースト表示

### 4. 「あとで読む」タブで差分同期
**`src/components/stock/ReadLaterView.tsx`**:
- タブ表示時に `raindrop-sync` を呼び出し（差分モード）
- バックグラウンドで実行、新規データがあればリスト更新
- 連続呼び出し防止（最低5分間隔）

### ファイル一覧

| File | Change |
|---|---|
| Migration | `user_external_tokens` テーブル + RLS |
| `supabase/functions/raindrop-sync/index.ts` | Raindrop API連携 Edge Function |
| `src/pages/Settings.tsx` | 「外部連携」メニュー追加 |
| `src/components/settings/ExternalIntegrationsSection.tsx` | 新規: 外部連携ハブ |
| `src/components/settings/RaindropIntegrationSection.tsx` | 新規: Raindrop設定UI |
| `src/hooks/useExternalSync.ts` | 新規: 同期呼び出しフック |
| `src/components/stock/ReadLaterView.tsx` | タブ表示時の差分同期トリガー |

