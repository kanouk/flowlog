

# `format-entries` Edge Function: 採点ステータスの明示化（修正版）

## 変更ファイル

| File | Change |
|---|---|
| `supabase/functions/format-entries/index.ts` | Phase 3 に5分岐の `score_status` 判定追加、レスポンスに `score_status` / `score_message` 追加 |

## Phase 3 の分岐ロジック

```text
1. scoreConfig が null/undefined → score_status = "config_missing"
2. enabled === false             → score_status = "disabled"
3. enabled === true, user_prompt_template が空 → score_status = "missing_rules"
4. AI呼び出し成功 かつ score を正常にパース・算出 → score_status = "success"
5. AI呼び出し失敗 or JSONパース失敗 → score_status = "ai_error"
```

- `"success"` は `score` が実際にレスポンスに載る場合のみ。JSONパースできたが score フィールドが欠損している等は `"ai_error"` とする。

## レスポンス JSON 追加項目

| フィールド | 型 | 条件 |
|---|---|---|
| `score_status` | `"success" \| "disabled" \| "missing_rules" \| "config_missing" \| "ai_error"` | 常に返却 |
| `score_message` | `string?` | `success` 以外のとき、クライアント向けの一般化メッセージ |

### `score_message` の方針

- クライアントには一般化メッセージのみ返す（例: `"採点処理中にエラーが発生しました"`)
- 内部エラー詳細（スタックトレース、AI応答の生テキスト等）はサーバーログ (`console.error`) にのみ出力
- 各ステータスのメッセージ例:
  - `config_missing`: `"得点設定が見つかりません"`
  - `disabled`: `"得点機能は無効です"`
  - `missing_rules`: `"行動規範が設定されていません"`
  - `ai_error`: `"採点処理中にエラーが発生しました"`

## 既存フィールドとの互換性

- `score` / `score_details` は `score_status = "success"` の場合のみ返却（現行と同じ動作）
- `formatted_content`, `summary`, `time_updates`, `questions` は一切変更なし

## データ補正について

確認用SQLのみ提示（実行はしない）:

```sql
-- enabled=true なのに user_prompt_template が空の行を確認
SELECT id, user_id, enabled, user_prompt_template
FROM user_ai_feature_settings
WHERE feature_key = 'score_evaluation'
  AND enabled = true
  AND (user_prompt_template IS NULL OR user_prompt_template = '');
```

`enabled` を書き換える補正は行わない（ユーザー意図を保持するため）。

## 動作確認観点

1. 設定行なし → `score_status: "config_missing"` + `score_message` あり、`score` なし
2. `enabled: false` → `score_status: "disabled"`
3. `enabled: true` + テンプレート空 → `score_status: "missing_rules"`
4. 正常採点 → `score_status: "success"` + `score` / `score_details` あり、`score_message` なし
5. AI エラー → `score_status: "ai_error"` + 一般化メッセージ、詳細はサーバーログのみ
6. 既存の `formatted_content`, `summary`, `time_updates` が壊れていないこと

