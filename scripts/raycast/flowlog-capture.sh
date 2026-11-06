#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title FlowLogへ
# @raycast.mode silent
#
# Optional parameters:
# @raycast.icon 🌀
# @raycast.packageName FlowLog
# @raycast.argument1 { "type": "text", "placeholder": "ひとこと（URLならあとで行き）" }

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
exec /usr/bin/python3 "$SCRIPT_DIR/lib/flowlog_post.py" capture "${1:-}"
