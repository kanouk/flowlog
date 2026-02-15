

# 楽観的更新を単純に一覧の先頭に追加する

## 原因
`FlowView.tsx` 214行目で楽観的ブロックを追加する際に `sortBlocksDesc` でソートしているため、`occurred_at: new Date().toISOString()` が過去日付の一覧内で不正な位置に配置される。

## 変更内容
`src/components/flow/FlowView.tsx` 1箇所のみ

214行目を変更：

```
// 変更前
setBlocks(prev => sortBlocksDesc([...prev, optimisticBlock]));

// 変更後
setBlocks(prev => [optimisticBlock, ...prev]);
```

楽観的ブロックを常に一覧の先頭（最新位置）に表示し、ソートは行わない。サーバー保存後のブロック置換時（230行目以降）で正しい `occurred_at` を持つブロックに差し替わり、適切な順序になる。

## 影響範囲
- 過去日付での投稿: 先頭に表示され、ちらつき解消
- 今日の投稿: 最新ブロックなので先頭表示で問題なし
- サーバー保存後の置換ロジックは変更不要
