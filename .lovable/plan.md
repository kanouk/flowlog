
# 入力（Flow）タブを視覚的に差別化する

## 概要
「入力」は他の5タブ（閲覧系）と性質が異なるため、視覚的に区別して目立たせる。

## 変更対象
`src/pages/Dashboard.tsx` のみ

## 変更内容

### デスクトップ（TabsTrigger）
- Flow タブに専用スタイルを適用：背景にプライマリカラーのグラデーション、テキスト白、他タブと区別
- 具体的には `TabsTrigger` に対して、`flow` の場合のみ `data-[state=active]:bg-primary data-[state=active]:text-primary-foreground` のようなクラスを追加
- 非アクティブ時も `bg-primary/10 text-primary font-semibold` で薄く色を付けて常に目立たせる
- 他の5タブ（閲覧系）はそのまま

### モバイル（ボトムナビ）
- Flow ボタンを他の5つと視覚的に分離：左側に薄いセパレーター（border-right）を追加
- Flow アイコンを `bg-primary text-primary-foreground rounded-xl p-1.5` で囲み、FAB風に目立たせる
- 他の5タブはそのまま

### レイアウトイメージ

```text
デスクトップ:
[■ 入力] [日記] [タスク] [予定] [メモ] [あとで読む]
  ↑ 背景色付き   ↑ 通常スタイル

モバイル:
[◉] | [📖] [📝] [📅] [🧠] [🔖]
 ↑       ↑
背景付き  セパレーター
```

## 技術詳細

### デスクトップ
- `TAB_ORDER.map` 内で `tab === 'flow'` の場合に `TabsTrigger` へ追加クラスを付与
- 非アクティブ: `bg-primary/10 text-primary border border-primary/20`
- アクティブ: `!bg-primary !text-primary-foreground !shadow-md`（デフォルトの active スタイルを上書き）

### モバイル
- `tab === 'flow'` の場合、アイコンを `bg-primary text-white rounded-xl p-1.5` でラップ
- Flow ボタンの右に `border-r border-border` を追加して閲覧系タブと視覚的に分離
