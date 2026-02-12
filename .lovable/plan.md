
# 日付移動時にカテゴリ・タグをリセット

## 概要
日付を移動した際に、カテゴリをデフォルト（`event`）に、タグを `null` にリセットします。

## 変更対象
`src/components/flow/FlowInput.tsx` のみ

## 変更内容

既存の下書き復元 useEffect（80-95行目）に、カテゴリ・タグのリセット処理を追加します。

```text
現在: selectedDate が変わると下書きだけ復元/クリア
変更後: selectedDate が変わると下書き復元に加え、
        カテゴリを 'event' に、タグを null に、優先度を 0 にリセット
        sessionStorage の保存値もクリア
```

初回マウント時の復元（70-78行目）は `selectedDate` 変更時には走らないため、下書き復元の useEffect 内にリセットロジックを統合します。具体的には：

- `setCategory('event')` と `setLastCategory('event')`（sessionStorage更新）
- `setTag(null)` と `setLastTag(null)`
- `setPriority(0)`

これにより、同じ日付内での連続投稿ではカテゴリ・タグが維持され、日付を切り替えた瞬間にデフォルトに戻ります。
