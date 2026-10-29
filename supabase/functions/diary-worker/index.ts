import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { createWorkerHandler } from "./worker.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
Deno.serve(createWorkerHandler(Deno.env.get("DIARY_WORKER_SECRET"), client));
