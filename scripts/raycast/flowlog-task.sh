#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title FlowLogタスクへ
# @raycast.mode silent
#
# Optional parameters:
# @raycast.icon ✅
# @raycast.packageName FlowLog
# @raycast.argument1 { "type": "text", "placeholder": "タスクとして登録" }

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
exec /usr/bin/python3 "$SCRIPT_DIR/lib/flowlog_post.py" tasks "${1:-}"
