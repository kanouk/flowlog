-- Full function migration. Staging D1 only.
CREATE TABLE IF NOT EXISTS user_ai_api_keys (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 user_id TEXT NOT NULL,
 provider TEXT NOT NULL,
 name TEXT NOT NULL,
 api_key TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS user_image_storage_settings (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 user_id TEXT NOT NULL,
 provider TEXT NOT NULL DEFAULT 'default',
 gyazo_token TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(user_id)
);
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 user_id TEXT NOT NULL,
 code TEXT NOT NULL,
 code_challenge TEXT,
 code_challenge_method TEXT,
 redirect_uri TEXT NOT NULL,
 client_id TEXT NOT NULL,
 scope TEXT,
 state TEXT,
 expires_at TEXT NOT NULL,
 created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
