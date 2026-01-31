
# グローバル検索機能の実装

## 概要
ヘッダーに配置するグローバル検索バーを実装し、過去のフローログ（ブロック）とストックログ（日記）の両方を横断検索できる機能を追加します。

## 検索対象

| 対象 | テーブル | カラム |
|------|----------|--------|
| ブロック | `blocks` | `content` |
| 日記 | `entries` | `formatted_content`, `summary` |

## UI設計

### ヘッダー検索バー
- 虫眼鏡アイコン付きの検索入力フィールド
- モバイル: アイコンのみ表示 → タップで検索モーダル展開
- デスクトップ: 常時表示の検索バー（幅調整）

```text
┌─────────────────────────────────────────────────────────────┐
│ [Logo] FlowLog        [🔍 検索...]         [⚙️] [🚪]        │
└─────────────────────────────────────────────────────────────┘
```

### 検索結果表示
- インクリメンタル検索（入力から300ms後に検索実行）
- ドロップダウン形式で結果を表示（最大20件）
- 結果クリックで該当日付のFlow/Stockに遷移

### 結果のグルーピング

```text
┌────────────────────────────────────────────┐
│ 🔍 「会議」の検索結果                        │
├────────────────────────────────────────────┤
│ ■ ブロック (5件)                            │
│   ├─ 📅 1/28 会議の資料を作成した...          │
│   ├─ 📝 1/25 チーム会議のメモ...              │
│   └─ ✅ 1/24 会議室を予約する                 │
├────────────────────────────────────────────┤
│ ■ 日記 (2件)                               │
│   ├─ 📖 1/28 午前中は会議の準備に追われた...    │
│   └─ 📖 1/25 チーム会議で新プロジェクトの...    │
└────────────────────────────────────────────┘
```

---

## 技術設計

### 1. データベース検索

PostgreSQLの `ILIKE` を使用した部分一致検索を実装します。

```sql
-- ブロック検索
SELECT * FROM blocks
WHERE user_id = auth.uid()
  AND content ILIKE '%検索キーワード%'
ORDER BY occurred_at DESC
LIMIT 10;

-- 日記検索
SELECT * FROM entries
WHERE user_id = auth.uid()
  AND (
    formatted_content ILIKE '%検索キーワード%'
    OR summary ILIKE '%検索キーワード%'
  )
ORDER BY date DESC
LIMIT 10;
```

### 2. 新規フック: `useSearch.ts`

```typescript
interface SearchResult {
  blocks: Block[];
  entries: Entry[];
}

function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  
  // デバウンス付き検索
  const search = useCallback(async (searchQuery: string) => {
    // ブロックと日記を並行検索
  }, []);
  
  return { query, setQuery, results, loading, search };
}
```

### 3. 新規コンポーネント

| ファイル | 役割 |
|----------|------|
| `src/components/search/SearchBar.tsx` | 検索入力UI |
| `src/components/search/SearchResults.tsx` | 検索結果ドロップダウン |
| `src/hooks/useSearch.ts` | 検索ロジック |

### 4. Dashboard.tsx への統合

ヘッダーに `SearchBar` コンポーネントを追加し、検索結果からの遷移をハンドリングします。

---

## 実装手順

| # | 内容 |
|---|------|
| 1 | `useSearch.ts` フックを作成（ブロック・日記の検索ロジック） |
| 2 | `SearchBar.tsx` コンポーネントを作成（検索入力UI） |
| 3 | `SearchResults.tsx` コンポーネントを作成（結果表示） |
| 4 | `Dashboard.tsx` のヘッダーに検索バーを統合 |
| 5 | 検索結果クリックで該当日付への遷移を実装 |

---

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/hooks/useSearch.ts` | 新規作成 - 検索ロジック |
| `src/components/search/SearchBar.tsx` | 新規作成 - 検索入力UI |
| `src/components/search/SearchResults.tsx` | 新規作成 - 結果ドロップダウン |
| `src/pages/Dashboard.tsx` | ヘッダーに検索バー追加 |

