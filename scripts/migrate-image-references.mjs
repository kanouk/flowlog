#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const values = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") values.apply = true;
    else if (arg.startsWith("--")) values[arg.slice(2).replaceAll("-", "_")] = argv[++index];
  }
  return values;
}

const args = parseArgs(process.argv.slice(2));
const required = ["manifest", "start_date", "end_date", "backup"];
for (const name of required) {
  if (!args[name]) throw new Error(`--${name.replaceAll("_", "-")} is required`);
}

const token = process.env.FLOWLOG_API_TOKEN;
if (!token) throw new Error("FLOWLOG_API_TOKEN is required");

const apiBase = args.api_base || "https://wdvwnbeofakzihmjacko.supabase.co/functions/v1/api";
const manifest = JSON.parse(await readFile(resolve(args.manifest), "utf8"));
const mappings = Object.values(manifest.uploads_by_sha256 || {}).map((record) => ({
  flowlog_block_id: record.flowlog_block_id,
  flowlog_image_index: record.flowlog_image_index,
  source_url: record.source_url,
  image_url: record.image_url,
}));

const response = await fetch(`${apiBase}/image-reference-migrations`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    start_date: args.start_date,
    end_date: args.end_date,
    dry_run: !args.apply,
    mappings,
  }),
});
const responseText = await response.text();
let result;
try {
  result = JSON.parse(responseText);
} catch {
  throw new Error(`Migration API returned ${response.status}: ${responseText.slice(0, 500)}`);
}
if (!response.ok || !result.success) {
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} else {
  const backupPath = resolve(args.backup);
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, `${JSON.stringify({
    created_at: new Date().toISOString(),
    api_base: apiBase,
    start_date: args.start_date,
    end_date: args.end_date,
    applied: args.apply,
    manifest_path: resolve(args.manifest),
    ...result,
  }, null, 2)}\n`);
  console.log(JSON.stringify(result.counts, null, 2));
  console.log(`backup=${backupPath}`);
}
