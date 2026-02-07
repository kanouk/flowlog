
# REST API ドキュメントの追加

## 概要
REST APIを外部から簡単に利用できるよう、2つの形式でドキュメントを提供します：
1. **設定画面にREST APIセクションを追加** - ユーザーがすぐに確認できるUI
2. **エンドポイント `/api/docs` で仕様を返す** - プログラマブルなアクセス用

---

## 1. 設定画面の拡張

### McpSettingsSectionをAPI統合セクションに拡張

現在の「MCP連携」セクションを拡張し、REST APIのドキュメントも表示：

```text
┌─────────────────────────────────────────────────────────┐
│  🔌 API連携                                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  APIトークン                                            │
│  ┌─────────────────────────────────────┐  [新規作成]   │
│  │ Claude Code  作成: 2日前            │               │
│  └─────────────────────────────────────┘               │
│                                                         │
│  ▼ MCP接続方法                                         │
│    接続URL: https://...                                 │
│    設定例、利用可能なツール...                          │
│                                                         │
│  ▼ REST API                                   [NEW]    │
│    ベースURL: https://.../functions/v1/api              │
│    使用例（curl）                                       │
│    エンドポイント一覧                                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/components/settings/McpSettingsSection.tsx` | REST APIドキュメントセクションを追加 |
| `supabase/functions/api/index.ts` | `/docs` エンドポイント追加（JSON仕様返却） |
| `src/pages/Settings.tsx` | セクション名を「MCP連携」→「API連携」に変更 |

---

## 3. REST APIドキュメントUI（新規追加）

### 接続方法セクション内に追加

```tsx
<Collapsible>
  <CollapsibleTrigger>
    <span>REST API</span>
    <ChevronDown />
  </CollapsibleTrigger>
  <CollapsibleContent>
    {/* ベースURL */}
    <div>
      <div className="text-sm font-medium">ベースURL</div>
      <code>{REST_API_URL}</code>
      <Button onClick={copy}>コピー</Button>
    </div>

    {/* curl使用例 */}
    <div>
      <div className="text-sm font-medium">使用例（タスク一覧取得）</div>
      <pre>
        curl -X GET "{REST_API_URL}/tasks" \
          -H "Authorization: Bearer YOUR_API_TOKEN"
      </pre>
    </div>

    {/* エンドポイント一覧テーブル */}
    <div>
      <div className="text-sm font-medium">エンドポイント一覧</div>
      <table>
        <tr><td>GET</td><td>/events</td><td>出来事一覧</td></tr>
        <tr><td>POST</td><td>/events</td><td>出来事追加</td></tr>
        <tr><td>GET</td><td>/tasks</td><td>タスク一覧</td></tr>
        ...
      </table>
    </div>
  </CollapsibleContent>
</Collapsible>
```

---

## 4. /api/docs エンドポイント

外部ツールがAPIスキーマを取得できるよう、エンドポイント仕様をJSONで返却：

```typescript
app.get("/docs", (c) => {
  return c.json({
    name: "FlowLog REST API",
    version: "1.0.0",
    baseUrl: `${supabaseUrl}/functions/v1/api`,
    authentication: {
      type: "Bearer",
      header: "Authorization",
      description: "APIトークンをBearer形式で指定"
    },
    endpoints: [
      {
        method: "GET",
        path: "/events",
        description: "出来事一覧を取得",
        parameters: [
          { name: "date", type: "string", required: false, description: "日付 (YYYY-MM-DD)" },
          { name: "limit", type: "number", required: false, description: "取得件数 (デフォルト: 50)" }
        ]
      },
      // ... 全エンドポイント
    ]
  });
});
```

---

## 5. UIデザイン詳細

### エンドポイント一覧の表示

コンパクトなテーブル形式：

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/events` | 出来事一覧 |
| `POST` | `/events` | 出来事追加 |
| `GET` | `/tasks` | タスク一覧 |
| `POST` | `/tasks` | タスク追加 |
| `PATCH` | `/tasks/:id/complete` | 完了/未完了 |
| `PATCH` | `/tasks/:id/priority` | 優先度変更 |
| ... | ... | ... |

### カラーコード

- `GET` → 緑バッジ
- `POST` → 青バッジ
- `PATCH` → 黄バッジ
- `DELETE` → 赤バッジ

---

## 6. 実装順序

1. Settings.tsxのセクション名変更（MCP連携 → API連携）
2. McpSettingsSection.tsxにREST APIドキュメントを追加
3. api/index.tsに `/docs` エンドポイントを追加
4. デプロイ・動作確認

---

## 7. 完成イメージ

### 設定画面

```text
┌───────────────────────────────────────────────────────────┐
│  設定                                                     │
├───────────────────────────────────────────────────────────┤
│  タグ管理                                                 │
│  今日の得点                                               │
│  生成AI設定                                               │
│  API連携 ←─────── 名前変更                               │
│  アカウント                                               │
└───────────────────────────────────────────────────────────┘
```

### API連携セクション

```text
┌───────────────────────────────────────────────────────────┐
│  🔌 API連携                                               │
│                                                           │
│  FlowLogのデータに外部からアクセスできます。              │
│                                                           │
│  ──────────────────────────────────────────────           │
│  🔑 APIトークン                          [新規作成]       │
│  ┌────────────────────────────────────────────┐          │
│  │ Claude Code  作成: 2日前  最終使用: 1時間前 │ 🗑       │
│  └────────────────────────────────────────────┘          │
│  ──────────────────────────────────────────────           │
│                                                           │
│  ▼ MCP接続方法                                           │
│     (既存のMCPドキュメント)                               │
│                                                           │
│  ▼ REST API                                              │
│     ベースURL                                             │
│     ┌──────────────────────────────────┐ [コピー]        │
│     │ https://.../functions/v1/api     │                 │
│     └──────────────────────────────────┘                 │
│                                                           │
│     使用例                                                │
│     ┌──────────────────────────────────────────┐         │
│     │ curl -X GET ".../api/tasks" \            │ [コピー] │
│     │   -H "Authorization: Bearer TOKEN"       │         │
│     └──────────────────────────────────────────┘         │
│                                                           │
│     エンドポイント一覧                                    │
│     ┌──────┬─────────────────────┬────────────┐         │
│     │ GET  │ /events             │ 出来事一覧 │         │
│     │ POST │ /events             │ 出来事追加 │         │
│     │ GET  │ /tasks              │ タスク一覧 │         │
│     │ ...  │ ...                 │ ...        │         │
│     └──────┴─────────────────────┴────────────┘         │
│                                                           │
│     📄 詳細ドキュメント: /api/docs                        │
│                                                           │
└───────────────────────────────────────────────────────────┘
```
