// Lambda handler (T-27 task 2): EventBridge Scheduler calls it at 03:00 Asia/Karachi (deployed in T-40).
// Prepares today's morning in DEMO_TZ with the live job. Env from T-40: DB_DRIVER=data-api, AURORA_*, REASONING_MODEL_*.
import { localDate } from "../../server/src/domain/targets/index.ts";
import { prepareDay } from "../../server/src/tools/brief/overnight.ts";

export const handler = async (event: { date?: string } | undefined) => {
  const date = event?.date ?? localDate(new Date());
  const r = await prepareDay(date, "live");
  return { ok: true, date, ms: r.ms, steps: r.steps, brief: r.brief };
};
