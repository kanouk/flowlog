# Selection Controls

## 目的

選択状態を持つ UI で、ブラウザ既定のフォーカス表示に依存しないこと。
同時に、`selected` と `focused` を視覚的に分離し、キーボード操作でも判別しやすくすること。

## 適用対象

- Flow 入力 2 段階目のカテゴリカード
- ログ編集モーダルのカテゴリチップ
- タグ選択チップ
- 優先度選択チップ

## 設計方針

- フォーカス表現は共通リングを使う
- 選択表現はカテゴリ色、タグ色、優先度色を使う
- `focused` は操作対象、`selected` は現在値として扱う
- 生の `<button>` に個別スタイルを散らさず、`SelectableControl` を使う

## 実装ルール

### 共通 primitive

- `src/components/ui/selectable-control.tsx` を使用する
- `aria-pressed` と `data-state` を付与する
- `focus-visible:outline-none`
- `focus-visible:ring-2`
- `focus-visible:ring-ring`
- `focus-visible:ring-offset-2`

### 見た目の使い分け

- `appearance="card"`: 大きいカテゴリカード
- `appearance="pill"`: チップ、セグメント、絞り込み

### 色の責務分離

- フォーカス色: テーマ変数 `--ring`
- 選択色: 各画面または `CATEGORY_CONFIG` / `TAG_CONFIG` / `PRIORITY_CONFIG`

## 確認観点

- 未選択要素にブラウザ既定のオレンジ枠が出ないこと
- 選択中要素でもフォーカスリングが判別できること
- `Tab` / `Shift+Tab` で移動できること
- `Enter` / `Space` / クリックで選択できること
