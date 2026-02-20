

# アナリティクス画面の実装

## 概要
日記スコアの推移、カテゴリ別投稿数、日別投稿数を可視化するアナリティクスページを新規作成し、ダッシュボードヘッダーからアクセスできるようにする。

## 変更対象

### 新規ファイル

1. **`src/pages/Analytics.tsx`**
   - 期間選択 UI（7日/30日/90日ボタン）
   - 3つのグラフセクション:
     - スコア推移（LineChart）
     - カテゴリ別投稿数（PieChart）
     - 日別投稿数（BarChart, カテゴリ別スタック）
   - 戻るボタンでダッシュボードへ遷移
   - recharts を使用（インストール済み）

2. **`src/hooks/useAnalytics.ts`**
   - entries テーブルからスコアデータ取得（score IS NOT NULL）
   - blocks テーブルからカテゴリ別集計
   - 日別投稿数の集計ロジック
   - 期間パラメータ（7/30/90日）を受け取る

### 既存ファイル変更

3. **`src/App.tsx`**
   - `/analytics` ルート追加

4. **`src/pages/Dashboard.tsx`**（179-186行目付近）
   - Settings アイコンの左に BarChart3 アイコンボタンを追加
   - クリックで `/analytics` へ遷移

## ヘッダー変更イメージ

```text
[Logo FlowLog]          [検索] [📊] [⚙️] [🚪]
                               ↑ 新規追加
```

## 技術詳細

### useAnalytics フック
- entries から `date`, `score` を取得（期間フィルタ付き）
- blocks から `category`, `occurred_at` を取得（期間フィルタ付き）
- クライアント側で日別・カテゴリ別に集計

### カラーマッピング（既存の TAB_CONFIG と統一）
- journal/event: #3B82F6（青）
- task: #F97316（オレンジ）
- schedule: #06B6D4（シアン）
- thought/memo: #A855F7（紫）
- read_later: #22C55E（緑）

### スコア推移グラフ
- recharts の LineChart + Line + XAxis + YAxis + Tooltip + ResponsiveContainer
- X軸: 日付（M/d形式）、Y軸: 0-100
- ドットにスコアレベル別の色を適用

### カテゴリ別投稿数
- PieChart + Pie + Cell + Legend
- 各カテゴリの件数と割合を表示

### 日別投稿数
- BarChart + Bar (stacked) + XAxis + YAxis + Tooltip + Legend
- カテゴリごとに色分けしたスタックバー

