# REST API - 実装完了 ✓

## ベースURL
```
https://wdvwnbeofakzihmjacko.supabase.co/functions/v1/api
```

## 認証
```
Authorization: Bearer <your-api-token>
```

## エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/health` | ヘルスチェック |
| `GET` | `/events` | 出来事一覧 |
| `POST` | `/events` | 出来事追加 |
| `GET` | `/tasks` | タスク一覧 |
| `POST` | `/tasks` | タスク追加 |
| `PATCH` | `/tasks/:id/complete` | タスク完了/未完了 |
| `PATCH` | `/tasks/:id/priority` | タスク優先度変更 |
| `GET` | `/schedules` | 予定一覧 |
| `POST` | `/schedules` | 予定追加 |
| `GET` | `/memos` | メモ一覧 |
| `POST` | `/memos` | メモ追加 |
| `GET` | `/read-later` | あとで読む一覧 |
| `POST` | `/read-later` | あとで読む追加 |
| `PATCH` | `/read-later/:id/read` | 既読/未読 |
| `GET` | `/search` | 検索 |
| `GET` | `/entries/:date` | 日記取得 |
| `PATCH` | `/blocks/:id` | ブロック更新 |
| `DELETE` | `/blocks/:id` | ブロック削除 |

---

## 使用例

### タスク一覧
```bash
curl -X GET "https://wdvwnbeofakzihmjacko.supabase.co/functions/v1/api/tasks" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

### タスク追加
```bash
curl -X POST "https://wdvwnbeofakzihmjacko.supabase.co/functions/v1/api/tasks" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "買い物に行く", "priority": 2}'
```

### 検索
```bash
curl -X GET "https://wdvwnbeofakzihmjacko.supabase.co/functions/v1/api/search?query=会議" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```
