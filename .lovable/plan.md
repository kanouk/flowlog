

# 生成AI設定の分離: 調査結果と実装計画

## 1. 現状調査結果

### AI利用箇所

| 処理 | Edge Function | 現在のモデル取得方法 | プロンプト |
|---|---|---|---|
| 日記整形 | `format-entries` (Phase 2) | `user_ai_settings.selected_provider/model` | `custom_system_prompt` or ハードコードデフォルト |
| 時刻推測 | `format-entries` (Phase 1) | 同上（同一呼び出し内で共有） | ハードコード `TIME_ANALYSIS_PROMPT` |
| 得点計算 | `format-entries` (Phase 3) | 同上 | ハードコード `SCORE_PROMPT` + `behavior_rules` |
| URL要約 | `summarize-url` | 同上 | `custom_summarize_prompt` or ハードコードデフォルト |
| OCR | `ocr-image` | **固定** `google/gemini-2.5-flash` (Lovable AI) | ハードコードシステムプロンプト |
| 接続テスト | `test-ai-connection` | リクエストbodyから直接受取 | N/A |

### 関連ファイル

- `src/hooks/useAISettings.ts` — 設定の読み書き、モデル一覧定義
- `src/components/settings/AISettingsSection.tsx` — プロバイダー/モデル/APIキー/プロンプト設定UI (538行)
- `src/components/settings/ScoreSettingsSection.tsx` — 得点ON/OFF + 行動規範テキスト
- `src/pages/Settings.tsx` — 設定画面のルーティング（サイドバー式）
- `supabase/functions/format-entries/index.ts` — 3フェーズ (時刻推測→整形→スコア) (719行)
- `supabase/functions/summarize-url/index.ts` — URL要約
- `supabase/functions/ocr-image/index.ts` — OCR（Lovable AI固定）
- `supabase/functions/test-ai-connection/index.ts` — 接続テスト
- DB: `user_ai_settings` テーブル（単一レコード/ユーザー）
- DB RPC: `get_user_ai_settings_safe()` — APIキーを隠して返す

---

## 2. 実装方針

### 段階的移行戦略

旧テーブル `user_ai_settings` は**残す**。新テーブルを追加し、Edge Function側で「新テーブルにデータがあればそちらを使う、なければ旧設定にフォールバック」する。フロント側は新UIを追加し、旧UIは「レガシー」として残すか新UIに統合する。

### データ設計

**新テーブル1: `user_ai_models`**
```
id, user_id, provider (openai/anthropic/google), display_name, model_name, 
api_key (平文でDB保存、RLSで保護、safe RPCで隠す ← 既存パターン踏襲),
is_active, sort_order, note, created_at, updated_at
```

**新テーブル2: `user_ai_feature_settings`**
```
id, user_id, feature_key (unique per user), 
assigned_model_id (FK → user_ai_models, nullable),
system_prompt, user_prompt_template, enabled,
created_at, updated_at
```

**Safe RPC: `get_user_ai_models_safe()`** — `api_key` の代わりに `has_api_key: boolean` を返す

**Safe RPC: `get_feature_ai_config(feature_key)`** — Edge Function用。feature_keyを指定すると、割り当てモデルの provider/model_name/api_key + プロンプトを返す。SECURITY DEFINER。

### feature_key 一覧

| feature_key | 処理名 | デフォルトプロンプト元 |
|---|---|---|
| `diary_format` | 日記整形 | 現 `DEFAULT_SYSTEM_PROMPT` (format-entries内) |
| `time_inference` | 時刻推測 | 現 `TIME_ANALYSIS_PROMPT` |
| `score_evaluation` | 得点計算 | 現 `SCORE_PROMPT` |
| `url_summary` | URL要約 | 現 `DEFAULT_SUMMARIZE_PROMPT` |
| `ocr` | OCR | 現 ocr-image内ハードコード |

### Edge Function変更方針

各Edge Functionの冒頭で「`get_feature_ai_config(feature_key)` を呼び出し → 結果があればそれを使用 → なければ旧 `user_ai_settings` にフォールバック → それもなければ Lovable AI デフォルト」。

`format-entries` は3つの feature_key (`time_inference`, `diary_format`, `score_evaluation`) を順番に取得し、それぞれ別モデルで呼べるようにする。

`ocr-image` は `ocr` feature_keyから取得。未設定なら従来通りLovable AI固定。

### フロント変更方針

Settings に2つの新セクションを追加:
- **生成AIモデル管理** (`models`) — モデルCRUD + 接続テスト
- **処理別AI設定** (`features`) — 各feature_keyのモデル割当 + プロンプト編集

既存の「生成AI設定」「今日の得点」セクションは当面残し、新UIへの移行案内を表示。得点の `score_enabled` / `behavior_rules` は `user_ai_feature_settings` の `score_evaluation` エントリの `enabled` + `user_prompt_template` に寄せる。

---

## 3. 変更対象ファイル一覧

### 新規作成
| ファイル | 内容 |
|---|---|
| Migration SQL | `user_ai_models`, `user_ai_feature_settings` テーブル + RLS + RPC + 既存データ移行 |
| `src/hooks/useAIModels.ts` | モデル管理CRUD hooks |
| `src/hooks/useAIFeatureSettings.ts` | 処理別設定CRUD hooks |
| `src/components/settings/AIModelManagementSection.tsx` | モデル管理UI |
| `src/components/settings/AIFeatureSettingsSection.tsx` | 処理別AI設定UI |

### 変更
| ファイル | 変更内容 |
|---|---|
| `src/pages/Settings.tsx` | 新セクション2つ追加 (`models`, `features`)、サイドバーメニュー更新 |
| `supabase/functions/format-entries/index.ts` | 新RPC `get_feature_ai_config` 呼び出しに変更、フォールバック付き |
| `supabase/functions/summarize-url/index.ts` | 同上 (`url_summary`) |
| `supabase/functions/ocr-image/index.ts` | 同上 (`ocr`)、固定モデル廃止 |
| `supabase/functions/test-ai-connection/index.ts` | 登録モデルIDベースのテストに対応追加 |
| `src/hooks/useAISettings.ts` | 既存維持 (フォールバック用)、一部型拡張 |
| `src/components/settings/AISettingsSection.tsx` | 旧UI維持 or 縮小、新UIへの誘導 |
| `src/components/settings/ScoreSettingsSection.tsx` | `score_evaluation` feature設定との統合 |

### 影響確認が必要（読み取り専用で利用）
| ファイル | 確認点 |
|---|---|
| `src/hooks/useImageUpload.ts` | auto_ocr利用箇所 |
| `src/components/flow/FlowView.tsx` | format-entries呼び出し |
| `src/components/stock/ReadLaterView.tsx` | summarize-url呼び出し |
| `supabase/functions/api/index.ts` | REST API経由のAI呼び出し有無 |
| `supabase/functions/mcp-server/index.ts` | MCP経由のAI呼び出し有無 |

---

## 4. Migration概要

```sql
-- 1. user_ai_models テーブル
CREATE TABLE user_ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai','anthropic','google')),
  display_name text NOT NULL,
  model_name text NOT NULL,
  api_key text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS + unique制約 + updated_at trigger

-- 2. user_ai_feature_settings テーブル  
CREATE TABLE user_ai_feature_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature_key text NOT NULL,
  assigned_model_id uuid REFERENCES user_ai_models(id) ON DELETE SET NULL,
  system_prompt text,
  user_prompt_template text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, feature_key)
);
-- RLS

-- 3. Safe RPC: get_user_ai_models_safe()
-- 4. Edge Function用 RPC: get_feature_ai_config(feature_key)
--    → provider, model_name, api_key, system_prompt, user_prompt_template を返す
-- 5. 既存データ移行: user_ai_settings → user_ai_models (APIキーがあるプロバイダー分)
--    + user_ai_feature_settings (custom_system_prompt → diary_format, custom_summarize_prompt → url_summary)
```

---

## 5. 移行の安全策

- 旧 `user_ai_settings` テーブルは**削除しない**
- Edge Functionは「新設定 → 旧設定 → Lovableデフォルト」の3段フォールバック
- フロントの既存 `useAISettings` hook は維持（`ScoreSettingsSection` 等で引き続き利用可能）
- 新UIと旧UIは並存し、旧UIに「新しい設定画面への案内」を表示

