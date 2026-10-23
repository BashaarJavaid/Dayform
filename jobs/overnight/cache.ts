// npm run overnight:cache: reset to the bare seed, run the overnight job live for the morning after demo day,
// save its rows to cache/overnight-cache.json (the shape T-11's reset loads), then reset again so the
// database holds seed + cache. OVERNIGHT_MODE=cached serves this file, so S5 is the same every take.
import "./env.ts";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const { getDb } = await import("../../server/src/core/db.ts");
const { clock } = await import("../../server/src/core/clock.ts");
const { addDays, localDate } = await import("../../server/src/domain/targets/index.ts");
const { CACHE_FILE, dumpRows, runOvernight } = await import("../../server/src/tools/brief/overnight.ts");
const { reset } = await import("../../db/src/reset.ts");

const backup = existsSync(CACHE_FILE) ? readFileSync(CACHE_FILE, "utf8") : null;
rmSync(CACHE_FILE, { force: true });
try {
  await reset(await getDb());
  const date = addDays(localDate(await clock.now()), 1);
  const r = await runOvernight(date);
  const rows = await dumpRows(date);
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(rows, null, 2) + "\n");
  await reset(await getDb());
  console.log(`overnight:cache: live run ${r.ms} ms; wrote ${CACHE_FILE} (${Object.entries(rows).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k}=${(v as unknown[]).length}`).join(" ")}); database reset with the cache loaded`);
  process.exit(0);
} catch (e) {
  if (backup) writeFileSync(CACHE_FILE, backup);
  console.error("overnight:cache: failed; previous cache restored", e);
  process.exit(1);
}
