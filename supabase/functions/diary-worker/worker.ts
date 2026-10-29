import {
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.89.0";
import {
  type Block,
  generateDiaryScore,
  generateDiaryText,
  getFeatureConfig,
} from "../format-entries/diary.ts";

type Client = SupabaseClient;
export type GeneratedDiary = {
  formatted_content: string;
  score?: number;
  score_details?: string;
};
export type DiaryJob = {
  user_id: string;
  date: string;
  lease_token: string;
  input: { blocks: Block[]; dayBoundaryHour: number };
};
export async function runDiaryWorker(
  client: Client,
  generate: (job: DiaryJob) => Promise<string | GeneratedDiary> = async (
    job,
  ) => {
    const config = await getFeatureConfig(
      client,
      job.user_id,
      "diary_format",
      true,
    );
    const diary = await generateDiaryText(
      job.input.blocks,
      job.date,
      job.input.dayBoundaryHour,
      config,
    );
    const scoreConfig = await getFeatureConfig(
      client,
      job.user_id,
      "score_evaluation",
      true,
    ).catch(() => null);
    const score = await generateDiaryScore(
      diary.formatted_content,
      job.input.dayBoundaryHour,
      scoreConfig,
    );
    return { ...diary, ...score };
  },
): Promise<string> {
  const { data: job, error } = await client.rpc("claim_diary_generation");
  if (error) throw new Error("Cannot claim diary job");
  if (!job) return "idle";
  if (job.skipped) return "unchanged";
  let content: string | null = null;
  let failed = false;
  let score: number | null = null;
  let scoreDetails: string | null = null;
  try {
    const result = job.input.blocks.length ? await generate(job) : "";
    content = typeof result === "string" ? result : result.formatted_content;
    if (typeof result !== "string") {
      score = result.score ?? null;
      scoreDetails = result.score_details ?? null;
    }
  } catch {
    failed = true;
  } // Never expose model errors, API keys or diary text in logs.
  const { data: result, error: finishError } = await client.rpc(
    "finish_diary_generation",
    {
      p_user_id: job.user_id,
      p_date: job.date,
      p_token: job.lease_token,
      p_content: content,
      p_score: score,
      p_score_details: scoreDetails,
      p_error: failed ? "generation_failed" : null,
    },
  );
  if (finishError) {
    throw new Error("Cannot finish diary job; lease recovery will retry");
  }
  return result;
}

export function createWorkerHandler(
  secret: string | undefined,
  client: Client,
) {
  return async (req: Request) => {
    if (req.method !== "POST") return new Response(null, { status: 405 });
    if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
      return new Response(null, { status: 401 });
    }
    try {
      // One bounded job per invocation; the durable queue and scheduler own retries.
      return Response.json({ status: await runDiaryWorker(client) });
    } catch {
      return Response.json({ error: "Worker failed" }, { status: 500 });
    }
  };
}
