-- Run only through the authorized deployment path, after installing the migration
-- and diary-worker. This schedules reads while the deployment gate remains OFF.
-- Vault secrets must be set in the platform's secure UI, never committed here:
-- flowlog_diary_worker_url = https://<project>/functions/v1/diary-worker
-- flowlog_diary_worker_secret = the same random value as DIARY_WORKER_SECRET
DO $$
DECLARE cron_version text;
BEGIN
  SELECT extversion INTO cron_version FROM pg_extension WHERE extname='pg_cron';
  IF cron_version IS NULL OR (string_to_array(cron_version,'.'))[1]::integer<1
    OR ((string_to_array(cron_version,'.'))[1]::integer=1 AND (string_to_array(cron_version,'.'))[2]::integer<5)
  THEN RAISE EXCEPTION 'pg_cron >=1.5 is required for the 10-second schedule'; END IF;
  IF to_regnamespace('net') IS NULL OR to_regnamespace('vault') IS NULL THEN
    RAISE EXCEPTION 'pg_net and Vault are required; do not enable generation without a durable scheduler';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='flowlog_diary_worker_url')
    OR NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='flowlog_diary_worker_secret')
  THEN RAISE EXCEPTION 'Configure worker URL and dedicated secret in Vault first'; END IF;
  IF EXISTS(SELECT 1 FROM public.diary_generation_control WHERE enabled) THEN
    RAISE EXCEPTION 'Keep generation disabled while configuring and verifying the deployment';
  END IF;
  PERFORM cron.schedule('flowlog-diary-worker','10 seconds',$command$
    SELECT net.http_post(
      url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='flowlog_diary_worker_url'),
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='flowlog_diary_worker_secret')),
      body:='{}'::jsonb,timeout_milliseconds:=145000);
  $command$);
END;
$$;
