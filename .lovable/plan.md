

# タグチップの表示順を最近使った順に修正

## 問題

`FlowInput` は DB から最近使ったタグ順で `topTagIds` を取得しているが、`TagChipSelector` 内で `filteredBaseTags`（ベースタグ）→ `filteredCustomTags`（カスタムタグ）の順に分離レンダリングしているため、元の順序が崩れる。

## 修正

**`src/components/flow/TagChipSelector.tsx`**:
- `filteredBaseTags` と `filteredCustomTags` を別々にレンダリングする代わりに、`allowedTagIds` の順序を保持した統合リストを作成
- 各タグIDに対し、ベースタグか カスタムタグかを判定してレンダリング
- これにより `topTagIds` の順序（= 最近使った順）がそのまま UI に反映される

| File | Change |
|---|---|
| `src/components/flow/TagChipSelector.tsx` | タグを統合リストで順序通りにレンダリング |

