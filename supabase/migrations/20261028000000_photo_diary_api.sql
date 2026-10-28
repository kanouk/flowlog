-- Additive migration. No diary text, dates, images or formatting settings are rewritten.
ALTER TABLE public.blocks ADD COLUMN revision bigint NOT NULL DEFAULT 1;

CREATE FUNCTION public.bump_block_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bump_block_revision BEFORE UPDATE ON public.blocks
FOR EACH ROW EXECUTE FUNCTION public.bump_block_revision();
REVOKE ALL ON FUNCTION public.bump_block_revision() FROM PUBLIC, anon, authenticated;

-- Durable receipts intentionally survive deletion of the created block. No TTL:
-- an old retry must never silently become a new post. Stored responses are private.
CREATE TABLE public.event_api_receipts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 128),
  request jsonb NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
ALTER TABLE public.event_api_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_api_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.event_api_receipts TO service_role;

-- Only the API's service client may call this; p_user_id comes from the hashed
-- bearer token lookup, never from client JSON. SECURITY INVOKER deliberately.
CREATE FUNCTION public.create_event_api(p_user_id uuid, p_request jsonb, p_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  receipt public.event_api_receipts%ROWTYPE;
  result jsonb;
  event public.blocks%ROWTYPE;
  target_entry uuid;
  boundary_hour integer;
  event_time timestamptz;
  life_date date;
BEGIN
  IF p_key IS NOT NULL THEN
    INSERT INTO public.event_api_receipts(user_id, key, request)
    VALUES (p_user_id, p_key, p_request) ON CONFLICT DO NOTHING;
    -- Concurrent retries wait here (or at the unique INSERT) for the first commit.
    SELECT * INTO STRICT receipt FROM public.event_api_receipts
    WHERE user_id = p_user_id AND key = p_key FOR UPDATE;
    IF receipt.request IS DISTINCT FROM p_request THEN
      RAISE EXCEPTION 'Idempotency-Key already used with a different request' USING ERRCODE = 'PT409';
    END IF;
    IF receipt.response IS NOT NULL THEN
      RETURN receipt.response || '{"replayed": true}'::jsonb;
    END IF;
  END IF;

  event_time := COALESCE((p_request->>'occurred_at')::timestamptz, now());
  SELECT day_boundary_hour INTO boundary_hour FROM public.user_ai_settings WHERE user_id = p_user_id;
  life_date := ((event_time AT TIME ZONE 'Asia/Tokyo') - make_interval(hours => COALESCE(boundary_hour, 0)))::date;
  INSERT INTO public.entries(user_id, date) VALUES (p_user_id, life_date) ON CONFLICT DO NOTHING;
  SELECT id INTO STRICT target_entry FROM public.entries WHERE user_id = p_user_id AND date = life_date;

  INSERT INTO public.blocks(user_id, entry_id, category, content, occurred_at, tag, source, images)
  VALUES (p_user_id, target_entry, 'event', p_request->>'content', event_time,
    p_request->>'tag', p_request->>'source',
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_request->'images', '[]'::jsonb))))
  RETURNING * INTO event;
  result := jsonb_build_object('block', to_jsonb(event), 'date', life_date, 'replayed', false);
  IF p_key IS NOT NULL THEN
    UPDATE public.event_api_receipts SET response = result WHERE user_id = p_user_id AND key = p_key;
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_event_api(uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_event_api(uuid, jsonb, text) TO service_role;

-- Snapshot comparison and update are one SQL statement. Binding the full text
-- through JSON avoids PostgREST/proxy query URL size limits for long diaries.
CREATE FUNCTION public.update_block_api(p_user_id uuid, p_block_id uuid, p_expected jsonb, p_updates jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  WITH expected AS (
    SELECT * FROM jsonb_populate_record(NULL::public.blocks, p_expected)
  ), changes AS (
    SELECT * FROM jsonb_populate_record(NULL::public.blocks, p_updates)
  ), updated AS (
    UPDATE public.blocks b SET
      content = CASE WHEN p_updates ? 'content' THEN c.content ELSE b.content END,
      tag = CASE WHEN p_updates ? 'tag' THEN c.tag ELSE b.tag END,
      occurred_at = CASE WHEN p_updates ? 'occurred_at' THEN c.occurred_at ELSE b.occurred_at END,
      priority = CASE WHEN p_updates ? 'priority' THEN c.priority ELSE b.priority END,
      is_done = CASE WHEN p_updates ? 'is_done' THEN c.is_done ELSE b.is_done END,
      done_at = CASE WHEN p_updates ? 'done_at' THEN c.done_at ELSE b.done_at END,
      starts_at = CASE WHEN p_updates ? 'starts_at' THEN c.starts_at ELSE b.starts_at END,
      ends_at = CASE WHEN p_updates ? 'ends_at' THEN c.ends_at ELSE b.ends_at END,
      is_all_day = CASE WHEN p_updates ? 'is_all_day' THEN c.is_all_day ELSE b.is_all_day END,
      due_at = CASE WHEN p_updates ? 'due_at' THEN c.due_at ELSE b.due_at END,
      due_all_day = CASE WHEN p_updates ? 'due_all_day' THEN c.due_all_day ELSE b.due_all_day END,
      images = CASE WHEN p_updates ? 'images' THEN c.images ELSE b.images END
    FROM expected e, changes c
    WHERE b.id = p_block_id AND b.user_id = p_user_id
      AND b.revision = e.revision AND b.entry_id = e.entry_id
      AND b.occurred_at = e.occurred_at
      AND b.content IS NOT DISTINCT FROM e.content
      AND b.images IS NOT DISTINCT FROM e.images
    RETURNING b.*
  ) SELECT to_jsonb(updated) FROM updated;
$$;
REVOKE ALL ON FUNCTION public.update_block_api(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_block_api(uuid, uuid, jsonb, jsonb) TO service_role;
