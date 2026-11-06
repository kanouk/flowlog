ALTER TABLE blocks ADD COLUMN event_timing TEXT CHECK(event_timing IS NULL OR json_valid(event_timing));
ALTER TABLE blocks ADD COLUMN timeline_placement TEXT CHECK(timeline_placement IS NULL OR json_valid(timeline_placement));
ALTER TABLE blocks ADD COLUMN content_confirmed_at TEXT;

-- Only the browser's authenticated edit path can stamp a new confirmation.
CREATE TRIGGER block_protect_human_content BEFORE UPDATE OF content ON blocks
WHEN OLD.content_confirmed_at IS NOT NULL AND OLD.content IS NOT NEW.content
 AND OLD.content_confirmed_at IS NEW.content_confirmed_at
BEGIN SELECT RAISE(ABORT,'Protected block content'); END;
CREATE TRIGGER block_protect_human_time BEFORE UPDATE OF occurred_at,event_timing ON blocks
WHEN OLD.time_confirmed_at IS NOT NULL AND OLD.time_confirmed_at IS NEW.time_confirmed_at
 AND (julianday(OLD.occurred_at) IS NOT julianday(NEW.occurred_at)
      OR json_extract(NEW.event_timing,'$.origin')='external' AND OLD.event_timing IS NOT NEW.event_timing)
BEGIN SELECT RAISE(ABORT,'Protected block time'); END;

-- Timing-only answers and drag operations affect diary inputs without rewriting occurred_at.
CREATE TRIGGER diary_block_timing_update AFTER UPDATE OF event_timing,timeline_placement ON blocks
WHEN (OLD.event_timing IS NOT NEW.event_timing OR OLD.timeline_placement IS NOT NEW.timeline_placement)
 AND OLD.content IS NEW.content AND OLD.occurred_at IS NEW.occurred_at
BEGIN
 INSERT INTO diary_generation_jobs(user_id,date,due_at,first_pending_at)
 SELECT e.user_id,e.date,unixepoch()+5,unixepoch() FROM entries e
 WHERE e.id=NEW.entry_id AND e.user_id=NEW.user_id AND NEW.category IN ('event','thought')
 AND EXISTS(SELECT 1 FROM diary_generation_scope s WHERE s.user_id=e.user_id AND s.date=e.date)
 ON CONFLICT(user_id,date) DO UPDATE SET
   generation=generation+1,
   first_pending_at=COALESCE(first_pending_at,unixepoch()),
   due_at=min(unixepoch()+5,COALESCE(first_pending_at,unixepoch())+30),
   status=CASE WHEN status='running' THEN status ELSE 'queued' END,
   attempts=CASE WHEN status='running' THEN attempts ELSE 0 END,error_code=NULL;
 INSERT INTO diary_generation_outbox(user_id,date,generation,due_at)
 SELECT j.user_id,j.date,j.generation,j.due_at FROM diary_generation_jobs j
 JOIN entries e ON e.user_id=j.user_id AND e.date=j.date
 WHERE e.id=NEW.entry_id AND e.user_id=NEW.user_id AND NEW.category IN ('event','thought')
 AND EXISTS(SELECT 1 FROM diary_generation_scope s WHERE s.user_id=e.user_id AND s.date=e.date)
 ON CONFLICT(user_id,date,generation) DO NOTHING;
END;

-- A machine rewrite with no new explicit time invalidates inference from the old text.
CREATE TRIGGER block_invalidate_old_inference AFTER UPDATE OF content ON blocks
WHEN OLD.content IS NOT NEW.content AND OLD.event_timing IS NEW.event_timing
 AND json_extract(OLD.event_timing,'$.origin')='inferred'
BEGIN UPDATE blocks SET event_timing='{"kind":"unknown","origin":"system"}'
 WHERE id=NEW.id AND user_id=NEW.user_id; END;
