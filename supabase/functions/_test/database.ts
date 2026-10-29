import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
export const owner = "11111111-1111-4111-8111-111111111111";
export const other = "99999999-9999-4999-8999-999999999999";
export async function database(cloudMigrationGuard = false) {
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
