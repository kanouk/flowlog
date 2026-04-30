import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseScoreResult } from "./score-parser.ts";

Deno.test("parseScoreResult parses plain JSON", () => {
  const result = parseScoreResult('{"score":85,"deductions":[{"rule":"睡眠","points":-15,"reason":"6時間"}],"summary":"睡眠以外は良好"}');
  if (!result.ok) throw new Error(result.reason);

  assertEquals(result.value.score, 85);
  assertEquals(result.value.deductions.length, 1);
});

Deno.test("parseScoreResult parses fenced JSON", () => {
  const result = parseScoreResult('```json\n{"score":"100","deductions":[],"summary":"達成"}\n```');
  if (!result.ok) throw new Error(result.reason);

  assertEquals(result.value.score, 100);
  assertEquals(result.value.summary, '達成');
});

Deno.test("parseScoreResult preserves zero score", () => {
  const result = parseScoreResult('{"score":0,"deductions":[],"summary":"全違反"}');
  if (!result.ok) throw new Error(result.reason);

  assertEquals(result.value.score, 0);
});

Deno.test("parseScoreResult rejects markdown score", () => {
  const result = parseScoreResult('# 採点結果\n\nスコア: 70点\n\n- TikTokを開いたため減点');

  assertEquals(result.ok, false);
});

Deno.test("parseScoreResult rejects responses without score", () => {
  const result = parseScoreResult('採点結果です。よくできました。');

  assertEquals(result.ok, false);
});
