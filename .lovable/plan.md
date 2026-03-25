

# 得点設定がオンにならない原因分析

## 根本原因: 初期化タイミングの競合（レースコンディション）

以下の順序で問題が発生する:

```text
1. useAuth: user=null, loading=true
2. useAIFeatureSettings.fetchSettings: user=null → settings=[], loading=false
3. ScoreSettingsSection: loading=false && !initialized
   → getSettingForFeature('score_evaluation') = undefined
   → scoreEnabled = false, initialized = true  ← ★ここで空データで初期化確定
4. Auth完了: user が取得される
5. fetchSettings 再実行 → DB から実データ取得、settings 更新
6. しかし initialized=true のため、ScoreSettingsSection は再読み込みしない
   → UIは永遠に scoreEnabled=false のまま
```

**要するに**: `useAIFeatureSettings` が `user=null` の段階で `loading=false` にしてしまい、`ScoreSettingsSection` が空データで初期化を完了してしまう。その後に実データが届いても `initialized` フラグが邪魔して反映されない。

## 修正方針

**`ScoreSettingsSection.tsx`**: `initialized` フラグを廃止し、`settings` の変更に追従する方式に変更。ユーザーが未保存の変更をしていない場合のみ、DB値で同期する。

| File | Change |
|---|---|
| `src/components/settings/ScoreSettingsSection.tsx` | `initialized` フラグを削除し、`settings` 変化時に `hasChanges=false` なら再同期するロジックに置換 |

具体的には:
- `initialized` state を削除
- useEffect の依存を `[loading, getSettingForFeature]` に変更
- `hasChanges` が false の場合のみ DB 値で上書き
- これにより auth 完了後の再フェッチ結果が正しく UI に反映される

