# RaycastからFlowLogへ登録

`FlowLogへ` はURLを「あとで」、それ以外のテキストをフローへ登録する。`FlowLogタスクへ` はタスクへ登録する。送信先は `https://flowlog.jp/api`。認証情報はローカルの `~/Documents/Private/10_sensitive/api-keys/FlowLog.md` にある既存のAPI Tokenを読み、スクリプトやコマンドラインへ埋め込まない。

インストール時は、このフォルダーのシェル2本を `~/scripts/`、`flowlog_post.py` を `~/scripts/lib/` へ配置する。既存のスクリプト名・Raycastタイトル・引数を変えずに更新できる。PythonはmacOSの `/usr/bin/python3` と標準ライブラリを使う。

投稿IDを `~/Library/Application Support/FlowLog/Raycast/` に保存し、応答が未確認の間は同じ内容の再実行で再利用する。保存済みの応答を確認した後に改めて実行した場合は、同じテキストでも別の投稿として扱う。重なって実行された同じコマンドは先に完了した結果を共有する。認証情報はこの送信記録へ保存しない。

試験は `python3 scripts/raycast/test_flowlog_post.py`。通信切断後の再送、同時実行相当の重なり、新しい投稿の区別、送信記録の破損を架空の保存先で確認する。
