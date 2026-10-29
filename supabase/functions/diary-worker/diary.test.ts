import { legacyFormatHandler } from "../format-entries/legacy-handler.ts";
import assert from "node:assert/strict";
import { database, other, owner } from "../_test/database.ts";
import type { PGlite, Transaction } from "npm:@electric-sql/pglite@0.3.14";
import { drizzle } from "npm:drizzle-orm@0.45.4/pglite";
import { migrate } from "npm:drizzle-orm@0.45.4/pglite/migrator";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.89.0";
import {
  createWorkerHandler,
  type DiaryJob,
  runDiaryWorker,
} from "./worker.ts";
import {
  generateDiaryScore,
  generateDiaryText,
  getFeatureConfig,
} from "../format-entries/diary.ts";

type Client = SupabaseClient;
async function setup(applyMigration = true) {
  const db = await database();
  await db.exec(`
    ALTER TABLE entries ADD COLUMN score integer, ADD COLUMN score_details text;
    CREATE TABLE user_ai_feature_settings(id uuid DEFAULT gen_random_uuid(),user_id uuid,feature_key text,enabled boolean DEFAULT true,system_prompt text,user_prompt_template text,assigned_model_id uuid,UNIQUE(user_id,feature_key));
    CREATE TABLE user_ai_models(id uuid DEFAULT gen_random_uuid(),user_id uuid,provider text,model_name text,api_key_id uuid,is_active boolean DEFAULT true,updated_at timestamptz DEFAULT now());
    CREATE TABLE user_ai_api_keys(id uuid DEFAULT gen_random_uuid(),user_id uuid,api_key text,updated_at timestamptz DEFAULT now());
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  `);
  if (applyMigration) {
    await db.exec(
      await Deno.readTextFile(
        new URL(
          "../../migrations/20261029000000_server_diary_generation.sql",
          import.meta.url,
        ),
      ),
    );
  }
  return db;
}

Deno.test("Cloud registration with one canonical SQL applies once; duplicate pending SQL rolls back without changing diaries", async () => {
  const db = await setup(false);
  const folder = await Deno.makeTempDir({
    prefix: "flowlog-drizzle-fictional-",
  });
  try {
    // The fixture has applied 0000 already, matching the observed deployed state.
    const migrationsFolder = fileURLToPath(
      new URL("../../../drizzle/migrations", import.meta.url),
    );
    const journal = JSON.parse(
      await Deno.readTextFile(`${migrationsFolder}/meta/_journal.json`),
    );
    assert.equal(journal.entries[0].tag, "0000_photo_diary_api");
    const baselineSql = await Deno.readTextFile(
      `${migrationsFolder}/${journal.entries[0].tag}.sql`,
    );
    const baselineHash = createHash("sha256").update(baselineSql).digest("hex");
    const newSql = await Deno.readTextFile(
      new URL(
        "../../migrations/20261029000000_server_diary_generation.sql",
        import.meta.url,
      ),
    );
    // Simulate the migration metadata recorded by Cloud's normal creation tool.
    // No direct DB URL or real Cloud tool is used by this local test.
    const cloudEntry = {
      idx: 1,
      version: "7",
      when: journal.entries[0].when + 1,
      tag: "0001_cloud_registered_diary",
      breakpoints: true,
    };
    const registeredJournal = {
      ...journal,
      entries: [journal.entries[0], cloudEntry],
    };
    await db.exec(`CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint);`);
    await db.query(
      "INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)",
      [baselineHash, journal.entries[0].when],
    );
    await post(db);
    await db.query("UPDATE entries SET formatted_content=$1,summary=$2", [
      "架空の既存日記。配備で書き換えない。",
      "架空の要約",
    ]);
    const before = (await db.query(
      "SELECT (SELECT jsonb_agg(b) FROM blocks b) blocks,(SELECT jsonb_agg(e) FROM entries e) entries",
    )).rows;

    await Deno.mkdir(`${folder}/meta`);
    await Deno.writeTextFile(
      `${folder}/${journal.entries[0].tag}.sql`,
      baselineSql,
    );
    await Deno.writeTextFile(`${folder}/${cloudEntry.tag}.sql`, newSql);
    await Deno.writeTextFile(`${folder}/0002_duplicate_diary.sql`, newSql);
    await Deno.writeTextFile(
      `${folder}/meta/_journal.json`,
      JSON.stringify({
        ...registeredJournal,
        entries: [
          ...registeredJournal.entries,
          {
            ...cloudEntry,
            idx: 2,
            when: cloudEntry.when + 1,
            tag: "0002_duplicate_diary",
          },
        ],
      }),
    );
    // Production postgres-js supports a multi-statement migration with unsafe().
    // PGlite.query uses the prepared protocol, so forward that one SQL batch to
    // PGlite.exec (simple protocol). Drizzle still controls selection/history/
    // transaction boundaries; the migration bytes and hashes stay unchanged.
    const migrationClient = new Proxy(db, {
      get(target, key) {
        if (key === "transaction") {
          return (callback: (tx: Transaction) => Promise<unknown>) =>
            target.transaction((tx) => {
              const query = tx.query.bind(tx);
              tx.query =
                ((sql: string, params?: unknown[], options?: unknown) => {
                  if (sql.startsWith("-- Issue #8:")) {
                    assert.equal(params?.length ?? 0, 0);
                    return tx.exec(sql).then((results) => results.at(-1));
                  }
                  return query(sql, params, options as never);
                }) as typeof tx.query;
              return callback(tx);
            });
        }
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const orm = drizzle(migrationClient);
    await assert.rejects(
      () => migrate(orm, { migrationsFolder: folder }),
      (error: unknown) => {
        const cause =
          (error as { cause?: { code?: string; message?: string } }).cause;
        return cause?.code === "42P07" &&
          !!cause.message?.includes("diary_generation_control");
      },
    );
    assert.deepEqual(
      (await db.query(
        "SELECT to_regclass('public.diary_generation_control') control,to_regclass('public.diary_generation_jobs') jobs,to_regclass('public.diary_generation_history') history",
      )).rows,
      [{ control: null, jobs: null, history: null }],
    );
    assert.equal(
      (await db.query("SELECT * FROM drizzle.__drizzle_migrations")).rows
        .length,
      1,
    );

    // Only the failed, unrecorded duplicate is removed in this fictional DB.
    // The deployed 0000 row and file are retained byte for byte.
    await Deno.writeTextFile(
      `${folder}/meta/_journal.json`,
      JSON.stringify(registeredJournal),
    );
    await Deno.remove(`${folder}/0002_duplicate_diary.sql`);
    await migrate(orm, { migrationsFolder: folder });
    const records = (await db.query<{ hash: string; created_at: number }>(
      "SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
    )).rows;
    assert.deepEqual(records.map((r) => r.hash), [
      baselineHash,
      createHash("sha256").update(newSql).digest("hex"),
    ]);
    assert.equal(Number(records[1].created_at), cloudEntry.when);
    await migrate(orm, { migrationsFolder: folder });
    assert.deepEqual(
      (await db.query(
        "SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
      )).rows,
      records,
    );
    assert.deepEqual(
      (await db.query(
        "SELECT enabled,all_users,allowed_user_ids FROM diary_generation_control",
      )).rows,
      [{ enabled: false, all_users: false, allowed_user_ids: [] }],
    );
    assert.equal(
      (await db.query("SELECT * FROM diary_generation_jobs")).rows.length,
      0,
    );
    assert.deepEqual(
      (await db.query(
        "SELECT (SELECT jsonb_agg(b) FROM blocks b) blocks,(SELECT jsonb_agg(e) FROM entries e) entries",
      )).rows,
      before,
    );
  } finally {
    await db.close();
    await Deno.remove(folder, { recursive: true });
  }
});
async function enable(db: PGlite) {
  await db.query(
    "UPDATE diary_generation_control SET enabled=true,allowed_user_ids=$1",
    [[owner, other]],
  );
}
function client(db: PGlite): Client {
  return {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      const signatures: Record<string, string[]> = {
        claim_diary_generation: [],
        finish_diary_generation: [
          "p_user_id",
          "p_date",
          "p_token",
          "p_content",
          "p_error",
          "p_score",
          "p_score_details",
        ],
      };
      const params = signatures[name];
      assert.ok(params, `Unexpected RPC ${name}`);
      try {
        const result = await db.query<{ data: unknown }>(
          `SELECT ${name}(${
            params.map((_, i) => `$${i + 1}`).join(",")
          }) AS data`,
          params.map((k) => args[k]),
        );
        return { data: result.rows[0].data, error: null };
      } catch {
        return { data: null, error: { message: "synthetic SQL failure" } };
      }
    },
  } as unknown as Client;
}
async function post(
  db: PGlite,
  content = "架空の日記。○○と食事。",
  time = "2026-09-21T02:00:00+09:00",
  user = owner,
) {
  const r = await db.query<
    { result: { block: { id: string; entry_id: string } } }
  >("SELECT create_event_api($1,$2::jsonb,NULL) result", [
    user,
    JSON.stringify({
      content,
      occurred_at: time,
      images: ["https://i.gyazo.com/synthetic.jpg"],
    }),
  ]);
  return r.rows[0].result.block;
}
async function due(db: PGlite) {
  await db.exec(
    "UPDATE diary_generation_jobs SET due_at=clock_timestamp()-interval '1 second' WHERE status='queued'",
  );
}
async function job(db: PGlite, date = "2026-09-20") {
  return (await db.query<Record<string, unknown>>(
    "SELECT * FROM diary_generation_jobs WHERE user_id=$1 AND date=$2",
    [owner, date],
  )).rows[0];
}
async function entry(db: PGlite, date = "2026-09-20") {
  return (await db.query<Record<string, unknown>>(
    "SELECT * FROM entries WHERE user_id=$1 AND date=$2",
    [owner, date],
  )).rows[0];
}
async function using(fn: (db: PGlite) => Promise<void>) {
  const db = await setup();
  try {
    await fn(db);
  } finally {
    await db.close();
  }
}

Deno.test("migration is disabled without backfill; enabling is owner scoped and block+job roll back together", () =>
  using(async (db) => {
    await post(db);
    assert.equal(
      (await db.query("SELECT * FROM diary_generation_jobs")).rows.length,
      0,
    );
    await db.query(
      "UPDATE diary_generation_control SET enabled=true,allowed_user_ids=$1",
      [[other]],
    );
    await post(db);
    assert.equal(
      (await db.query("SELECT * FROM diary_generation_jobs")).rows.length,
      0,
    );
    await enable(db);
    await db.exec("BEGIN");
    await post(db);
    assert.ok(await job(db));
    await db.exec("ROLLBACK");
    assert.equal(
      (await db.query("SELECT * FROM diary_generation_jobs")).rows.length,
      0,
    );
  }));

Deno.test("native image changes coalesce, no-op edits do not schedule, and continuous input has a due cap", () =>
  using(async (db) => {
    await enable(db);
    const b = await post(db);
    const first = await job(db);
    await db.query("UPDATE blocks SET images=$1 WHERE id=$2", [[
      "https://i.gyazo.com/next.jpg",
    ], b.id]);
    assert.equal((await job(db)).generation, 2);
    assert.equal(
      (await db.query("SELECT * FROM diary_generation_jobs")).rows.length,
      1,
    );
    await db.query(
      "UPDATE blocks SET content=content,images=images WHERE id=$1",
      [b.id],
    );
    assert.equal((await job(db)).generation, 2);
    await db.exec(
      "UPDATE diary_generation_jobs SET first_pending_at=clock_timestamp()-interval '40 seconds'",
    );
    await db.query("UPDATE blocks SET content=$1 WHERE id=$2", [
      "連続投稿",
      b.id,
    ]);
    assert.ok(new Date(String((await job(db)).due_at)).getTime() <= Date.now());
    assert.ok(first);
    assert.equal((await job(db)).status, "queued");
  }));

Deno.test("worker reads DB, generates only target day and preserves raw blocks, unrelated entries and prior diary", () =>
  using(async (db) => {
    await enable(db);
    await post(db);
    await post(db, "別の日", "2026-09-19T12:00:00+09:00");
    await db.query(
      "UPDATE entries SET formatted_content='以前の日記',summary='旧要約',score=80",
    );
    const raw = (await db.query("SELECT * FROM blocks ORDER BY id")).rows;
    const untouched = await entry(db, "2026-09-19");
    // Process only the requested day first.
    await db.exec(
      "UPDATE diary_generation_jobs SET due_at=clock_timestamp()+interval '1 day'",
    );
    await db.query(
      "UPDATE diary_generation_jobs SET due_at=clock_timestamp()-interval '1 second' WHERE date='2026-09-20'",
    );
    let calls = 0;
    assert.equal(
      await runDiaryWorker(client(db), async (j) => {
        calls++;
        assert.equal(j.date, "2026-09-20");
        assert.equal(j.input.blocks.length, 1);
        assert.equal(j.input.blocks[0].content, "架空の日記。○○と食事。");
        return "## 夜\n新しい架空日記";
      }),
      "succeeded",
    );
    assert.equal(calls, 1);
    assert.equal((await entry(db)).formatted_content, "## 夜\n新しい架空日記");
    assert.equal((await entry(db)).score, 80);
    assert.deepEqual(
      (await db.query("SELECT * FROM blocks ORDER BY id")).rows,
      raw,
    );
    assert.deepEqual(await entry(db, "2026-09-19"), untouched);
    const history =
      (await db.query<{ previous_entry: { formatted_content: string } }>(
        "SELECT previous_entry FROM diary_generation_history",
      )).rows;
    assert.equal(history[0].previous_entry.formatted_content, "以前の日記");
    assert.equal((await job(db)).saved_generation, 1);
  }));

Deno.test("updates during generation discard stale result; one day never has parallel claims; latest image order converges", () =>
  using(async (db) => {
    await enable(db);
    const b = await post(db);
    await due(db);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((r) => entered = r),
      hold = new Promise<void>((r) => release = r);
    const first = runDiaryWorker(client(db), async () => {
      entered();
      await hold;
      return "古い生成結果";
    });
    await started;
    assert.equal(
      await runDiaryWorker(client(db), async () => {
        throw new Error("must not run in parallel");
      }),
      "idle",
    );
    await db.query("UPDATE blocks SET images=$1 WHERE id=$2", [[
      "https://x/b.jpg",
      "https://x/a.jpg",
    ], b.id]);
    await db.query("UPDATE blocks SET content=$1 WHERE id=$2", [
      "最新の本文",
      b.id,
    ]);
    release();
    assert.equal(await first, "superseded");
    assert.equal((await entry(db)).formatted_content, null);
    await due(db);
    let calls = 0;
    assert.equal(
      await runDiaryWorker(client(db), async (j) => {
        calls++;
        assert.equal(j.input.blocks[0].content, "最新の本文");
        assert.deepEqual(j.input.blocks[0].images, [
          "https://x/b.jpg",
          "https://x/a.jpg",
        ]);
        return "## 夜\n最新の日記";
      }),
      "succeeded",
    );
    assert.equal(calls, 1);
    assert.equal((await entry(db)).formatted_content, "## 夜\n最新の日記");
  }));

Deno.test("lease fencing, bounded retries, budget cap and expired worker recovery", () =>
  using(async (db) => {
    await enable(db);
    await post(db);
    await due(db);
    const old =
      (await db.query<{ j: DiaryJob }>("SELECT claim_diary_generation() j"))
        .rows[0].j;
    await db.exec(
      "UPDATE diary_generation_jobs SET lease_until=clock_timestamp()-interval '1 second'",
    );
    const fresh =
      (await db.query<{ j: DiaryJob }>("SELECT claim_diary_generation() j"))
        .rows[0].j;
    const stale = await db.query<{ r: string }>(
      "SELECT finish_diary_generation($1,$2,$3,$4,NULL) r",
      [old.user_id, old.date, old.lease_token, "stale"],
    );
    assert.equal(stale.rows[0].r, "stale_lease");
    await db.query(
      "SELECT finish_diary_generation($1,$2,$3,NULL,'secret must not be saved')",
      [fresh.user_id, fresh.date, fresh.lease_token],
    );
    await due(db);
    assert.equal(
      await runDiaryWorker(client(db), async () => {
        throw new Error("private model error");
      }),
      "failed",
    );
    assert.equal((await job(db)).status, "failed");
    assert.equal((await job(db)).error_code, "generation_failed");
    assert.equal((await entry(db)).formatted_content, null);
    await db.exec("UPDATE diary_generation_control SET max_calls_per_day=1");
    await db.query("SELECT enqueue_diary_generation($1,$2,true)", [
      owner,
      "2026-09-20",
    ]);
    await due(db);
    assert.equal(
      await runDiaryWorker(client(db), async () => {
        throw new Error("budget should prevent call");
      }),
      "idle",
    );
    assert.equal((await job(db)).error_code, "daily_budget");
  }));

Deno.test("OFF during generation prevents save and config change fences stale output", () =>
  using(async (db) => {
    await enable(db);
    await post(db);
    await due(db);
    assert.equal(
      await runDiaryWorker(client(db), async () => {
        await db.query(
          "INSERT INTO user_ai_feature_settings(user_id,feature_key,enabled) VALUES($1,'diary_format',false)",
          [owner],
        );
        return "do not save";
      }),
      "disabled",
    );
    assert.equal((await entry(db)).formatted_content, null);
    await db.query(
      "UPDATE user_ai_feature_settings SET enabled=true WHERE user_id=$1",
      [owner],
    );
    await db.query("SELECT enqueue_diary_generation($1,$2,true)", [
      owner,
      "2026-09-20",
    ]);
    await due(db);
    assert.equal(
      await runDiaryWorker(client(db), async () => {
        await db.query(
          "UPDATE user_ai_feature_settings SET system_prompt='新しい設定' WHERE user_id=$1",
          [owner],
        );
        return "old config";
      }),
      "superseded",
    );
    assert.equal((await entry(db)).formatted_content, null);
  }));

Deno.test("delete, category removal and life-day movement affect only old and new days; empty diary uses no LLM", () =>
  using(async (db) => {
    await enable(db);
    const b = await post(db);
    await db.query("UPDATE entries SET formatted_content='削除前の日記'");
    await db.query(
      "UPDATE blocks SET occurred_at='2026-09-21T06:00:00+09:00' WHERE id=$1",
      [b.id],
    );
    assert.equal(
      (await db.query("SELECT * FROM diary_generation_jobs")).rows.length,
      2,
    );
    await due(db);
    await runDiaryWorker(client(db), async () => "## 朝\n移動後");
    await due(db);
    await runDiaryWorker(client(db), async () => "## 朝\n移動後");
    assert.equal((await entry(db)).formatted_content, "");
    assert.equal(
      (await entry(db, "2026-09-21")).formatted_content,
      "## 朝\n移動後",
    );
    await db.query("UPDATE blocks SET category='thought' WHERE id=$1", [b.id]);
    await due(db);
    assert.equal(
      await runDiaryWorker(client(db), async () => {
        throw new Error("empty day must not call LLM");
      }),
      "succeeded",
    );
    assert.equal((await entry(db, "2026-09-21")).formatted_content, "");
    const state = await job(db, "2026-09-21");
    await db.query("DELETE FROM blocks WHERE id=$1", [b.id]);
    assert.equal((await job(db, "2026-09-21")).generation, state.generation);
  }));

Deno.test("entry edits during LLM generation are detected, same-input retries skip LLM, history keeps five", () =>
  using(async (db) => {
    await enable(db);
    const b = await post(db);
    await due(db);
    assert.equal(
      await runDiaryWorker(client(db), async () => {
        await db.query(
          "UPDATE entries SET formatted_content='生成中に入った編集'",
        );
        return "stale";
      }),
      "superseded",
    );
    assert.equal((await entry(db)).formatted_content, "生成中に入った編集");
    await due(db);
    await runDiaryWorker(client(db), async () => "## 夜\n完成");
    await db.query("SELECT enqueue_diary_generation($1,$2,false)", [
      owner,
      "2026-09-20",
    ]);
    await due(db);
    assert.equal(
      await runDiaryWorker(client(db), async () => {
        throw new Error("same fingerprint");
      }),
      "unchanged",
    );
    for (let i = 0; i < 6; i++) {
      await db.query("UPDATE blocks SET content=$1 WHERE id=$2", [
        `架空${i}`,
        b.id,
      ]);
      await due(db);
      await runDiaryWorker(client(db), async () => `## 夜\n${i}`);
    }
    assert.equal(
      (await db.query("SELECT * FROM diary_generation_history")).rows.length,
      5,
    );
  }));

Deno.test("private jobs/RPCs reject client roles; owner-scoped status and manual retry cannot cross tenants", () =>
  using(async (db) => {
    await enable(db);
    await post(db);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(
        db.query("SELECT * FROM diary_generation_jobs"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT claim_diary_generation()"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT diary_generation_status_for_user($1,$2)", [
          owner,
          "2026-09-20",
        ]),
        /permission denied/,
      );
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE authenticated");
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      other,
    ]);
    const s = (await db.query<{ s: { status: string } }>(
      "SELECT diary_generation_status($1) s",
      ["2026-09-20"],
    )).rows[0].s;
    assert.equal(s.status, "idle");
    await db.query("SELECT request_diary_generation($1)", ["2026-09-20"]);
    await db.exec("RESET ROLE");
    assert.equal(
      (await db.query("SELECT * FROM diary_generation_jobs")).rows.length,
      2,
    );
    // Deleting an account must not enqueue orphan jobs or prevent existing cascades.
    await db.query("DELETE FROM auth.users WHERE id=$1", [owner]);
    assert.equal(
      (await db.query("SELECT * FROM diary_generation_jobs WHERE user_id=$1", [
        owner,
      ])).rows.length,
      0,
    );
  }));

Deno.test("pure diary phase excludes time inference, preserves native photo markers and rejects malformed responses", async () => {
  const blocks = [{
    id: "synthetic",
    content: "○○と架空の食事",
    occurred_at: "2026-09-20T12:00:00Z",
    images: ["https://i.gyazo.com/synthetic.jpg"],
  }];
  let calls = 0;
  const ai = async () => {
    calls++;
    return { text: "## 夜\n○○と架空の食事。", usage: null };
  };
  const result = await generateDiaryText(blocks, "2026-09-20", 5, null, ai);
  assert.equal(calls, 1);
  assert.match(
    result.formatted_content,
    /\{\{PHOTO:https:\/\/i.gyazo.com\/synthetic.jpg\}\}/,
  );
  assert.equal(blocks[0].occurred_at, "2026-09-20T12:00:00Z");
  assert.deepEqual(await generateDiaryText([], "2026-09-20", 5, null, ai), {
    formatted_content: "",
    summary: "",
  });
  assert.equal(calls, 1);
  await assert.rejects(
    generateDiaryText(blocks, "2026-09-20", 5, {
      feature_key: "diary_format",
      enabled: false,
      system_prompt: null,
      user_prompt_template: null,
      provider: null,
      model_name: null,
      api_key: null,
    }, ai),
    /disabled/,
  );
  await assert.rejects(
    generateDiaryText(
      blocks,
      "2026-09-20",
      5,
      null,
      async () => ({ text: "invalid", usage: null }),
    ),
    /Invalid diary response/,
  );
  assert.equal(
    legacyFormatHandler(new Request("https://test.invalid", { method: "POST" }))
      .status,
    410,
  );
});

Deno.test("worker endpoint accepts only POST with its dedicated server secret", async () => {
  const idle = {
    rpc: async () => ({ data: null, error: null }),
  } as unknown as Client;
  const handler = createWorkerHandler("synthetic-worker-secret", idle);
  assert.equal(
    (await handler(new Request("https://test.invalid", { method: "GET" })))
      .status,
    405,
  );
  for (const key of ["", "public-key", "user-token"]) {
    assert.equal(
      (await handler(
        new Request("https://test.invalid", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
        }),
      )).status,
      401,
    );
  }
  assert.equal(
    (await handler(
      new Request("https://test.invalid", {
        method: "POST",
        headers: { Authorization: "Bearer synthetic-worker-secret" },
      }),
    )).status,
    200,
  );
  assert.equal(
    (await createWorkerHandler(undefined, idle)(
      new Request("https://test.invalid", { method: "POST" }),
    )).status,
    401,
  );
});

Deno.test("selected-day restore requires OFF, current entry timestamp and matching private history", () =>
  using(async (db) => {
    await enable(db);
    await post(db);
    await db.exec("UPDATE entries SET formatted_content='保全する日記'");
    await due(db);
    await runDiaryWorker(client(db), async () => "## 夜\n新しい日記");
    const h = (await db.query<{ id: string }>(
      "SELECT id FROM diary_generation_history LIMIT 1",
    )).rows[0];
    const e = await entry(db);
    await assert.rejects(
      db.query("SELECT restore_diary_generation($1,$2,$3,$4)", [
        owner,
        "2026-09-20",
        h.id,
        e.updated_at,
      ]),
      /Disable/,
    );
    await db.exec("UPDATE diary_generation_control SET enabled=false");
    await assert.rejects(
      db.query("SELECT restore_diary_generation($1,$2,$3,$4)", [
        other,
        "2026-09-20",
        h.id,
        e.updated_at,
      ]),
      /History not found/,
    );
    await assert.rejects(
      db.query("SELECT restore_diary_generation($1,$2,$3,$4)", [
        owner,
        "2026-09-20",
        h.id,
        "2000-01-01T00:00:00Z",
      ]),
      /Entry changed/,
    );
    await db.query("SELECT restore_diary_generation($1,$2,$3,$4)", [
      owner,
      "2026-09-20",
      h.id,
      e.updated_at,
    ]);
    assert.equal((await entry(db)).formatted_content, "保全する日記");
  }));
Deno.test("canonical SQL is preserved and Cloud never holds two copies of the diary creation", async () => {
  const local = await Deno.readTextFile(
    new URL(
      "../../migrations/20261029000000_server_diary_generation.sql",
      import.meta.url,
    ),
  );
  assert.equal(
    createHash("sha256").update(local).digest("hex"),
    "444f30f554c338a532b0d0e5f44aba33e577e6e9d32f075902b61a43400185e8",
  );
  const folder = new URL("../../../drizzle/migrations/", import.meta.url);
  const journal = JSON.parse(
    await Deno.readTextFile(new URL("meta/_journal.json", folder)),
  );
  const tags = journal.entries.map((e: { tag: string }) => e.tag);
  assert.equal(new Set(tags).size, tags.length);
  let copies = 0;
  for (const tag of tags) {
    const sql = await Deno.readTextFile(new URL(`${tag}.sql`, folder));
    if (sql.includes("CREATE TABLE public.diary_generation_control")) {
      copies++;
      assert.equal(sql, local);
    }
  }
  assert.ok(copies <= 1, "Cloud must register the canonical SQL only once");
  for await (const file of Deno.readDir(folder)) {
    if (file.name.endsWith(".sql")) {
      assert.ok(
        tags.includes(file.name.slice(0, -4)),
        "Unjournaled SQL must not be left in Cloud's migration folder",
      );
    }
  }
});

Deno.test("scoring remains optional and server generated scores are saved with the diary", () =>
  using(async (db) => {
    await enable(db);
    await post(db);
    await due(db);
    assert.equal(
      await runDiaryWorker(
        client(db),
        async () => ({
          formatted_content: "## 夜\n架空の日記",
          score: 85,
          score_details: "架空の採点",
        }),
      ),
      "succeeded",
    );
    assert.equal((await entry(db)).score, 85);
    assert.equal((await entry(db)).score_details, "架空の採点");
    let calls = 0;
    const config = {
      feature_key: "score_evaluation",
      enabled: true,
      system_prompt: null,
      user_prompt_template: "架空の規範",
      provider: null,
      model_name: null,
      api_key: null,
    };
    const score = await generateDiaryScore(
      "架空の日記",
      5,
      config,
      async () => {
        calls++;
        return {
          text: JSON.stringify({
            score: 90,
            deductions: [],
            summary: "架空の講評",
          }),
          usage: null,
        };
      },
    );
    assert.equal(score.score, 90);
    assert.equal(calls, 1);
    assert.deepEqual(
      await generateDiaryScore(
        "架空の日記",
        5,
        { ...config, enabled: false },
        async () => {
          throw new Error("OFF");
        },
      ),
      {},
    );
  }));

Deno.test("assigned model and API key reads cannot cross owners even with a service client", async () => {
  const before = globalThis.fetch;
  let foreignModel = true;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, "https://diary-test.invalid");
    const reply = (value: unknown) =>
      new Response(JSON.stringify(value), {
        headers: { "Content-Type": "application/json" },
      });
    if (url.pathname.endsWith("/user_ai_feature_settings")) {
      return reply({
        feature_key: "diary_format",
        enabled: true,
        system_prompt: null,
        user_prompt_template: null,
        assigned_model_id: other,
      });
    }
    if (url.pathname.endsWith("/user_ai_models")) {
      if (foreignModel && url.searchParams.get("user_id") === `eq.${owner}`) {
        return reply(null);
      }
      return reply({
        provider: "openai",
        model_name: "synthetic-model",
        api_key_id: other,
      });
    }
    if (url.pathname.endsWith("/user_ai_api_keys")) {
      return reply(
        url.searchParams.get("user_id") === `eq.${owner}`
          ? null
          : { api_key: "must-not-be-returned" },
      );
    }
    throw new Error("Unexpected request");
  }) as typeof fetch;
  try {
    const db = createClient("https://diary-test.invalid", "synthetic", {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await assert.rejects(
      getFeatureConfig(db, owner, "diary_format", true),
      /Assigned model unavailable/,
    );
    foreignModel = false;
    await assert.rejects(
      getFeatureConfig(db, owner, "diary_format", true),
      /Assigned model unavailable/,
    );
  } finally {
    globalThis.fetch = before;
  }
});

Deno.test("provider requests are bounded and use only the fictional input supplied to generation", async () => {
  const before = globalThis.fetch;
  let current = "openai";
  let calls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.ok(
      [
        "api.openai.com",
        "api.anthropic.com",
        "generativelanguage.googleapis.com",
      ].includes(url.hostname),
    );
    const body = JSON.parse(String(init?.body));
    assert.ok(init?.signal);
    calls++;
    if (current === "openai") assert.equal(body.max_completion_tokens, 4096);
    if (current === "anthropic") assert.equal(body.max_tokens, 4096);
    if (current === "google") {
      assert.equal(body.generationConfig.maxOutputTokens, 4096);
    }
    assert.match(JSON.stringify(body), /架空の入力/);
    assert.match(JSON.stringify(body), /custom-template/);
    return new Response(
      JSON.stringify(
        current === "google"
          ? {
            candidates: [{
              content: { parts: [{ text: "## 夜\n架空の入力" }] },
            }],
          }
          : current === "anthropic"
          ? { content: [{ text: "## 夜\n架空の入力" }] }
          : { choices: [{ message: { content: "## 夜\n架空の入力" } }] },
      ),
      { headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    for (const provider of ["openai", "anthropic", "google"]) {
      current = provider;
      await generateDiaryText(
        [{
          id: "synthetic",
          content: "架空の入力",
          occurred_at: "2026-09-20T12:00:00Z",
        }],
        "2026-09-20",
        5,
        {
          feature_key: "diary_format",
          enabled: true,
          system_prompt: null,
          user_prompt_template: "custom-template {{date}} {{blocks_text}}",
          provider,
          model_name: "synthetic-model",
          api_key: "synthetic-only",
        },
      );
    }
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = before;
  }
});
