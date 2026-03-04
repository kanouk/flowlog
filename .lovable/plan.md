

# レガシー `user_ai_settings` 依存の完全廃止

## 概要

`user_ai_settings` テーブルへのすべての依存を排除し、新テーブル群 (`user_ai_models`, `user_ai_feature_settings`, `user_ai_api_keys`) のみを使用するように移行する。AI設定がない/エラーの場合は処理をスキップし、ユーザー入力の登録だけ行う（レガシーフォールバックしない）。

## 現在のレガシー依存箇所

| 箇所 | 利用内容 |
|---|---|
| `format-entries` Edge Function | `user_ai_settings` から AISettings を取得し、フォールバックで使用 |
| `summarize-url` Edge Function | 同上 |
| `ocr-image` Edge Function | レガシー設定からプロバイダー/キーを取得 |
| `src/hooks/useAISettings.ts` | レガシーテーブルの読み書き hook |
| `src/components/settings/AISettingsSection.tsx` | レガシー設定UI全体 |
| `src/components/settings/ScoreSettingsSection.tsx` | `useAISettings` 経由で `score_enabled` / `behavior_rules` を読み書き |
| `src/components/flow/FlowEditor.tsx` | `useAISettings` の `auto_ocr` を参照 |

## 移行方針

### `auto_ocr` と `score_enabled` / `behavior_rules` の移行先

- **`auto_ocr`**: `user_ai_feature_settings` の `ocr` feature_key の `enabled` フラグとして扱う
- **`score_enabled`** + **`behavior_rules`**: 既に `score_evaluation` feature_key の `enabled` + `user_prompt_template` に対応済み

### Edge Function の変更方針（フォールバック廃止）

3段階フォールバック（新設定 → レガシー → Lovable AI）を以下に変更:
- **新設定あり** → そのモデル/キーで呼び出し
- **新設定なし、またはモデル/キー未設定** → Lovable AI デフォルトで呼び出し
- **AI設定エラー** → 処理をスキップし、ユーザー入力のみ登録

`user_ai_settings` テーブルへのクエリをすべて削除。`AISettings` インターフェースと `legacySettings` 変数を削除。

### フロントエンドの変更方針

- `FlowEditor.tsx`: `useAISettings` → `useAIFeatureSettings` に変更し、`ocr` feature の `enabled` を参照
- `ScoreSettingsSection.tsx`: `useAISettings` → `useAIFeatureSettings` に変更し、`score_evaluation` の `enabled` + `user_prompt_template` を読み書き
- `AISettingsSection.tsx` + `useAISettings.ts`: 削除
- `Settings.tsx`: レガシーセクション (`ai`, `score`) を削除/統合

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/functions/format-entries/index.ts` | `user_ai_settings` クエリ削除、`AISettings` 削除、`callAIWithConfig` を新設定 or Lovable AI のみに変更、エラー時はスキップ |
| `supabase/functions/summarize-url/index.ts` | 同上 |
| `supabase/functions/ocr-image/index.ts` | レガシーフォールバック削除、新設定 or Lovable AI のみ |
| `src/components/flow/FlowEditor.tsx` | `useAISettings` → `useAIFeatureSettings` に変更、`auto_ocr` → `ocr` feature の `enabled` |
| `src/components/settings/ScoreSettingsSection.tsx` | `useAISettings` → `useAIFeatureSettings` に変更 |
| `src/pages/Settings.tsx` | レガシーセクション削除、`score` を `features` に統合 |
| `src/hooks/useAISettings.ts` | 削除 |
| `src/components/settings/AISettingsSection.tsx` | 削除 |

## Edge Function `callAIWithConfig` の新ロジック

```text
callAI(featureConfig, systemPrompt, userPrompt):
  1. featureConfig に provider/model_name/api_key あり
     → そのプロバイダーで呼び出し
  2. それ以外
     → Lovable AI (google/gemini-2.5-flash) で呼び出し
```

`format-entries` のスコアリング判定:
```text
scoreConfig = get_feature_ai_config('score_evaluation')
scoreEnabled = scoreConfig?.enabled ?? false
behaviorRules = scoreConfig?.user_prompt_template
```

