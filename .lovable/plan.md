

# 得点フラグが勝手にオフになる原因と修正

## 原因

`ScoreSettingsSection` と `AIFeatureSettingsSection` が同じ `score_evaluation` 行を**別々の `useAIFeatureSettings` フックインスタンス**で管理している。

具体的な問題箇所: `AIFeatureSettingsSection` 内の `FeatureCard` に「デフォルトに戻す」ボタンがあり、これは `deleteSetting('score_evaluation')` を呼ぶ。行が削除されると、`ScoreSettingsSection` は `scoreSetting?.enabled ?? false` でフォールバックし、**オフとして表示**される。

また、`FeatureCard` と `ScoreSettingsSection` で `enabled` のデフォルト値が逆:
- `FeatureCard`: `initialData?.enabled ?? true` (デフォルト: オン)
- `ScoreSettingsSection`: `scoreSetting?.enabled ?? false` (デフォルト: オフ)

## 修正

**`AIFeatureSettingsSection` から `score_evaluation` を除外する。**

得点設定は専用の `ScoreSettingsSection` で完結させ、`AIFeatureSettingsSection` の処理一覧には表示しない。これにより二重管理の競合を根本的に解消する。

| File | Change |
|---|---|
| `src/components/settings/AIFeatureSettingsSection.tsx` | `FEATURE_DEFINITIONS` のループから `score_evaluation` をフィルタリングして除外 |

変更は1行のフィルター追加のみ:
```tsx
{FEATURE_DEFINITIONS.filter(def => def.key !== 'score_evaluation').map(def => { ... })}
```

