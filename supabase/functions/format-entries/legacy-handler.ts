import { corsHeaders } from "../_shared/cors.ts";
// Kept as a deployed tombstone so cached clients cannot run the old writer.
export function legacyFormatHandler(req: Request): Response {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error:
        "Use request_diary_generation; diary generation now runs on the server",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
