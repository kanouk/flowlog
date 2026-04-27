# Gyazo APIキー保存失敗の修正プラン

## 原因見立て

現在の実装では、Gyazo token を `user_image_storage_settings` テーブルへフロントエンドから直接 `upsert` しています。

ただしこのテーブルは token を含む機密テーブルとして `SELECT` を禁止しており、`upsert(..., { onConflict: 'user_id' })` は既存行との競合判定・返却処理の都合で RLS / 権限に引っかかりやすい構成です。そのため、UI側では汎用エラー「画像保存先の保存に失敗しました」が表示されます。

また、現状は token 保存ロジックがクライアント側の通常テーブル操作になっており、「平文tokenをフロントへ返さない」設計は満たしていますが、保存経路としてはより安全にサーバー側関数へ寄せるのが適切です。

## 修正方針

Gyazo token の保存・解除を、フロントエンドからの直接 `upsert` ではなく Lovable Cloud の backend function 経由に変更します。

```text
Settings UI
  -> save-image-storage-settings backend function
      -> 認証ユーザー確認
      -> service権限で user_image_storage_settings を upsert
      -> tokenはレスポンスに含めない
  -> get_user_image_storage_settings_safe RPC で安全情報のみ再取得
```

## 変更ファイル

| File | Change |
|---|---|
| `supabase/functions/save-image-storage-settings/index.ts` | 新規追加。provider / Gyazo token 保存・解除をサーバー側で実行 |
| `src/hooks/useImageStorageSettings.ts` | 直接 `from('user_image_storage_settings').upsert()` をやめ、backend function 呼び出しに変更 |
| `supabase/config.toml` | 必要な場合のみ、新規 function の設定ブロックを追加 |

## backend function の仕様

### Request

```json
{
  "provider": "default" | "gyazo",
  "gyazo_token": "optional string",
  "clear_gyazo_token": true | false
}
```

### 保存ルール

- 未ログインなら `401`
- `provider` が `default` / `gyazo` 以外なら `400`
- `provider = "gyazo"` かつ既存tokenも新規tokenもない場合は `422`
- `provider = "gyazo"` で token 入力ありなら保存
- `provider = "gyazo"` で token 入力なし、既存tokenありなら token は保持したまま provider だけ保存
- `provider = "default"` の場合は provider を default に戻す
- 「解除」操作では `clear_gyazo_token: true` として token も削除
- レスポンスには token 本体を一切含めない

### Response

```json
{
  "success": true
}
```

エラー時も token や内部詳細は返さず、詳細はサーバーログに残します。

## フロントエンド修正

`useImageStorageSettings.ts` の以下を変更します。

- `saveSettings()`
  - 現在の `supabase.from('user_image_storage_settings').upsert(...)` を削除
  - `supabase.functions.invoke('save-image-storage-settings', { body: ... })` に変更
  - 成功後は既存どおり `get_user_image_storage_settings_safe()` で再取得

- `resetToDefault()`
  - 同じ backend function を呼び、`provider: 'default'`, `clear_gyazo_token: true` を送る

UI文言は維持します。

- 「デフォルト」表示のまま
- 「Supabase Storage」という文言は出さない
- Gyazo token は入力時のみ送信し、再表示しない

## DB変更

新しいテーブル・カラムは追加しません。
既存の `user_image_storage_settings` と `get_user_image_storage_settings_safe()` をそのまま使います。

必要に応じて migration は追加せず、Edge Function / フロントエンド修正のみで対応します。

## 動作確認観点

1. Gyazo を選択し token を入力して保存できる
2. 保存後、設定取得結果が `provider: "gyazo"`, `has_gyazo_token: true` になる
3. UIには token 本体ではなく `****xxxx` のようなヒントだけが表示される
4. token 入力なしで Gyazo を再保存しても既存tokenが消えない
5. 「解除」で provider が「デフォルト」に戻り、Gyazo token が削除される
6. Gyazo 選択後の新規画像アップロードが `https://i.gyazo.com/...` の直URLを `blocks.images` に保存する
7. 既存のデフォルト保存画像URLは引き続き表示・削除できる
8. エラー時に token や内部詳細がレスポンス・UIに露出しない