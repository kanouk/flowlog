# Photo diary API production rollout

- [x] Confirm PR #7 main merge commit 9ef2caeaa7567e09219d4ee6049948d789278d61 and read deployment documentation; deployment sources match this commit.
- [x] Check new migration application history and prerequisites; migration, revision column, receipts table and RPCs are absent; profiles.user_id is unique.
- [x] Apply only the new migration once — submitted source SQL verbatim; applied successfully as drizzle/migrations/0000_photo_diary_api.sql. Read-only verification confirms revision/trigger, profiles FK, RLS and service-only table/RPC privileges.
- [x] Deploy only api and its imported dependencies — successful; submitted source SHA-256 eed12e87585308bf4b1ca03c11c4ac869add8b694e991645a0fe692692adb624.
- [x] Independently fetch and verify production OpenAPI 1.1.0 — unauthenticated GET HTTP 200; images, expected, Idempotency-Key, readback and revision schemas confirmed.
- [x] Run existing isolated synthetic API/DB/canary detection tests — 11 passed, 0 failed; no production mutation requests or canary apply executed.
- [ ] Production PostgREST write tests in isolated dedicated environment/account — no dedicated environment/account established.
- [ ] User-designated single-target API readback and FlowLog image display — waits for user-designated date, block ID, and image URL; separate later step. No owner production writes or canary apply performed.
# Issue #8 server diary generation

- [x] Implement durable owner/life-day jobs, debouncing, leases, stale-output rejection, bounded retries, history and server-only worker.
- [x] Move browser generation/persistence to server status polling and owner-scoped manual job requests; update API to 1.2.0.
- [x] Confirm commit 45751f709d08f2f96a56403281b879f231e42231 and requested source agreement; only generated types and roadmap differ.
- [x] PR #10 read-only preflight: commit 2803834bc6d0b54d62cb213bf678879fb8f312c8 is contained in HEAD 8e6a3bb7bc147c1373be02f13913a9680a70567f; deployment docs, journal, SQL, config and lockfile match the requested commit. Journal/files contain only 0000/0001; DB history contains only 0000 with matching hash/timestamp; new tables/RPCs absent.
- [ ] Apply existing 0001 once — BLOCKED before execution: LOVABLE_DB_MIGRATION_URL is unavailable in this environment; no supported non-generating existing-file application path provided. Do not resubmit SQL to the migration creation tool or use alternate credentials. No npm db:migrate execution, retry, new migration, or history edits performed.
- [ ] Deploy api, diary-worker and format-entries, regenerate RPC types, then publish frontend — blocked by unapplied 0001; no deployment/publication performed in PR #10 resumption.
- [ ] Install pg_cron/pg_net, set dedicated worker/Vault secrets and configure the durable schedule while OFF — blocked by unapplied 0001; supported secure Vault provisioning also unverified.
- [x] Run isolated existing mock tests: diary suite 16 passed and API suite 12 passed; no production or LLM/scheduler calls.
- [ ] Independently verify public OpenAPI 1.2.0, deployed schema permissions, OFF gate and published stopped-state screen — blocked by unapplied 0001. No new verification performed after PR #10 preflight stop.
- [ ] Verify real scheduler/PostgREST/LLM/frontend with isolated fictional data — isolated hosted environment not established. No production diary writes authorized.
- [ ] Activate production only after the user explicitly identifies and authorizes the rollout scope.
