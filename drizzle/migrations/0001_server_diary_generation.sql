-- Issue #8: durable per-life-day jobs. No backfill and DISABLED on installation.
CREATE TABLE public.diary_generation_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  all_users boolean NOT NULL DEFAULT false,
  allowed_user_ids uuid[] NOT NULL DEFAULT '{}',
  max_calls_per_day integer NOT NULL DEFAULT 20 CHECK (max_calls_per_day BETWEEN 1 AND 200)
);
REVOKE ALL ON public.diary_generation_control FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.diary_generation_control TO service_role;
ALTER TABLE public.diary_generation_control ENABLE ROW LEVEL SECURITY;
INSERT INTO public.diary_generation_control DEFAULT VALUES;

CREATE TABLE public.diary_generation_jobs (
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  date date NOT NULL,
  generation bigint NOT NULL DEFAULT 1,
  saved_generation bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','disabled')),
  first_pending_at timestamptz DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  claimed_generation bigint,
  claimed_input jsonb,
  input_hash text,
  saved_hash text,
  force_generation boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  calls integer NOT NULL DEFAULT 0,
  call_window date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  error_code text,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,date)
);
REVOKE ALL ON public.diary_generation_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.diary_generation_jobs TO service_role;
ALTER TABLE public.diary_generation_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX diary_generation_due ON public.diary_generation_jobs(due_at) WHERE status IN ('queued','running');

CREATE TABLE public.diary_generation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  date date NOT NULL,
  generation bigint NOT NULL,
  previous_entry jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.diary_generation_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.diary_generation_history TO service_role;
ALTER TABLE public.diary_generation_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX diary_generation_history_day ON public.diary_generation_history(user_id,date,created_at DESC);

CREATE FUNCTION public.diary_generation_active(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((SELECT enabled AND (all_users OR p_user_id=ANY(allowed_user_ids))
    FROM public.diary_generation_control WHERE singleton),false)
    AND COALESCE((SELECT enabled FROM public.user_ai_feature_settings
      WHERE user_id=p_user_id AND feature_key='diary_format'),true);
$$;

CREATE FUNCTION public.diary_life_date(p_user_id uuid,p_time timestamptz) RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT ((p_time AT TIME ZONE 'Asia/Tokyo') - make_interval(hours => COALESCE(
    (SELECT day_boundary_hour FROM public.user_ai_settings WHERE user_id=p_user_id),0)))::date;
$$;

CREATE FUNCTION public.enqueue_diary_generation(p_user_id uuid,p_date date,p_force boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.diary_generation_active(p_user_id) OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=p_user_id) THEN RETURN; END IF;
  IF p_force AND EXISTS (SELECT 1 FROM public.diary_generation_jobs WHERE user_id=p_user_id AND date=p_date AND status IN ('queued','running')) THEN RETURN; END IF;
  INSERT INTO public.diary_generation_jobs(user_id,date,due_at,force_generation)
    VALUES(p_user_id,p_date,clock_timestamp()+interval '5 seconds',p_force)
  ON CONFLICT(user_id,date) DO UPDATE SET
    generation=diary_generation_jobs.generation+1,
    first_pending_at=COALESCE(diary_generation_jobs.first_pending_at,clock_timestamp()),
    due_at=LEAST(clock_timestamp()+interval '5 seconds',
      COALESCE(diary_generation_jobs.first_pending_at,clock_timestamp())+interval '30 seconds'),
    status=CASE WHEN diary_generation_jobs.status='running' THEN 'running' ELSE 'queued' END,
    force_generation=diary_generation_jobs.force_generation OR p_force,
    attempts=CASE WHEN diary_generation_jobs.status='running' THEN diary_generation_jobs.attempts ELSE 0 END,
    error_code=NULL,updated_at=clock_timestamp();
END;
$$;

CREATE FUNCTION public.queue_diary_on_block_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_day date; new_day date;
BEGIN
  -- Ignore no-ops and fields never used by the diary generator (including revision).
  IF TG_OP='UPDATE' AND ROW(OLD.user_id,OLD.content,OLD.images,OLD.occurred_at,OLD.category,
      OLD.is_done,OLD.done_at,OLD.due_at,OLD.due_all_day)
    IS NOT DISTINCT FROM ROW(NEW.user_id,NEW.content,NEW.images,NEW.occurred_at,NEW.category,
      NEW.is_done,NEW.done_at,NEW.due_at,NEW.due_all_day) THEN RETURN NULL; END IF;
  IF TG_OP<>'INSERT' AND OLD.category='event' THEN
    old_day:=public.diary_life_date(OLD.user_id,OLD.occurred_at);
  END IF;
  IF TG_OP<>'DELETE' AND NEW.category='event' THEN
    new_day:=public.diary_life_date(NEW.user_id,NEW.occurred_at);
  END IF;
  -- Stable lock order when a block moves between life days.
  IF old_day IS NOT NULL AND (new_day IS NULL OR old_day<=new_day) THEN
    PERFORM public.enqueue_diary_generation(OLD.user_id,old_day);
    IF new_day IS NOT NULL AND (new_day<>old_day OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN PERFORM public.enqueue_diary_generation(NEW.user_id,new_day); END IF;
  ELSE
    IF new_day IS NOT NULL THEN PERFORM public.enqueue_diary_generation(NEW.user_id,new_day); END IF;
    IF old_day IS NOT NULL AND (old_day<>new_day OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN PERFORM public.enqueue_diary_generation(OLD.user_id,old_day); END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER queue_diary_on_block_change AFTER INSERT OR UPDATE OR DELETE ON public.blocks
FOR EACH ROW EXECUTE FUNCTION public.queue_diary_on_block_change();

-- No API keys or generated prose are placed in the source fingerprint.
CREATE FUNCTION public.diary_generation_input(p_user_id uuid,p_date date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH boundary AS (SELECT COALESCE((SELECT day_boundary_hour FROM public.user_ai_settings WHERE user_id=p_user_id),0) h),
  bounds AS (SELECT (p_date::timestamp+make_interval(hours=>h)) AT TIME ZONE 'Asia/Tokyo' lo,
    ((p_date+1)::timestamp+make_interval(hours=>h)) AT TIME ZONE 'Asia/Tokyo' hi,h FROM boundary)
  SELECT jsonb_build_object('date',p_date,'dayBoundaryHour',bounds.h,
    'blocks',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',b.id,'content',b.content,
      'occurred_at',b.occurred_at,'images',b.images,'category',b.category,'is_done',b.is_done,
      'done_at',b.done_at,'due_at',b.due_at,'due_all_day',b.due_all_day) ORDER BY b.occurred_at,b.id)
      FROM public.blocks b WHERE b.user_id=p_user_id AND b.category='event' AND b.occurred_at>=bounds.lo AND b.occurred_at<bounds.hi),'[]'::jsonb),
    'score_feature',COALESCE((SELECT to_jsonb(s) FROM public.user_ai_feature_settings s WHERE s.user_id=p_user_id AND s.feature_key='score_evaluation'),'{}'::jsonb),
    'feature',COALESCE((SELECT to_jsonb(s) FROM public.user_ai_feature_settings s
      WHERE s.user_id=p_user_id AND s.feature_key='diary_format'),'{}'::jsonb),
    'models',COALESCE((SELECT jsonb_agg(to_jsonb(m)-'api_key' ORDER BY m.id)
      FROM public.user_ai_models m WHERE m.user_id=p_user_id),'[]'::jsonb),
    'key_versions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',k.id,'updated_at',k.updated_at) ORDER BY k.id)
      FROM public.user_ai_api_keys k WHERE k.user_id=p_user_id),'[]'::jsonb),
    'entry',(SELECT jsonb_build_object('id',e.id,'formatted_content',e.formatted_content,'summary',e.summary,
      'score',e.score,'score_details',e.score_details,'updated_at',e.updated_at)
      FROM public.entries e WHERE e.user_id=p_user_id AND e.date=p_date)) FROM bounds;
$$;

CREATE FUNCTION public.claim_diary_generation() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.diary_generation_jobs%ROWTYPE; payload jsonb; token uuid;
BEGIN
  SELECT * INTO j FROM public.diary_generation_jobs
    WHERE ((status='queued' AND due_at<=clock_timestamp()) OR
      (status='running' AND lease_until<=clock_timestamp()))
      AND public.diary_generation_active(user_id)
    ORDER BY due_at,user_id,date FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF j.status='running' AND j.claimed_generation=j.generation AND j.attempts>=3 THEN
    UPDATE public.diary_generation_jobs SET status='failed',error_code='worker_expired',lease_token=NULL,lease_until=NULL,claimed_input=NULL WHERE user_id=j.user_id AND date=j.date;
    RETURN NULL;
  END IF;
  payload:=public.diary_generation_input(j.user_id,j.date);
  IF NOT j.force_generation AND md5((payload-'entry')::text)=j.saved_hash THEN
    UPDATE public.diary_generation_jobs SET status='succeeded',saved_generation=generation,
      first_pending_at=NULL,completed_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,claimed_input=NULL
      WHERE user_id=j.user_id AND date=j.date;
    RETURN jsonb_build_object('skipped',true);
  END IF;
  IF j.call_window=(now() AT TIME ZONE 'UTC')::date AND j.calls>=(SELECT max_calls_per_day FROM public.diary_generation_control WHERE singleton) THEN
    UPDATE public.diary_generation_jobs SET status='failed',error_code='daily_budget',lease_token=NULL,lease_until=NULL,claimed_input=NULL WHERE user_id=j.user_id AND date=j.date;
    RETURN NULL;
  END IF;
  token:=gen_random_uuid();
  UPDATE public.diary_generation_jobs SET status='running',lease_token=token,
    lease_until=clock_timestamp()+interval '180 seconds',claimed_generation=generation,
    claimed_input=payload,input_hash=md5((payload-'entry')::text),first_pending_at=NULL,
    attempts=CASE WHEN status='running' AND claimed_generation<>generation THEN 1 ELSE attempts+1 END,
    calls=CASE WHEN call_window=(now() AT TIME ZONE 'UTC')::date THEN calls+1 ELSE 1 END,
    call_window=(now() AT TIME ZONE 'UTC')::date,updated_at=clock_timestamp()
    WHERE user_id=j.user_id AND date=j.date;
  RETURN jsonb_build_object('user_id',j.user_id,'date',j.date,'lease_token',token,'input',payload);
END;
$$;

-- Serialize the final save with configuration edits, including first-time
-- feature/model/key inserts (row locks alone do not cover those phantoms).
CREATE FUNCTION public.diary_configuration_barrier() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_user uuid;
BEGIN
  target_user:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  PERFORM pg_advisory_xact_lock(hashtextextended(target_user::text,8));
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER diary_configuration_barrier BEFORE INSERT OR UPDATE OR DELETE ON public.user_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.diary_configuration_barrier();
CREATE TRIGGER diary_configuration_barrier BEFORE INSERT OR UPDATE OR DELETE ON public.user_ai_feature_settings
  FOR EACH ROW EXECUTE FUNCTION public.diary_configuration_barrier();
CREATE TRIGGER diary_configuration_barrier BEFORE INSERT OR UPDATE OR DELETE ON public.user_ai_models
  FOR EACH ROW EXECUTE FUNCTION public.diary_configuration_barrier();
CREATE TRIGGER diary_configuration_barrier BEFORE INSERT OR UPDATE OR DELETE ON public.user_ai_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.diary_configuration_barrier();
REVOKE ALL ON FUNCTION public.diary_configuration_barrier() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.finish_diary_generation(p_user_id uuid,p_date date,p_token uuid,p_content text,p_error text DEFAULT NULL,p_score integer DEFAULT NULL,p_score_details text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.diary_generation_jobs%ROWTYPE; current_input jsonb; e public.entries%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.diary_generation_control WHERE singleton FOR SHARE;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(p_user_id::text,8));
  SELECT * INTO j FROM public.diary_generation_jobs WHERE user_id=p_user_id AND date=p_date FOR UPDATE;
  IF NOT FOUND OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<=clock_timestamp() THEN RETURN 'stale_lease'; END IF;
  IF NOT public.diary_generation_active(p_user_id) THEN
    UPDATE public.diary_generation_jobs SET status='disabled',lease_token=NULL,lease_until=NULL,claimed_input=NULL WHERE user_id=p_user_id AND date=p_date;
    RETURN 'disabled';
  END IF;
  -- A manual entry write is locked before comparison, so it cannot race this save.
  SELECT * INTO e FROM public.entries WHERE user_id=p_user_id AND date=p_date FOR UPDATE;
  current_input:=public.diary_generation_input(p_user_id,p_date);
  IF j.generation<>j.claimed_generation OR current_input IS DISTINCT FROM j.claimed_input THEN
    UPDATE public.diary_generation_jobs SET status='queued',generation=generation+1,
      first_pending_at=COALESCE(first_pending_at,clock_timestamp()),
      due_at=LEAST(clock_timestamp()+interval '5 seconds',COALESCE(first_pending_at,clock_timestamp())+interval '30 seconds'),
      lease_token=NULL,lease_until=NULL,claimed_input=NULL,attempts=0,force_generation=false
      WHERE user_id=p_user_id AND date=p_date;
    RETURN 'superseded';
  END IF;
  IF p_error IS NOT NULL THEN
    UPDATE public.diary_generation_jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,
      due_at=clock_timestamp()+make_interval(secs=>LEAST(120,10*attempts*attempts)),
      error_code='generation_failed',lease_token=NULL,lease_until=NULL,claimed_input=NULL
      WHERE user_id=p_user_id AND date=p_date;
    RETURN 'failed';
  END IF;
  IF p_content IS NULL THEN RAISE EXCEPTION 'Missing diary content'; END IF;
  IF e.id IS NOT NULL THEN
    INSERT INTO public.diary_generation_history(user_id,date,generation,previous_entry)
      VALUES(p_user_id,p_date,j.claimed_generation,to_jsonb(e));
  ELSIF jsonb_array_length(current_input->'blocks')>0 THEN
    INSERT INTO public.entries(user_id,date) VALUES(p_user_id,p_date) ON CONFLICT DO NOTHING RETURNING * INTO e;
    -- Another entry created after the initial read must be rechecked, not overwritten.
    IF NOT FOUND THEN
      UPDATE public.diary_generation_jobs SET status='queued',lease_token=NULL,lease_until=NULL,claimed_input=NULL,due_at=clock_timestamp()+interval '5 seconds' WHERE user_id=p_user_id AND date=p_date;
      RETURN 'superseded';
    END IF;
  END IF;
  IF e.id IS NOT NULL THEN
    UPDATE public.entries SET formatted_content=p_content,summary='',
      score=CASE WHEN jsonb_array_length(current_input->'blocks')=0 THEN NULL ELSE COALESCE(p_score,score) END,
      score_details=CASE WHEN jsonb_array_length(current_input->'blocks')=0 THEN NULL ELSE COALESCE(p_score_details,score_details) END
      WHERE id=e.id AND user_id=p_user_id;
  END IF;
  DELETE FROM public.diary_generation_history WHERE id IN (
    SELECT id FROM public.diary_generation_history WHERE user_id=p_user_id AND date=p_date
    ORDER BY created_at DESC,id DESC OFFSET 5);
  UPDATE public.diary_generation_jobs SET status='succeeded',saved_generation=claimed_generation,
    saved_hash=input_hash,completed_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,
    claimed_input=NULL,force_generation=false,error_code=NULL WHERE user_id=p_user_id AND date=p_date;
  RETURN 'succeeded';
END;
$$;

CREATE FUNCTION public.diary_generation_status_for_user(p_user_id uuid,p_date date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('active',public.diary_generation_active(p_user_id),
    'status',CASE WHEN NOT public.diary_generation_active(p_user_id) THEN 'disabled' ELSE COALESCE(j.status,'idle') END,
    'generation',COALESCE(j.generation,0),'saved_generation',COALESCE(j.saved_generation,0),
    'completed_at',j.completed_at,'error_code',j.error_code)
  FROM (SELECT 1) seed LEFT JOIN public.diary_generation_jobs j ON j.user_id=p_user_id AND j.date=p_date;
$$;
CREATE FUNCTION public.diary_generation_status(p_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='PT401'; END IF;
  RETURN public.diary_generation_status_for_user(auth.uid(),p_date);
END;
$$;
CREATE FUNCTION public.request_diary_generation(p_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='PT401'; END IF;
  IF NOT public.diary_generation_active(auth.uid()) THEN RAISE EXCEPTION 'Diary generation disabled' USING ERRCODE='PT409'; END IF;
  PERFORM public.enqueue_diary_generation(auth.uid(),p_date,true);
  RETURN public.diary_generation_status_for_user(auth.uid(),p_date);
END;
$$;

-- Only these owner-scoped wrappers are callable by a signed-in browser.
REVOKE ALL ON FUNCTION public.diary_generation_status(date),public.request_diary_generation(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.diary_generation_status(date),public.request_diary_generation(date) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.diary_generation_active(uuid),public.diary_life_date(uuid,timestamptz),
  public.enqueue_diary_generation(uuid,date,boolean),public.queue_diary_on_block_change(),
  public.diary_generation_input(uuid,date),public.claim_diary_generation(),
  public.finish_diary_generation(uuid,date,uuid,text,text,integer,text),public.diary_generation_status_for_user(uuid,date)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.diary_generation_active(uuid),public.diary_life_date(uuid,timestamptz),
  public.enqueue_diary_generation(uuid,date,boolean),public.diary_generation_input(uuid,date),
  public.claim_diary_generation(),public.finish_diary_generation(uuid,date,uuid,text,text,integer,text),
  public.diary_generation_status_for_user(uuid,date) TO service_role;

-- Administrative rollback for one explicitly selected day; never restore blocks.
CREATE FUNCTION public.restore_diary_generation(p_user_id uuid,p_date date,p_history_id uuid,p_expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb; e public.entries%ROWTYPE;
BEGIN
  IF public.diary_generation_active(p_user_id) THEN RAISE EXCEPTION 'Disable diary generation before restoring' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM public.diary_generation_jobs WHERE user_id=p_user_id AND date=p_date FOR UPDATE;
  SELECT previous_entry INTO previous FROM public.diary_generation_history WHERE id=p_history_id AND user_id=p_user_id AND date=p_date;
  IF previous IS NULL THEN RAISE EXCEPTION 'History not found' USING ERRCODE='PT404'; END IF;
  SELECT * INTO e FROM public.entries WHERE user_id=p_user_id AND date=p_date FOR UPDATE;
  IF NOT FOUND OR e.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Entry changed' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.diary_generation_history(user_id,date,generation,previous_entry)
    VALUES(p_user_id,p_date,0,to_jsonb(e));
  UPDATE public.entries SET formatted_content=previous->>'formatted_content',summary=previous->>'summary',
    score=(previous->>'score')::integer,score_details=previous->>'score_details'
    WHERE id=e.id AND user_id=p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_diary_generation(uuid,date,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restore_diary_generation(uuid,date,uuid,timestamptz) TO service_role;
