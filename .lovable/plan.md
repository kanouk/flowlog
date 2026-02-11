
# localStorage → sessionStorage 変更

## 概要
`src/lib/categoryUtils.ts` の4つの関数で `localStorage` を `sessionStorage` に変更します。これにより、前回投稿したカテゴリ・タグはブラウザタブを閉じるとリセットされます。

## 変更対象
`src/lib/categoryUtils.ts` のみ

## 変更箇所（4か所）

| 関数 | 行 | 変更内容 |
|------|-----|----------|
| `getLastCategory()` | 100 | `localStorage.getItem` → `sessionStorage.getItem` |
| `setLastCategory()` | 108 | `localStorage.setItem` → `sessionStorage.setItem` |
| `getLastTag()` | 113 | `localStorage.getItem` → `sessionStorage.getItem` |
| `setLastTag()` | 119-121 | `localStorage.setItem` / `localStorage.removeItem` → `sessionStorage` |

## 動作の変化
- **変更前**: カテゴリ・タグがブラウザを閉じても永続的に保持される
- **変更後**: タブ/ウィンドウを閉じるとリセットされ、デフォルト値（カテゴリ: `event`、タグ: `null`）に戻る。同一タブ内では引き続き保持される
