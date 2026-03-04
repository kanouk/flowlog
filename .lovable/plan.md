

# 検索対象に「あとで読む」の要約文を追加

## 概要
現在ブロック検索は `content` カラムのみを対象としているが、Read Later ブロックの URL 要約（`url_metadata` JSONB 内の `summary` フィールド）も検索対象に含める。

## 変更内容

### `src/hooks/useSearch.ts`
- ブロック検索クエリの `select` に `url_metadata` を追加
- フィルタ条件を `.ilike('content', ...)` 単体から `.or()` に変更し、`url_metadata->summary` の ILIKE 検索を追加：
  ```
  .or(`content.ilike.%${q}%,url_metadata->>summary.ilike.%${q}%`)
  ```
- `BlockSearchResult` インターフェースに `url_metadata` フィールドを追加

### `src/components/search/SearchResults.tsx`
- Read Later ブロックの表示テキストに、`content` が空または URL のみの場合は `url_metadata.summary` をフォールバック表示
- 要約文中のキーワードもハイライト対象にする

### ファイル一覧

| File | Change |
|---|---|
| `src/hooks/useSearch.ts` | 検索条件に `url_metadata->>summary` を追加、select に `url_metadata` 追加 |
| `src/components/search/SearchResults.tsx` | Read Later ブロックで要約テキストを表示 |

