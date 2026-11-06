import io
import json
import tempfile
import time
import unittest
import urllib.error
from pathlib import Path
from flowlog_post import send, PostError


class FakeServer:
    def __init__(self, lose_first=False):
        self.requests = []
        self.saved = {}
        self.lose_first = lose_first

    def open(self, request, timeout):
        key = request.get_header("Idempotency-key")
        self.requests.append((key, request.data, request.full_url))
        self.saved.setdefault(key, {"success": True, "data": {"id": str(len(self.saved) + 1), "routed_to": "read_later"}})
        if self.lose_first and len(self.requests) == 1:
            raise urllib.error.URLError("response lost after commit")
        return io.BytesIO(json.dumps(self.saved[key]).encode())


class RaycastTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def call(self, server, **kwargs):
        return send("capture", 'https://example.com/?a="日本語"&b=1', token="fictional", state_dir=self.directory, opener=server, **kwargs)

    def test_lost_response_keeps_key_body_and_one_saved_post(self):
        server = FakeServer(lose_first=True)
        with self.assertRaises(PostError):
            self.call(server)
        result = self.call(server)
        self.assertEqual(len(server.saved), 1)
        self.assertEqual(server.requests[0], server.requests[1])
        self.assertEqual(result["data"]["routed_to"], "read_later")
        self.assertEqual(server.requests[0][2], "https://flowlog.jp/api/capture")

    def test_overlap_reuses_result_but_later_intent_has_a_new_key(self):
        server = FakeServer()
        started = time.time_ns()
        first = self.call(server, invoked_at=started)
        self.assertEqual(first, self.call(server, invoked_at=started))
        self.assertEqual(len(server.requests), 1)
        self.call(server)
        self.assertEqual(len(server.saved), 2)

    def test_corrupt_state_fails_without_posting(self):
        server = FakeServer()
        self.call(server)
        next(self.directory.glob("*.json")).write_text("invalid state")
        with self.assertRaises(PostError):
            self.call(server)
        self.assertEqual(len(server.requests), 1)

    def test_two_command_types_do_not_share_ids(self):
        server = FakeServer()
        self.call(server)
        send("tasks", "fictional task", token="fictional", state_dir=self.directory, opener=server)
        self.assertEqual(len(server.saved), 2)
        self.assertEqual(server.requests[1][2], "https://flowlog.jp/api/tasks")


if __name__ == "__main__":
    unittest.main()
