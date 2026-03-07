

# OpenAPI (openapi.json) 生成

## 概要
既存の `/api/docs` エンドポイントの情報をベースに、OpenAPI 3.0.3 仕様の `openapi.json` を静的ファイルとして作成し、`/api/openapi.json` エンドポイントから配信する。

## 変更内容

### 1. `public/openapi.json` を作成
- OpenAPI 3.0.3 準拠のJSON仕様ファイル
- 全18エンドポイント（GET/POST/PATCH/DELETE）を定義
- Bearer Token認証スキーマ（`securitySchemes`）
- リクエストボディ・クエリパラメータ・パスパラメータのスキーマ定義
- レスポンススキーマ（Block, Entry, Success/Error）
- `servers` にAPI Base URLを設定

### 2. `supabase/functions/api/index.ts` に `/openapi.json` エンドポイント追加
- `GET /openapi.json` を認証不要で追加
- `public/openapi.json` の内容をインラインで返す（Edge FunctionからはファイルシステムにアクセスできないためJSON直接定義）

### エンドポイント一覧（openapi.json に含まれるもの）
| Method | Path | 認証 |
|---|---|---|
| GET | /health | 不要 |
| GET | /docs | 不要 |
| GET | /openapi.json | 不要 |
| GET | /events | 必要 |
| POST | /events | 必要 |
| GET | /tasks | 必要 |
| POST | /tasks | 必要 |
| PATCH | /tasks/{id}/complete | 必要 |
| PATCH | /tasks/{id}/priority | 必要 |
| GET | /schedules | 必要 |
| POST | /schedules | 必要 |
| GET | /memos | 必要 |
| POST | /memos | 必要 |
| GET | /read-later | 必要 |
| POST | /read-later | 必要 |
| PATCH | /read-later/{id}/read | 必要 |
| GET | /search | 必要 |
| GET | /entries/{date} | 必要 |
| PATCH | /blocks/{id} | 必要 |
| DELETE | /blocks/{id} | 必要 |

### 変更ファイル
| ファイル | 内容 |
|---|---|
| `supabase/functions/api/index.ts` | `/openapi.json` エンドポイント追加（OpenAPI仕様JSONをインラインで返す） |

