-- Match the original content/photo and relational invariants for all callers.
CREATE TRIGGER block_content_insert BEFORE INSERT ON blocks WHEN (NEW.content IS NULL OR NEW.content='') AND (NEW.images IS NULL OR json_array_length(NEW.images)=0) BEGIN SELECT RAISE(ABORT,'Content or images required'); END;
CREATE TRIGGER block_content_update BEFORE UPDATE ON blocks WHEN (NEW.content IS NULL OR NEW.content='') AND (NEW.images IS NULL OR json_array_length(NEW.images)=0) BEGIN SELECT RAISE(ABORT,'Content or images required'); END;
CREATE TRIGGER block_images_insert BEFORE INSERT ON blocks WHEN NEW.images IS NOT NULL AND (json_type(NEW.images)<>'array' OR json_array_length(NEW.images)>5) BEGIN SELECT RAISE(ABORT,'At most five image attachments'); END;
CREATE TRIGGER block_images_update BEFORE UPDATE ON blocks WHEN NEW.images IS NOT NULL AND (json_type(NEW.images)<>'array' OR json_array_length(NEW.images)>5) BEGIN SELECT RAISE(ABORT,'At most five image attachments'); END;
CREATE TRIGGER deleted_ai_key AFTER DELETE ON user_ai_api_keys BEGIN UPDATE user_ai_models SET api_key_id=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE api_key_id=OLD.id AND user_id=OLD.user_id; END;
CREATE TRIGGER deleted_ai_model AFTER DELETE ON user_ai_models BEGIN UPDATE user_ai_feature_settings SET assigned_model_id=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE assigned_model_id=OLD.id AND user_id=OLD.user_id; END;
CREATE UNIQUE INDEX oauth_code_unique ON oauth_authorization_codes(code);
