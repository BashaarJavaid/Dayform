// npm run overnight -- [--date YYYY-MM-DD] [--live | --cached]
// Default date: the day after the demo clock's day (DEMO_MODE=true), else today in DEMO_TZ.
// Default mode: OVERNIGHT_MODE (cached unless set to live).
import "./env.ts";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { date: { type: "string" }, live: { type: "boolean" }, cached: { type: "boolean" } } });
const { clock } = await import("../../server/src/core/clock.ts");
const { env } = await import("../../server/src/core/env.ts");
const { addDays, localDate } = await import("../../server/src/domain/targets/index.ts");
const { prepareDay } = await import("../../server/src/tools/brief/overnight.ts");

const today = localDate(await clock.now());
const date = values.date ?? (env.demoMode() ? addDays(today, 1) : today);
const mode = values.live ? "live" : values.cached ? "cached" : env.overnightMode();
console.log(`overnight: date ${date}, mode ${mode}`);
try {
  const r = await prepareDay(date, mode);
  console.log(`overnight: done in ${r.ms} ms`);
  console.log(JSON.stringify(r.brief, null, 2));
  process.exit(0);
} catch (e) {
  console.error("overnight: failed", e);
  process.exit(1);
}
