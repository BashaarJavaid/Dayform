import { z } from "zod";
import { DateTimeStr } from "./common.ts";

/** Admin routes (DESIGN §8): DEMO_MODE=true only, header `Authorization: Bearer <ADMIN_TOKEN>`. */
export const ADMIN_ROUTES = {
  reset: { method: "POST", path: "/admin/reset" },
  advanceDay: { method: "POST", path: "/admin/advance-day" },
  timerSpeed: { method: "POST", path: "/admin/timer-speed" },
  status: { method: "GET", path: "/admin/status" },
} as const;

export const ResetResponse = z.object({ ok: z.literal(true), clock: DateTimeStr, ms: z.number() });

export const AdvanceDayResponse = z.object({
  ok: z.literal(true),
  clock: DateTimeStr.describe("07:00 the next day."),
  overnight: z.object({ mode: z.enum(["live", "cached"]), ms: z.number() }),
});

export const TimerSpeedRequest = z.object({
  rest_seconds: z.number().int().positive().describe("e.g. 10 for the demo."),
});
export const TimerSpeedResponse = z.object({ ok: z.literal(true), rest_seconds: z.number().int().positive() });

export const StatusResponse = z.object({
  demo_mode: z.boolean(),
  clock: DateTimeStr,
  rest_seconds: z.number().int().positive().nullable().describe("Null when rest timers use program values."),
  overnight_mode: z.enum(["live", "cached"]),
  understanding: z.enum(["alexa", "server"]),
  checkout_confirm: z.enum(["elicitation", "tool"]),
  db_driver: z.enum(["pg", "data-api"]),
});
export type StatusResponse = z.infer<typeof StatusResponse>;
