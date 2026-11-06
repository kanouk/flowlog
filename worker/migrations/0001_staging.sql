-- Isolated FlowLog SQLite schema. Never apply to the Lovable database.
PRAGMA foreign_keys=ON;
CREATE TABLE profiles (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 user_id TEXT NOT NULL,
 display_name TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(user_id)
);
CREATE INDEX profiles_owner ON profiles(user_id);
CREATE TABLE entries (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 user_id TEXT NOT NULL,
 date TEXT NOT NULL DEFAULT (date('now')),
 summary TEXT,
 formatted_content TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 score INTEGER,
 score_details TEXT,
 UNIQUE(user_id,date),
 UNIQUE(id,user_id)
);
CREATE INDEX entries_owner ON entries(user_id);
CREATE TABLE blocks (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 entry_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 content TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 images TEXT DEFAULT '[]',
 category TEXT NOT NULL DEFAULT 'event',
 is_done INTEGER NOT NULL DEFAULT 0,
 done_at TEXT,
 url_metadata TEXT,
 tag TEXT,
 starts_at TEXT,
 ends_at TEXT,
 is_all_day INTEGER DEFAULT 0,
 priority INTEGER DEFAULT 0,
 extracted_text TEXT,
 due_at TEXT,
 due_all_day INTEGER DEFAULT 0,
 source TEXT,
 time_confirmed_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(entry_id,user_id) REFERENCES entries(id,user_id) ON DELETE CASCADE,
 CHECK(category IN ('event','task','schedule','thought','read_later')),
 CHECK(revision > 0),
 CHECK(json_valid(images))
);
CREATE INDEX blocks_owner ON blocks(user_id);
CREATE TABLE custom_tags (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 user_id TEXT NOT NULL,
 name TEXT NOT NULL,
 icon TEXT NOT NULL DEFAULT 'tag',
 color TEXT NOT NULL DEFAULT 'blue',
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX custom_tags_owner ON custom_tags(user_id);
CREATE TABLE user_ai_settings (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 user_id TEXT NOT NULL,
 openai_api_key TEXT,
 anthropic_api_key TEXT,
 google_api_key TEXT,
 selected_provider TEXT NOT NULL DEFAULT 'lovable',
 selected_model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 custom_system_prompt TEXT,
 custom_summarize_prompt TEXT,
 score_enabled INTEGER NOT NULL DEFAULT 0,
 behavior_rules TEXT,
 auto_ocr INTEGER NOT NULL DEFAULT 0,
 day_boundary_hour INTEGER NOT NULL DEFAULT 0,
 UNIQUE(user_id)
);
CREATE INDEX user_ai_settings_owner ON user_ai_settings(user_id);
CREATE TABLE user_ai_models (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 user_id TEXT NOT NULL,
 provider TEXT NOT NULL,
 display_name TEXT NOT NULL,
 model_name TEXT NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1,
 sort_order INTEGER NOT NULL DEFAULT 0,
 note TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 api_key_id TEXT
);
CREATE INDEX user_ai_models_owner ON user_ai_models(user_id);
CREATE TABLE user_ai_feature_settings (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 user_id TEXT NOT NULL,
 feature_key TEXT NOT NULL,
 assigned_model_id TEXT,
 system_prompt TEXT,
 user_prompt_template TEXT,
 enabled INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(user_id,feature_key)
);
CREATE INDEX user_ai_feature_settings_owner ON user_ai_feature_settings(user_id);
CREATE TABLE user_api_tokens (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 user_id TEXT NOT NULL,
 token_hash TEXT NOT NULL,
 name TEXT NOT NULL DEFAULT 'Default',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 last_used_at TEXT
);
CREATE INDEX user_api_tokens_owner ON user_api_tokens(user_id);
CREATE TABLE user_external_tokens (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 user_id TEXT NOT NULL,
 service TEXT NOT NULL,
 token TEXT NOT NULL,
 last_synced_at TEXT,
 created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX user_external_tokens_owner ON user_external_tokens(user_id);

CREATE INDEX blocks_owner_time ON blocks(user_id,occurred_at);
CREATE TABLE event_api_receipts(user_id TEXT NOT NULL,key TEXT NOT NULL,request TEXT NOT NULL,response TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,key));
CREATE TABLE image_manifest (old_url TEXT PRIMARY KEY,object_key TEXT NOT NULL,sha256 TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL);
CREATE TABLE auth_user(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,emailVerified INTEGER NOT NULL DEFAULT 0,image TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
CREATE TABLE auth_session(id TEXT PRIMARY KEY,expiresAt INTEGER NOT NULL,token TEXT NOT NULL UNIQUE,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,ipAddress TEXT,userAgent TEXT,userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE);
CREATE INDEX auth_session_user ON auth_session(userId);
CREATE TABLE auth_account(id TEXT PRIMARY KEY,accountId TEXT NOT NULL,providerId TEXT NOT NULL,userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,accessToken TEXT,refreshToken TEXT,idToken TEXT,accessTokenExpiresAt INTEGER,refreshTokenExpiresAt INTEGER,scope TEXT,password TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
CREATE TABLE auth_verification(id TEXT PRIMARY KEY,identifier TEXT NOT NULL,value TEXT NOT NULL,expiresAt INTEGER NOT NULL,createdAt INTEGER,updatedAt INTEGER);
CREATE INDEX auth_verification_identifier ON auth_verification(identifier);
