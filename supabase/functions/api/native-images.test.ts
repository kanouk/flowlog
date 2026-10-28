import assert from "node:assert/strict";
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import {
  isExpectedBlock,
  isTimestamp,
  validateImages,
} from "./native-images.ts";

// Synthetic PostgreSQL/WASM database. The HTTP adapter below replaces PostgREST,
// not SQL transactions, constraints, RLS or triggers. No production credentials.
Deno.env.set("SUPABASE_URL", "https://flowlog-test.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
const originalServe = Deno.serve;
Deno.serve = (() => ({})) as unknown as typeof Deno.serve;
const { app } = await import("./index.ts");
Deno.serve = originalServe;
const owner = "11111111-1111-4111-8111-111111111111";
const other = "99999999-9999-4999-8999-999999999999";
const photo = "https://i.gyazo.com/0123456789abcdef0123456789abcdef.jpg";
const oldPhoto = "https://i.gyazo.com/fedcba9876543210fedcba9876543210.jpg";

async function database(cloudMigrationGuard = false) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE storage.buckets(id text, name text, public boolean);
    CREATE TABLE storage.objects(bucket_id text, name text);
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1, '/') $$;
  `);
  for (
    const name of [
      "20251219063412_429c270d-2561-4ce3-98f8-5f74b6f82f36.sql",
      "20260110103001_0aa9a2be-47ab-420e-82ac-0c502adfbd15.sql",
      "20260118062009_01a1acc8-5775-41cb-b604-938a6ff65928.sql",
      "20260118095215_a2c9ab1f-099e-474c-9323-7fb4d1f06add.sql",
      "20260119084100_f23b84f0-66ac-4bc7-9e62-19082a254420.sql",
      "20260126004534_cdf86a69-8300-4c69-b7a0-3163bb01bfee.sql",
      "20260307024051_eb77362c-c4d4-470c-81c6-da59104004c0.sql",
      "20260120083759_9f82ba1a-7f8e-4623-9298-df5e4ff3bf1d.sql",
      "20260725041802_c12483eb-4f1b-4fcd-ad7f-882305b05dd8.sql",
    ]
  ) {
    await db.exec(
      await Deno.readTextFile(
        new URL(`../../migrations/${name}`, import.meta.url),
      ),
    );
  }
  // Only unrelated columns/settings are fixture DDL; core tables and image/time
  // constraints above are the real historical migrations.
  await db.exec(`
    ALTER TABLE blocks ADD COLUMN priority integer DEFAULT 0;
    CREATE TABLE user_ai_settings(user_id uuid UNIQUE, day_boundary_hour integer NOT NULL DEFAULT 0);
    INSERT INTO auth.users(id) VALUES ('${owner}'), ('${other}');
    INSERT INTO user_ai_settings VALUES ('${owner}',5);
    GRANT USAGE ON SCHEMA public, auth TO service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
  `);
  // Reproduce the two reported Cloud preflight constraints at each DDL step.
  // This is a local guard, not a claim that the real Cloud checker has passed.
  if (cloudMigrationGuard) {
    await db.exec(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE FUNCTION test_cloud_migration_guard() RETURNS event_trigger
    LANGUAGE plpgsql AS $$
    DECLARE command record; target oid;
    BEGIN
      target := to_regclass('public.event_api_receipts');
      IF target IS NULL THEN RETURN; END IF;
      FOR command IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
        IF command.classid = 'pg_class'::regclass AND command.objid = target THEN
          IF EXISTS (
            SELECT 1 FROM pg_constraint c JOIN pg_class parent ON parent.oid=c.confrelid
            JOIN pg_namespace n ON n.oid=parent.relnamespace
            WHERE c.conrelid=target AND c.contype='f' AND n.nspname='auth'
          ) THEN RAISE EXCEPTION 'Cloud guard: direct auth foreign key'; END IF;
          IF (SELECT relrowsecurity FROM pg_class WHERE oid=target) AND EXISTS (
            SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege
            WHERE NOT has_table_privilege('service_role', target, privilege)
          ) THEN RAISE EXCEPTION 'Cloud guard: grant service privileges before RLS'; END IF;
        END IF;
      END LOOP;
    END;
    $$;
    CREATE EVENT TRIGGER test_cloud_migration_guard ON ddl_command_end
      EXECUTE FUNCTION test_cloud_migration_guard();
  `);
  }
  await db.exec(
    await Deno.readTextFile(
      new URL(
        "../../migrations/20261028000000_photo_diary_api.sql",
        import.meta.url,
      ),
    ),
  );
  return db;
}

type Call = { url: URL; method: string; body: Record<string, unknown> | null };
async function withDatabase(fn: (db: PGlite, calls: Call[]) => Promise<void>) {
  const db = await database();
  const before = globalThis.fetch;
  const intervalBefore = globalThis.setInterval;
  const intervals: ReturnType<typeof setInterval>[] = [];
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
    const interval = intervalBefore(...args);
    intervals.push(interval);
    return interval;
  }) as typeof setInterval;
  const calls: Call[] = [];
  const hashes = new Map<string, string>();
  for (
    const [token, id] of [["synthetic-owner", owner], [
      "synthetic-other",
      other,
    ]]
  ) {
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    hashes.set(
      Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, "0"))
        .join(""),
      id,
    );
  }
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(
      url.origin,
      "https://flowlog-test.invalid",
      "Unexpected image/formatter request",
    );
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    const reply = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.pathname.endsWith("/user_api_tokens")) {
      if (method === "PATCH") return new Response(null, { status: 204 });
      const id = hashes.get(url.searchParams.get("token_hash")!.slice(3));
      return id ? reply({ user_id: id }) : reply({ code: "PGRST116" }, 406);
    }
    try {
      if (url.pathname.endsWith("/rpc/create_event_api")) {
        const data = await db.query<{ result: unknown }>(
          "SELECT create_event_api($1, $2::jsonb, $3) AS result",
          [body.p_user_id, JSON.stringify(body.p_request), body.p_key],
        );
        return reply(data.rows[0].result);
      }
      if (url.pathname.endsWith("/rpc/update_block_api")) {
        const data = await db.query<{ result: unknown }>(
          "SELECT update_block_api($1,$2,$3::jsonb,$4::jsonb) AS result",
          [
            body.p_user_id,
            body.p_block_id,
            JSON.stringify(body.p_expected),
            JSON.stringify(body.p_updates),
          ],
        );
        return reply(data.rows[0].result);
      }
      const table = url.pathname.split("/").at(-1)!;
      assert.ok(["entries", "blocks"].includes(table));
      if (method === "POST") {
        const fields = Object.keys(body);
        assert.ok(
          fields.every((k) =>
            [
              "user_id",
              "date",
              "entry_id",
              "category",
              "content",
              "tag",
              "occurred_at",
              "starts_at",
              "ends_at",
              "is_all_day",
              "priority",
              "source",
            ].includes(k)
          ),
        );
        const placeholders = fields.map((_, i) => `$${i + 1}`).join(",");
        const rows = await db.query<{ item: unknown }>(
          `WITH inserted AS (INSERT INTO ${table} (${
            fields.join(",")
          }) VALUES (${placeholders}) RETURNING *) SELECT to_jsonb(t) AS item FROM inserted t`,
          Object.values(body),
        );
        return reply(rows.rows[0].item);
      }
      const values: unknown[] = [];
      const where: string[] = [];
      for (const [column, condition] of url.searchParams) {
        if (["select", "order", "limit"].includes(column)) continue;
        assert.ok(
          [
            "id",
            "user_id",
            "entry_id",
            "date",
            "content",
            "images",
            "occurred_at",
            "revision",
          ].includes(column),
        );
        if (condition === "is.null") where.push(`${column} IS NULL`);
        else {
          assert.ok(condition.startsWith("eq."));
          values.push(condition.slice(3));
          where.push(`${column} = $${values.length}`);
        }
      }
      let sql = `SELECT * FROM ${table} WHERE ${where.join(" AND ")}`;
      if (method === "PATCH") {
        const sets = Object.entries(body).map(([k, v]) => {
          assert.ok(
            ["content", "tag", "images", "occurred_at", "is_done"].includes(k),
          );
          values.push(v);
          return `${k} = $${values.length}`;
        });
        sql = `UPDATE ${table} SET ${sets.join(", ")} WHERE ${
          where.join(" AND ")
        } RETURNING *`;
      }
      const result = await db.query<{ item: unknown }>(
        method === "PATCH"
          ? `WITH changed AS (${sql}) SELECT to_jsonb(t) AS item FROM changed t`
          : `SELECT to_jsonb(t) AS item FROM (${sql}) t`,
        values,
      );
      const rows = result.rows.map((x) => x.item);
      const accept = new Headers(init?.headers).get("accept");
      return reply(
        accept?.includes("object") ? rows[0] ?? null : rows,
      );
    } catch (e) {
      const error = e as Error & { code?: string };
      return reply({ message: error.message, code: error.code }, 400);
    }
  }) as typeof fetch;
  try {
    await fn(db, calls);
  } finally {
    globalThis.fetch = before;
    globalThis.setInterval = intervalBefore;
    intervals.forEach(clearInterval);
    await db.close();
  }
}

async function request(
  path: string,
  method = "GET",
  body?: unknown,
  token = "synthetic-owner",
  key?: string,
) {
  return app.request(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key === undefined ? {} : { "Idempotency-Key": key }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function create(body: Record<string, unknown> = {}, key?: string) {
  const response = await request(
    "/events",
    "POST",
    {
      content: "架空の日記。○○と食事。",
      occurred_at: "2026-09-21T02:00:00+09:00",
      tag: "private",
      source: "test",
      images: [oldPhoto],
      ...body,
    },
    "synthetic-owner",
    key,
  );
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()).data;
}
const snapshot = (block: Record<string, unknown>) =>
  Object.fromEntries(
    ["content", "images", "occurred_at", "entry_id", "revision"].map(
      (k) => [k, block[k]],
    ),
  );

Deno.test("validation: HTTPS, max five, canonical duplicates, malformed timestamps and snapshots", () => {
  assert.equal(validateImages([]), null);
  assert.equal(validateImages([photo]), null);
  for (
    const bad of [
      null,
      photo,
      {},
      [3],
      ["javascript:alert(1)"],
      ["http://example.com/a"],
      ["https:example.com/a"],
      ["https://x/a\u0000b"],
      ["https://x/\\a"],
      ["https://user:pass@x/a"],
      ["https://x/a b"],
      [photo, photo],
      ["https://x/a", "https://X:443/a#same"],
      Array.from({ length: 6 }, (_, i) => `https://x/${i}`),
    ]
  ) assert.ok(validateImages(bad));
  assert.ok(!isExpectedBlock({}));
  for (
    const time of [
      "bad",
      "2026-02-30T00:00:00Z",
      "2026-01-01T00:00:00",
      "2026-13-01T00:00:00Z",
    ]
  ) assert.ok(!isTimestamp(time));
});

Deno.test("past event creates correct JST life day and reads back native images and exact diary text", async () => {
  await withDatabase(async (db) => {
    const block = await create();
    assert.equal(block.date, "2026-09-20");
    await db.query("UPDATE entries SET formatted_content = $1 WHERE id = $2", [
      "保存済み本文。○○",
      block.entry_id,
    ]);
    const response = await request(`/entries/${block.date}`);
    assert.equal(response.status, 200);
    const entry = (await response.json()).data;
    assert.equal(entry.date, "2026-09-20");
    assert.equal(entry.id, block.entry_id);
    assert.equal(entry.stored_formatted_content, "保存済み本文。○○");
    assert.equal(entry.blocks[0].content, block.content);
    assert.equal(entry.blocks[0].id, block.id);
    assert.deepEqual(entry.blocks[0].images, [oldPhoto]);
    assert.ok(isExpectedBlock(snapshot(entry.blocks[0])));
    const precise = await create({
      occurred_at: "2026-09-20T17:00:00.123456Z",
    });
    assert.match(precise.occurred_at, /\.123456/);
    const five = await create({
      images: Array.from(
        { length: 5 },
        (_, i) => `https://i.gyazo.com/synthetic-${i}.jpg`,
      ),
    });
    assert.equal(five.images.length, 5);
    assert.equal(
      (await create({ occurred_at: "2026-09-21T05:00:00+09:00" })).date,
      "2026-09-21",
    );
    assert.equal(
      (await create({ occurred_at: "2026-09-20T19:59:59Z" })).date,
      "2026-09-20",
    );
  });
});

Deno.test("image-only atomic CAS preserves entire entry, other blocks and all non-image fields", async () => {
  await withDatabase(async (db, calls) => {
    const block = await create();
    const sibling = await create({ content: "別の出来事" });
    await db.query("UPDATE entries SET formatted_content = $1 WHERE id = $2", [
      "保存本文 {{PHOTO:https://example.com/legacy.jpg}}",
      block.entry_id,
    ]);
    const beforeEntry = (await db.query("SELECT * FROM entries")).rows;
    const beforeSibling = (await db.query<Record<string, unknown>>(
      "SELECT * FROM blocks WHERE id=$1",
      [sibling.id],
    )).rows;
    const response = await request(`/blocks/${block.id}`, "PATCH", {
      images: [oldPhoto, photo],
      expected: snapshot(block),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const updated = (await response.json()).data;
    const { images: _i, revision: _r, ...before } = block;
    const { images: _j, revision: _s, ...after } = {
      ...updated,
      date: block.date,
      replayed: false,
      message: block.message,
    };
    assert.deepEqual(after, before);
    assert.equal(updated.revision, 2);
    assert.deepEqual(updated.images, [oldPhoto, photo]);
    assert.deepEqual(
      (await db.query("SELECT * FROM entries")).rows,
      beforeEntry,
    );
    assert.deepEqual(
      (await db.query<Record<string, unknown>>(
        "SELECT * FROM blocks WHERE id=$1",
        [sibling.id],
      )).rows,
      beforeSibling,
    );
    const photoOnly = await create();
    await db.query("UPDATE blocks SET content=NULL WHERE id=$1", [
      photoOnly.id,
    ]);
    const photoOnlyState = (await db.query<{ item: Record<string, unknown> }>(
      "SELECT to_jsonb(b) item FROM blocks b WHERE id=$1",
      [photoOnly.id],
    )).rows[0].item;
    assert.equal(
      (await request(`/blocks/${photoOnly.id}`, "PATCH", {
        images: [],
        expected: snapshot(photoOnlyState),
      })).status,
      400,
    );
    assert.equal(
      (await request(`/blocks/${photoOnly.id}`, "PATCH", {
        images: [photo],
        expected: snapshot(photoOnlyState),
      })).status,
      200,
    );
    // Null legacy content/images and URL punctuation survive JSON CAS exactly.
    const nullBlock = await create({ content: "legacy" });
    await db.query("UPDATE blocks SET images=NULL WHERE id=$1", [nullBlock.id]);
    const nullState = (await db.query<{ item: Record<string, unknown> }>(
      "SELECT to_jsonb(b) item FROM blocks b WHERE id=$1",
      [nullBlock.id],
    )).rows[0].item;
    assert.equal(
      (await request(`/blocks/${nullBlock.id}`, "PATCH", {
        images: [photo],
        expected: snapshot(nullState),
      })).status,
      200,
    );
    const longBlock = await create({
      content: "長い日記○○。".repeat(3000),
      images: ['https://example.com/a,b?q="x"&path=%5C'],
    });
    assert.equal(
      (await request(`/blocks/${longBlock.id}`, "PATCH", {
        images: [photo],
        expected: snapshot(longBlock),
      })).status,
      200,
    );
    const write = calls.find((x) =>
      x.url.pathname.endsWith("/rpc/update_block_api")
    )!;
    assert.deepEqual(write.body, {
      p_user_id: owner,
      p_block_id: block.id,
      p_expected: snapshot(block),
      p_updates: { images: [oldPhoto, photo] },
    });
    assert.equal(
      write.url.search,
      "",
      "Snapshot text must never be sent as query parameters",
    );
  });
});

Deno.test("concurrent snapshot reuse, UI tag edit and ABA content edit return 409; no data loss", async () => {
  await withDatabase(async (db) => {
    const block = await create();
    // Each required snapshot value matters even when the revision is current.
    for (
      const wrong of [
        { content: "別の本文" },
        { images: [] },
        { occurred_at: "2026-09-20T18:00:00Z" },
        { entry_id: other },
      ]
    ) {
      assert.equal(
        (await request(`/blocks/${block.id}`, "PATCH", {
          images: [photo],
          expected: { ...snapshot(block), ...wrong },
        })).status,
        409,
      );
    }
    const responses = await Promise.all(
      [photo, "https://example.com/other.jpg"].map((url) =>
        request(`/blocks/${block.id}`, "PATCH", {
          images: [url],
          expected: snapshot(block),
        })
      ),
    );
    assert.deepEqual(responses.map((x) => x.status).sort(), [200, 409]);
    const current = (await db.query<Record<string, unknown>>(
      "SELECT * FROM blocks WHERE id=$1",
      [block.id],
    )).rows[0];
    await db.query("UPDATE blocks SET tag='family' WHERE id=$1", [block.id]);
    assert.equal(
      (await request(`/blocks/${block.id}`, "PATCH", {
        images: [],
        expected: snapshot(current),
      })).status,
      409,
    );
    const fresh = (await db.query<Record<string, unknown>>(
      "SELECT * FROM blocks WHERE id=$1",
      [block.id],
    )).rows[0];
    await db.query("UPDATE blocks SET content='edited' WHERE id=$1", [
      block.id,
    ]);
    await db.query("UPDATE blocks SET content=$1 WHERE id=$2", [
      fresh.content,
      block.id,
    ]);
    assert.equal(
      (await request(`/blocks/${block.id}`, "PATCH", {
        images: [],
        expected: snapshot(fresh),
      })).status,
      409,
    );
  });
});

Deno.test("foreign owner, deleted block, missing/invalid bearer cannot update or read owner data", async () => {
  await withDatabase(async (db) => {
    const block = await create();
    const before = (await db.query("SELECT * FROM blocks")).rows;
    assert.equal(
      (await request(`/blocks/${block.id}`, "PATCH", {
        images: [],
        expected: snapshot(block),
      }, "synthetic-other")).status,
      409,
    );
    assert.equal(
      (await request(
        `/blocks/${block.id}`,
        "PATCH",
        { content: "bad" },
        "synthetic-other",
      )).status,
      404,
    );
    assert.equal(
      (await (await request(
        `/entries/${block.date}`,
        "GET",
        undefined,
        "synthetic-other",
      )).json()).data,
      null,
    );
    for (const token of ["", "invalid"]) {
      assert.equal(
        (await request(
          "/events",
          "POST",
          { content: "x", images: [photo] },
          token,
        )).status,
        401,
      );
      assert.equal(
        (await request(`/blocks/${block.id}`, "PATCH", {
          images: [],
          expected: snapshot(block),
        }, token)).status,
        401,
      );
    }
    assert.deepEqual((await db.query("SELECT * FROM blocks")).rows, before);
    await db.query("DELETE FROM blocks WHERE id=$1", [block.id]);
    assert.equal(
      (await request(`/blocks/${block.id}`, "PATCH", {
        images: [],
        expected: snapshot(block),
      })).status,
      409,
    );
  });
});

Deno.test("invalid create/update inputs never write diary data; legacy text APIs retain images", async () => {
  await withDatabase(async (db, calls) => {
    const block = await create();
    for (
      const body of [
        { images: [photo] },
        { images: null, expected: snapshot(block) },
        { images: Array(6).fill(photo), expected: snapshot(block) },
        { images: [photo, photo], expected: snapshot(block) },
        { images: ["http://x/a"], expected: snapshot(block) },
        { images: [], expected: {} },
        { unexpected: true },
      ]
    ) {
      assert.equal(
        (await request(`/blocks/${block.id}`, "PATCH", body)).status,
        400,
      );
    }
    const count = calls.filter((x) =>
      x.url.pathname.endsWith("/rpc/create_event_api")
    ).length;
    for (
      const body of [
        { content: "x", images: "bad" },
        { content: 2 },
        { content: "x", images: [photo, photo] },
        { content: "x", occurred_at: "bad" },
        { content: "x", occurred_at: "2099-01-01T00:00:00Z" },
      ]
    ) assert.equal((await request("/events", "POST", body)).status, 400);
    for (const body of [null, [], 42]) {
      assert.equal((await request("/events", "POST", body)).status, 400);
    }
    assert.equal(
      calls.filter((x) => x.url.pathname.endsWith("/rpc/create_event_api"))
        .length,
      count,
    );
    const text = await request(`/blocks/${block.id}`, "PATCH", {
      content: "本人の修正",
    });
    assert.equal(text.status, 200);
    assert.deepEqual((await text.json()).data.images, [oldPhoto]);
    const legacy = await request("/events", "POST", {
      content: "従来のテキスト",
      occurred_at: "2026-09-20T12:00:00+09:00",
      tag: "family",
      source: "legacy",
    });
    assert.equal(legacy.status, 200);
    const data = (await legacy.json()).data;
    assert.deepEqual(Object.keys(data).sort(), ["id", "message"]);
    const saved = (await db.query<
      { content: string; images: string[]; tag: string; source: string }
    >("SELECT * FROM blocks WHERE id=$1", [data.id])).rows[0];
    assert.equal(saved.content, "従来のテキスト");
    assert.deepEqual(saved.images, []);
    assert.equal(saved.tag, "family");
    assert.equal(saved.source, "legacy");
    assert.equal(
      (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM blocks"))
        .rows[0].n,
      2,
    );
  });
});

Deno.test("durable idempotency: concurrent duplicate, lost response, changed payload, user scope, failure rollback and deletion", async () => {
  await withDatabase(async (db) => {
    const pair = await Promise.all([
      create({}, "synthetic-key"),
      create({}, "synthetic-key"),
    ]);
    assert.equal(pair[0].id, pair[1].id);
    assert.deepEqual(pair.map((x) => x.replayed).sort(), [false, true]);
    const again = await create({}, "synthetic-key");
    assert.equal(again.id, pair[0].id);
    assert.equal(again.replayed, true);
    assert.equal(
      (await request(
        "/events",
        "POST",
        { content: "違う本文" },
        "synthetic-owner",
        "synthetic-key",
      )).status,
      409,
    );
    assert.equal(
      (await request(
        "/events",
        "POST",
        { content: "別所有者" },
        "synthetic-other",
        "synthetic-key",
      )).status,
      200,
    );
    assert.equal(
      (await request(
        "/events",
        "POST",
        { content: "x" },
        "synthetic-owner",
        "bad key",
      )).status,
      400,
    );
    // SQL constraint failure must roll back the reservation and any new entry.
    assert.equal(
      (await request(
        "/events",
        "POST",
        { content: "x", tag: "invalid", occurred_at: "2026-08-01T12:00:00Z" },
        "synthetic-owner",
        "retry-after-failure",
      )).status,
      400,
    );
    assert.equal(
      (await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM event_api_receipts WHERE key='retry-after-failure'",
      )).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM entries WHERE date='2026-08-01'",
      )).rows[0].n,
      0,
    );
    await create({}, "retry-after-failure");
    await db.query("DELETE FROM blocks WHERE id=$1", [again.id]);
    assert.equal((await create({}, "synthetic-key")).id, again.id);
    assert.equal(
      (await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM blocks WHERE id=$1",
        [again.id],
      )).rows[0].n,
      0,
    );
    // Omitted timestamp is frozen by the original receipt, not recomputed.
    const nowBody = { content: "時刻省略" };
    const a = await (await request(
      "/events",
      "POST",
      nowBody,
      "synthetic-owner",
      "now-key",
    )).json();
    const b = await (await request(
      "/events",
      "POST",
      nowBody,
      "synthetic-owner",
      "now-key",
    )).json();
    assert.equal(a.data.id, b.data.id);
    assert.equal(a.data.occurred_at, b.data.occurred_at);
  });
});

Deno.test("Cloud migration constraints, client privilege revocation and profile account cleanup", async () => {
  const db = await database(true);
  try {
    const constraint = await db.query<{ parent: string }>(`
      SELECT confrelid::regclass::text AS parent FROM pg_constraint
      WHERE conrelid='public.event_api_receipts'::regclass AND contype='f'
    `);
    assert.deepEqual(constraint.rows, [{ parent: "profiles" }]);
    const state = await db.query<{ rls: boolean }>(
      "SELECT relrowsecurity rls FROM pg_class WHERE oid='public.event_api_receipts'::regclass",
    );
    assert.equal(state.rows[0].rls, true);
    for (const role of ["anon", "authenticated"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const access = await db.query<{ allowed: boolean }>(
          "SELECT has_table_privilege($1,'public.event_api_receipts',$2) allowed",
          [role, privilege],
        );
        assert.equal(access.rows[0].allowed, false);
      }
    }
    await db.query(
      "SELECT create_event_api($1,$2::jsonb,'account-cleanup-key')",
      [owner, JSON.stringify({ content: "架空の所有者の日記" })],
    );
    await db.query(
      "SELECT create_event_api($1,$2::jsonb,'account-cleanup-key')",
      [other, JSON.stringify({ content: "架空の別所有者の日記" })],
    );
    await db.query("DELETE FROM auth.users WHERE id=$1", [owner]);
    const receipts = await db.query<{ user_id: string }>(
      "SELECT user_id FROM event_api_receipts",
    );
    assert.deepEqual(receipts.rows, [{ user_id: other }]);
    const profiles = await db.query<{ user_id: string }>(
      "SELECT user_id FROM profiles",
    );
    assert.deepEqual(profiles.rows, [{ user_id: other }]);
  } finally {
    await db.close();
  }
});

Deno.test("database RPC and receipts are inaccessible to anon/authenticated roles", async () => {
  const db = await database();
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(
        db.query("SELECT create_event_api($1, $2::jsonb, 'key')", [
          owner,
          JSON.stringify({ content: "x" }),
        ]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT update_block_api($1,$2,'{}'::jsonb,'{}'::jsonb)", [
          owner,
          owner,
        ]),
        /permission denied/,
      );
      await assert.rejects(
        db.query("SELECT * FROM event_api_receipts"),
        /permission denied/,
      );
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE service_role");
    assert.equal(
      (await db.query("SELECT create_event_api($1,$2::jsonb,'key') AS result", [
        owner,
        JSON.stringify({ content: "x" }),
      ])).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});

Deno.test("OpenAPI and CORS expose attachments, versioned CAS, readback, idempotency and errors", async () => {
  const spec = await (await app.request("/api/openapi.json")).json();
  const createSpec = spec.paths["/events"].post;
  const patch = spec.paths["/blocks/{id}"].patch;
  assert.equal(
    createSpec.requestBody.content["application/json"].schema.properties.images
      .maxItems,
    5,
  );
  assert.ok(
    createSpec.parameters.some((p: { name: string }) =>
      p.name === "Idempotency-Key"
    ),
  );
  assert.deepEqual(
    patch.requestBody.content["application/json"].schema.properties.expected
      .required,
    ["content", "images", "occurred_at", "entry_id", "revision"],
  );
  assert.ok(spec.components.schemas.Entry.properties.blocks);
  for (const code of ["400", "401", "409", "500"]) {
    assert.ok(createSpec.responses[code]);
    assert.ok(patch.responses[code]);
  }
  const cors = await app.request("/api/events", { method: "OPTIONS" });
  assert.match(
    cors.headers.get("Access-Control-Allow-Headers")!,
    /idempotency-key/i,
  );
});
