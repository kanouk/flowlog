// One selected block only. Backups contain private diary data: keep them outside Git.
import {
  isExpectedBlock,
  validateImages,
} from "../supabase/functions/api/native-images.ts";

const base = "https://wdvwnbeofakzihmjacko.supabase.co/functions/v1/api";
type Block = Record<string, unknown> & {
  id: string;
  revision: number;
  images: string[] | null;
};
type Entry = Record<string, unknown> & { date: string; blocks: Block[] };
type Manifest = {
  version: 1;
  date: string;
  block_id: string;
  images: string[];
  before: Entry;
};
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map((
        [k, v],
      ) => [k, canonical(v)]),
    );
  }
  return value;
}
export function compareCanary(manifest: Manifest, after: Entry): string[] {
  const errors: string[] = [];
  const {
    blocks: beforeBlocks,
    formatted_content: _renderedBefore,
    ...beforeEntry
  } = manifest.before;
  const {
    blocks: afterBlocks,
    formatted_content: _renderedAfter,
    ...afterEntry
  } = after;
  if (!same(beforeEntry, afterEntry)) {
    errors.push(
      "Entry fields changed (including stored diary text/date/timestamps)",
    );
  }
  if (
    !Array.isArray(afterBlocks) || beforeBlocks.length !== afterBlocks.length
  ) return [...errors, "Block membership changed"];
  for (const before of beforeBlocks) {
    const current = afterBlocks.find((b) => b.id === before.id);
    if (!current) {
      errors.push("A block disappeared");
      continue;
    }
    if (before.id !== manifest.block_id) {
      if (!same(before, current)) errors.push("An unrelated block changed");
      continue;
    }
    const { images: _a, revision: _b, ...fieldsBefore } = before;
    const { images: _c, revision: _d, ...fieldsAfter } = current;
    if (!same(fieldsBefore, fieldsAfter)) {
      errors.push("Target text/date/tag or other non-image fields changed");
    }
    if (!same(current.images, manifest.images)) {
      errors.push("Target image URLs differ from the proposed images");
    }
    if (current.revision !== before.revision + 1) {
      errors.push("Unexpected revision; another write may have occurred");
    }
  }
  return errors;
}
async function api(path: string, method = "GET", body?: unknown) {
  const token = Deno.env.get("FLOWLOG_API_TOKEN");
  if (!token) {
    throw new Error(
      "FLOWLOG_API_TOKEN is required; load it without printing it",
    );
  }
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(`API failed (${response.status}); stop and read again`);
  }
  return json.data;
}
async function read(date: string): Promise<Entry> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date");
  const entry = await api(`/entries/${date}`);
  if (
    !entry || !Array.isArray(entry.blocks) ||
    !("stored_formatted_content" in entry)
  ) throw new Error("Deployed readback API is missing or no entry exists");
  return entry;
}
async function save(path: string, value: unknown) {
  await Deno.writeTextFile(path, JSON.stringify(value, null, 2) + "\n", {
    createNew: true,
    mode: 0o600,
  });
  await Deno.chmod(path, 0o600);
}
async function main(args: string[]) {
  const mode = args[0];
  const options = new Map<string, string>();
  for (let i = 1; i < args.length; i += 2) {
    if (!args[i]?.startsWith("--") || args[i + 1] === undefined) {
      throw new Error("Expected --option value");
    }
    options.set(args[i], args[i + 1]);
  }
  const required = (key: string) => {
    const value = options.get(key);
    if (!value) throw new Error(`${key} is required`);
    return value;
  };
  if (mode === "prepare") {
    const date = required("--date"),
      id = required("--block"),
      images = JSON.parse(required("--images"));
    const error = validateImages(images);
    if (error) throw new Error(error);
    const before = await read(date);
    const block = before.blocks.find((b) => b.id === id);
    if (!block || !isExpectedBlock(block)) {
      throw new Error("Selected block is missing or has no revision");
    }
    await save(required("--out"), {
      version: 1,
      date,
      block_id: id,
      images,
      before,
    });
    console.log("Prepared one private before-snapshot. No write performed.");
    return;
  }
  if (mode !== "apply" && mode !== "verify") {
    throw new Error(
      "Usage: prepare|apply|verify (see docs/photo-diary-api.md)",
    );
  }
  const path = required("--manifest");
  const manifest: Manifest = JSON.parse(await Deno.readTextFile(path));
  if (
    manifest.version !== 1 || validateImages(manifest.images) ||
    manifest.date !== manifest.before?.date ||
    !manifest.before.blocks.some((b) => b.id === manifest.block_id)
  ) throw new Error("Invalid manifest");
  if (mode === "apply") {
    const current = await read(manifest.date);
    if (!same(current, manifest.before)) {
      throw new Error(
        "Snapshot changed since preparation. Stop; do not overwrite.",
      );
    }
    const block = manifest.before.blocks.find((b) =>
      b.id === manifest.block_id
    )!;
    const expected = Object.fromEntries(
      ["content", "images", "occurred_at", "entry_id", "revision"].map(
        (k) => [k, block[k]],
      ),
    );
    if (!isExpectedBlock(expected)) {
      throw new Error("Invalid expected snapshot");
    }
    // Never resend blindly after an ambiguous response: the independent GET below
    // can prove the change or flag it for review without another write.
    try {
      await api(`/blocks/${manifest.block_id}`, "PATCH", {
        images: manifest.images,
        expected,
      });
    } catch {
      console.error(
        "PATCH did not confirm success. Checking independently; no automatic retry.",
      );
    }
  }
  const after = await read(manifest.date);
  const errors = compareCanary(manifest, after);
  const result = {
    after,
    errors,
    api_verified: errors.length === 0,
    screen_verified: false,
    rendered_content_changed: !same(
      manifest.before.formatted_content,
      after.formatted_content,
    ),
  };
  await save(`${path}.${Date.now()}.after.json`, result);
  if (errors.length) {
    throw new Error(
      `Unexpected changes detected: ${
        errors.join("; ")
      }. Stop; preserve snapshots. Do not bulk apply or restore blindly.`,
    );
  }
  console.log(
    "API readback verified: only selected images and revision changed. Screen display remains unverified; inspect FlowLog separately.",
  );
}
if (import.meta.main) {
  main(Deno.args).catch((error) => {
    console.error(error.message);
    Deno.exit(1);
  });
}
