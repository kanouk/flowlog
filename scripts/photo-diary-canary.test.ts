import assert from "node:assert/strict";
import { compareCanary } from "./photo-diary-canary.ts";
Deno.test("canary detects diary, timestamp, sibling and membership mutations separately from image changes", () => {
  const block = {
    id: "a",
    revision: 1,
    images: ["https://x/old"],
    content: "架空の日記。○○",
    occurred_at: "2026-09-20T10:00:00Z",
    entry_id: "entry",
    tag: "private",
  };
  const sibling = { ...block, id: "b" };
  const before = {
    date: "2026-09-20",
    stored_formatted_content: "保存本文",
    formatted_content: "表示本文",
    blocks: [block, sibling],
  };
  const manifest = {
    version: 1 as const,
    date: before.date,
    block_id: block.id,
    images: ["https://x/new"],
    before,
  };
  const valid = {
    ...structuredClone(before),
    blocks: [{ ...block, revision: 2, images: manifest.images }, sibling],
  };
  assert.deepEqual(compareCanary(manifest, valid), []);
  const variants = [
    { ...valid, stored_formatted_content: "勝手な整形" },
    { ...valid, date: "2026-09-21" },
    {
      ...valid,
      blocks: [{ ...valid.blocks[0], content: "勝手な修正" }, sibling],
    },
    {
      ...valid,
      blocks: [
        { ...valid.blocks[0], occurred_at: "2026-09-20T11:00:00Z" },
        sibling,
      ],
    },
    {
      ...valid,
      blocks: [valid.blocks[0], { ...sibling, content: "他の本文変更" }],
    },
    { ...valid, blocks: [valid.blocks[0]] },
    { ...valid, blocks: [{ ...valid.blocks[0], revision: 3 }, sibling] },
    {
      ...valid,
      blocks: [{ ...valid.blocks[0], images: block.images }, sibling],
    },
  ];
  for (const after of variants) {
    assert.ok(compareCanary(manifest, after).length > 0);
  }
});
