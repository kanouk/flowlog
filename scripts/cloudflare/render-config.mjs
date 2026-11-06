import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const env = process.env;
for (const key of ['CLOUDFLARE_ACCOUNT_ID','FLOWLOG_STAGING_D1_ID','FLOWLOG_STAGING_OWNER_ID','FLOWLOG_STAGING_OWNER_EMAIL','FLOWLOG_STAGING_ORIGIN']) assert.ok(env[key], 'Missing staging configuration: ' + key);
assert.match(env.FLOWLOG_STAGING_ORIGIN, /^https:\/\/flowlog-staging\.[a-z0-9-]+\.workers\.dev$/);
const config = {
  name: 'flowlog-staging', main: '../worker/index.ts', compatibility_date: '2026-10-29', compatibility_flags: ['nodejs_compat'],
  workers_dev: true, preview_urls: false,
  assets: { directory: '../dist-staging', binding: 'ASSETS', not_found_handling: 'single-page-application', run_worker_first: true },
  d1_databases: [{ binding: 'DB', database_name: 'flowlog-staging', database_id: env.FLOWLOG_STAGING_D1_ID, migrations_dir: '../worker/migrations' }],
  r2_buckets: [{ binding: 'IMAGES', bucket_name: 'flowlog-staging' }],
  vars: { ENVIRONMENT: 'staging', OWNER_ID: env.FLOWLOG_STAGING_OWNER_ID, OWNER_EMAIL: env.FLOWLOG_STAGING_OWNER_EMAIL, APP_ORIGIN: env.FLOWLOG_STAGING_ORIGIN,EXTERNAL_WRITES_ENABLED:'false' },
  queues:{producers:[{binding:'DIARY_QUEUE',queue:'flowlog-staging-diary'}],consumers:[{queue:'flowlog-staging-diary',max_batch_size:1,max_batch_timeout:1,max_retries:3,retry_delay:30}]},
  triggers:{crons:['* * * * *']},
  observability: { enabled: false },
};
await mkdir('.migration-backups', { recursive: true, mode: 0o700 });
await writeFile('.migration-backups/wrangler.staging.json', JSON.stringify(config, null, 2), { mode: 0o600 });
