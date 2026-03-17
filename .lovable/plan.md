

# 診断結果: 処理別AI設定リファクタリングが原因

## 結論: はい、直接的な原因です

以前は `user_ai_settings` テーブルの `score_enabled` / `behavior_rules` カラムを直接読み書きしていたため、シンプルに動作していました。

処理別AI設定への移行で `ScoreSettingsSection` が `useAIFeatureSettings` フックに依存するようになり、以下のバグが発生しています。

## バグの仕組み

1. `useAIFeatureSettings` の `getSettingForFeature` 関数が **`useCallback` で囲まれていない**（毎レンダリングで新しい関数オブジェクトが生成される）
2. `ScoreSettingsSection.tsx` 47行目の `useEffect` がこの関数を依存配列に含む: `[loading, getSettingForFeature]`
3. ユーザーが行動規範欄に1文字入力 → state変更 → 再レンダリング → `getSettingForFeature` が新参照 → useEffect再実行 → DB値で上書き → **入力が消える**

この無限リセットループにより:
- 行動規範欄に入力できない
- 設定を保存できない → サーバー側で `enabled=false` / `behaviorRules=null` のまま → スコアが計算されない

## 修正計画（3箇所）

### 修正A: `useAIFeatureSettings.ts`
`getSettingForFeature` を `useCallback` でラップし、`settings` を依存配列に指定。関数参照を安定化。

### 修正B: `ScoreSettingsSection.tsx`
useEffect の依存配列を `[loading]` のみに変更し、`getSettingForFeature` は effect 内で直接呼ぶ（初回ロード完了時のみ実行する設計に修正）。

### 修正C: `format-entries/index.ts` 769行目
ビルドエラー（TS2345）を型アサーションで解消。Supabase クライアントに型情報がないため `.update()` の引数が `never` に推論されている問題。

