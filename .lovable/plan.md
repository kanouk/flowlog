# 画像保存先設定: デフォルト / Gyazo 対応プラン

## 目的

- 既存の画像URL保存構造（`blocks.images: string[] / TEXT[]`）は維持する
- 既存の「デフォルト」保存方式はそのまま残す
- 新規アップロード時だけ、ユーザー設定に応じて「デフォルト」または「Gyazo」を使い分ける
- Gyazo API token はフロントエンドへ平文で返さない
- 既存画像は移行せず、デフォルト画像と Gyazo 画像が混在しても表示・編集できるようにする

## 変更ファイル一覧

| 種別 | File | 変更内容 |
|---|---|---|
| DB | `supabase/migrations/...sql` | `user_image_storage_settings` 作成、RLS、安全な取得RPC追加 |
| Edge Function | `supabase/functions/gyazo-upload/index.ts` | Gyazo アップロード用 Function 追加 |
| Edge Function | `supabase/functions/gyazo-delete/index.ts` | Gyazo 削除用 Function 追加 |
| Config | `supabase/config.toml` | 新規 Function の認証設定を追加 |
| Hook | `src/hooks/useImageStorageSettings.ts` | 画像保存先設定の取得・保存・解除 Hook 追加 |
| Hook | `src/hooks/useImageUpload.ts` | 保存先設定に応じたアップロード/削除分岐を追加 |
| UI | `src/components/settings/ImageStorageSettingsSection.tsx` | 「画像保存先」設定UI追加 |
| UI | `src/pages/Settings.tsx` | 設定メニューに「画像保存先」を追加 |

既存の表示コンポーネントは原則変更しません。`<img src={url}>` のURL表示方式を維持します。

## DB設計

### 新規テーブル

`user_image_storage_settings`

| column | type | 方針 |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | 認証ユーザーID。`auth.users` へのFKは張らない |
| `provider` | text | `default` または `gyazo` |
| `gyazo_token` | text nullable | Gyazo token を保存。フロントへSELECTさせない |
| `created_at` / `updated_at` | timestamptz | 監査用 |

### RLS

- RLS を有効化
- `INSERT` / `UPDATE` / `DELETE` は `auth.uid() = user_id`
- `SELECT` ポリシーは作らない、または平文tokenを返さない設計を優先
- フロントからの表示用には safe RPC を使う

### Safe RPC

`get_user_image_storage_settings_safe()` を追加します。

返却値:

```ts
{
  provider: 'default' | 'gyazo',
  has_gyazo_token: boolean,
  gyazo_token_hint: string | null
}
```

- `gyazo_token` 平文は返さない
- 設定行がない場合は `provider = 'default'`, `has_gyazo_token = false` 相当として扱う
- token hint は AI APIキー管理と同様に末尾数文字のみ（例: `****abcd`）

## 設定UI

設定画面に「画像保存先」セクションを追加します。

### 表示文言

- 保存先ラベル:
  - `デフォルト`
  - `Gyazo`
- UI上に `Supabase Storage` という文言は出しません

### 挙動

- `デフォルト` 選択時:
  - Gyazo token 入力欄は非表示
  - 保存すると以後の新規アップロードは現行方式
- `Gyazo` 選択時:
  - Gyazo API token 入力欄を表示
  - token 登録済みなら `****xxxx` のようなヒントを表示
  - 平文tokenは再表示しない
  - tokenを空のまま provider だけ Gyazo にすることは避け、保存時に分かりやすくエラー表示
- token の更新:
  - 新しい token 入力時だけ上書き
- Gyazo解除:
  - token を削除し、保存先を `デフォルト` に戻す操作を用意

## Gyazoアップロード Edge Function

`gyazo-upload`

### 処理

1. `Authorization` ヘッダーでログインユーザーを検証
2. `multipart/form-data` から画像ファイルを取得
3. サーバー側で `user_image_storage_settings` から該当ユーザーの `gyazo_token` を取得
4. token 未設定なら 400/422 系で分かりやすいエラーを返す
5. Gyazo API へ送信

```text
POST https://upload.gyazo.com/api/upload
Authorization: Bearer <user gyazo token>
form-data:
  imagedata: <file>
  access_policy: anyone
```

6. Gyazo レスポンスの `url` を返す
   - 保存対象は `permalink_url` ではなく画像直URL `url`
   - 例: `https://i.gyazo.com/xxxx.png`

### レスポンス例

```json
{
  "url": "https://i.gyazo.com/xxxx.png"
}
```

## Gyazo削除 Edge Function

`gyazo-delete`

### 処理

1. ログインユーザーを検証
2. body で `url` または `image_id` を受け取る
3. `https://i.gyazo.com/<image_id>.<ext>` から `image_id` を抽出
4. サーバー側でユーザーの Gyazo token を取得
5. Gyazo削除APIを呼ぶ
6. 成否を返す

削除に失敗しても、既存挙動に近づけるため、フロント側では編集保存自体を不必要に失敗させません。エラーはログと軽い通知に留めます。

## `useImageUpload.ts` の変更

### アップロード分岐

```text
provider = default
  -> 現行のデフォルトアップロード処理をそのまま使用

provider = gyazo
  -> gyazo-upload Function に multipart/form-data で送信
  -> 返却された Gyazo の画像直URLを blocks.images に保存
```

### Gyazo token 未設定時

- provider が `gyazo` かつ `has_gyazo_token = false` の場合、アップロード前に toast で案内
- 画像アップロードは実行しない

### 削除分岐

```text
URL が既存の block-images のデフォルトURL
  -> 現行の remove 処理

URL が https://i.gyazo.com/... 
  -> gyazo-delete Function 経由で削除

それ以外のURL
  -> 外部URLとして扱い、削除APIは呼ばない
```

これにより、既存画像と Gyazo 画像が混在しても編集時の削除処理が破綻しないようにします。

## OCR連携

- `ocr-image` の入力形式は変更しません
- 画像URL配列を今までどおり渡します
- Gyazo は画像直URL `https://i.gyazo.com/...` を保存するため、既存のURLベースOCR呼び出しと互換性を保ちます

## セキュリティ方針

- Gyazo token は Vite 環境変数やクライアントコードに置かない
- Gyazo token の平文SELECTはフロントからできない設計にする
- フロントが受け取るのは `provider`, `has_gyazo_token`, `gyazo_token_hint` のみ
- Gyazo API 呼び出しは必ず認証済み Edge Function 経由
- Edge Function 側でも `auth.getUser()` でユーザーを検証し、他ユーザーの token を参照しない

## 動作確認観点

1. 既存設定なしのユーザーは保存先が `デフォルト` として動作する
2. `デフォルト` 選択時、現行のアップロード/削除が壊れていない
3. `Gyazo` 選択時のみ token 入力欄が表示される
4. Gyazo token 登録後、画面には平文ではなく末尾ヒントのみ表示される
5. Gyazo選択 + token未設定では、アップロード前に分かりやすいエラーが出る
6. Gyazo選択 + token設定済みで、新規画像が `https://i.gyazo.com/...` として `blocks.images` に保存される
7. 既存のデフォルト画像URLは移行なしで引き続き表示できる
8. デフォルト画像と Gyazo画像が同じブロック内に混在しても表示できる
9. 編集でデフォルト画像を削除すると現行 storage remove が呼ばれる
10. 編集で Gyazo画像を削除すると Gyazo削除Functionが呼ばれる
11. Gyazo削除失敗時も、ブロック編集保存が不必要に失敗しない
12. OCRに Gyazo画像直URLを渡しても既存フローが壊れない
