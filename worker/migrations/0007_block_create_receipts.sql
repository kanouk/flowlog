-- Receipts are retained after edits/deletions: replay must never recreate a deleted post.
CREATE TABLE block_create_receipts (
 user_id TEXT NOT NULL,
 key TEXT NOT NULL,
 request TEXT NOT NULL,
 response TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(user_id,key)
);
