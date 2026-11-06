#!/usr/bin/env python3
"""Raycast's FlowLog transport: durable post IDs, no credentials on the command line."""
from __future__ import annotations
import fcntl
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API = "https://flowlog.jp/api"
TOKEN_FILE = Path.home() / "Documents/Private/10_sensitive/api-keys/FlowLog.md"
STATE_DIR = Path.home() / "Library/Application Support/FlowLog/Raycast"


class PostError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def read_token():
    try:
        match = re.search(r"^API Token: `([^`]+)`", TOKEN_FILE.read_text(), re.M)
        if match:
            return match.group(1).strip()
    except OSError:
        pass
    raise PostError("FlowLogの認証情報を読み取れません")


def save(path, state):
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".pending-")
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(state, stream, ensure_ascii=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def send(mode, text, *, token=None, state_dir=None, opener=None, invoked_at=None):
    """A repeated invocation after an unknown result reuses the exact post ID."""
    invoked_at = time.time_ns() if invoked_at is None else invoked_at
    if mode not in ("capture", "tasks") or not text.strip():
        raise PostError("登録するURLまたはテキストを入力してください")
    token = token or read_token()
    body = {"text" if mode == "capture" else "content": text.strip(), "source": "raycast"}
    data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
    identity = hashlib.sha256(token.encode()).hexdigest() + mode + data.decode()
    fingerprint = hashlib.sha256(identity.encode()).hexdigest()
    directory = state_dir or STATE_DIR
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = directory / (fingerprint + ".json")
    lock = os.open(directory / (fingerprint + ".lock"), os.O_CREAT | os.O_RDWR, 0o600)
    with os.fdopen(lock, "w") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        try:
            state = json.loads(path.read_text()) if path.exists() else None
        except (OSError, ValueError):
            raise PostError("FlowLogの送信記録を確認できません。新しい投稿は作成していません") from None
        if state is not None and (not isinstance(state, dict) or state.get("status") not in ("pending", "completed")):
            raise PostError("FlowLogの送信記録を確認できません。新しい投稿は作成していません")
        # Overlapping invocations are one operation. A later deliberate invocation
        # after confirmed success receives a new ID, even for identical text.
        if state and state.get("status") == "completed" and state["completed_at"] >= invoked_at:
            return state["result"]
        if not state or state.get("status") == "completed":
            state = {"key": "raycast:" + str(uuid.uuid4()), "status": "pending"}
            save(path, state)
        if not re.fullmatch(r"raycast:[A-Za-z0-9-]+", state.get("key", "")):
            raise PostError("FlowLogの投稿IDを確認できません。新しい投稿は作成していません")
        request = urllib.request.Request(
            API + "/" + mode, data=data, method="POST",
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json",
                     "Idempotency-Key": state["key"], "User-Agent": "FlowLog-Raycast/2.0"},
        )
        opener = opener or urllib.request.build_opener(NoRedirect())
        try:
            with opener.open(request, timeout=20) as response:
                result = json.load(response)
            if not isinstance(result, dict) or result.get("success") is not True or not isinstance(result.get("data"), dict) or not result["data"].get("id"):
                raise ValueError("unconfirmed result")
        except urllib.error.HTTPError as error:
            raise PostError(f"FlowLog送信を確認できません（HTTP {error.code}）。同じ内容で再試行できます") from None
        except (OSError, ValueError, urllib.error.URLError):
            raise PostError("FlowLogの送信結果が未確認です。同じ内容をもう一度実行すると同じ投稿IDで再送します") from None
        state.update(status="completed", result=result, completed_at=time.time_ns())
        save(path, state)
        return result


def main():
    try:
        if len(sys.argv) != 3:
            raise PostError("登録するURLまたはテキストを入力してください")
        result = send(sys.argv[1], sys.argv[2])
        routed = "task" if sys.argv[1] == "tasks" else result["data"].get("routed_to")
        label = {"event": "フロー", "read_later": "あとで", "task": "タスク"}.get(routed, "FlowLog")
        print(f"FlowLog → {label} に登録しました")
    except PostError as error:
        print(str(error))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
