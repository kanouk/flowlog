

# ダイアログを開く時にテスト結果をクリアする

## 問題
APIキー登録ダイアログを新規で開いた際、前回の接続テスト結果（`testResults['key-dialog']`）がクリアされず残る。

## 修正
`openCreate` と `openEdit` の中で `setTestResults(prev => { const next = {...prev}; delete next['key-dialog']; return next; })` を追加し、ダイアログを開くたびにダイアログ用のテスト結果をリセットする。

## 変更対象
| ファイル | 変更 |
|---|---|
| `src/components/settings/AIModelManagementSection.tsx` | `openCreate` と `openEdit` に `testResults['key-dialog']` のクリア処理を追加（2行追加） |

