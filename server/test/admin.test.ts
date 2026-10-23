import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../src/app.ts";
import { clock } from "../src/core/clock.ts";
import { listen } from "./helpers.ts";

let base: string;
let server: Server;
const H = { "x-admin-token": "test-token", "content-type": "application/json" };
beforeAll(async () => {
  process.env.DEMO_MODE = "true";
  ({ base, server } = await listen(createApp([])));
});
afterAll(() => {
  process.env.DEMO_MODE = "false";
  server.close();
});

describe("admin routes (DEMO_MODE=true)", () => {
  it("rejects a missing or wrong token; accepts Bearer too", async () => {
    expect((await fetch(`${base}/admin/status`)).status).toBe(401);
    expect((await fetch(`${base}/admin/status`, { headers: { "x-admin-token": "nope" } })).status).toBe(401);
    expect((await fetch(`${base}/admin/status`, { headers: { authorization: "Bearer test-token" } })).status).toBe(200);
  });

  it("timer-speed, advance-day and status move the demo clock", async () => {
    await clock.set(new Date("2026-10-23T13:00:00.000Z"));
    const ts = await (await fetch(`${base}/admin/timer-speed`, { method: "POST", headers: H, body: JSON.stringify({ rest_seconds: 10 }) })).json();
    expect(ts).toEqual({ ok: true, rest_seconds: 10 });
    const adv = await (await fetch(`${base}/admin/advance-day`, { method: "POST", headers: H })).json();
    expect(adv.ok).toBe(true);
    // 07:00 the next day in DEMO_TZ (Asia/Karachi, UTC+5) = 02:00Z
    expect(adv.clock).toBe("2026-10-24T02:00:00.000Z");
    const st = await (await fetch(`${base}/admin/status`, { headers: H })).json();
    expect(st).toMatchObject({ demo_mode: true, rest_seconds: 10, db_driver: "pg" });
    expect(Math.abs(Date.parse(st.clock) - Date.parse("2026-10-24T02:00:00.000Z"))).toBeLessThan(1000);
    await clock.setRestSeconds(null);
  });

  it("reset answers clearly (501 until T-11's npm run db:reset exists, else ok)", async () => {
    const r = await fetch(`${base}/admin/reset`, { method: "POST", headers: H });
    const body = await r.json();
    if (r.status === 501) expect(body.error).toMatch(/reset script not present yet/);
    else expect(body.ok).toBe(true);
  }, 30_000);
});
