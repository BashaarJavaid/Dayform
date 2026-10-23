// Admin routes (DESIGN §8). Mounted only when DEMO_MODE=true (otherwise 404), guarded by ADMIN_TOKEN.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import express from "express";
import { ADMIN_ROUTES, TimerSpeedRequest, type StatusResponse } from "@dayform/contracts";
import { clock } from "./clock.ts";
import { env } from "./env.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
let lastReset: string | null = null;

// T-11's reset is a script (db workspace `db:reset`); run it as one so its module shape doesn't matter.
function runReset(): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn("npm", ["run", "db:reset", "-w", "@dayform/db"], { cwd: ROOT, env: process.env, timeout: 30_000 });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code: code ?? 1, out }));
    p.on("error", (e) => resolve({ code: 1, out: String(e) }));
  });
}

export function adminRouter() {
  const r = express.Router();
  r.use("/admin", (req, res, next) => {
    const token = env.adminToken();
    // x-admin-token (orchestrator) or Authorization: Bearer (contracts/admin.ts).
    const given = req.header("x-admin-token") ?? req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || given !== token) return void res.status(401).json({ ok: false, error: "bad admin token" });
    next();
  });

  r.post(ADMIN_ROUTES.reset.path, async (_req, res) => {
    const t0 = performance.now();
    const { code, out } = await runReset();
    if (code !== 0) {
      const missing = /missing script|Cannot find module.*reset/i.test(out);
      return void res.status(missing ? 501 : 500).json({
        ok: false,
        error: missing ? "reset script not present yet (T-11: db/src/reset.ts)" : out.trim().slice(-500),
      });
    }
    lastReset = new Date().toISOString();
    res.json({ ok: true, clock: (await clock.now()).toISOString(), ms: Math.round(performance.now() - t0) });
  });

  r.post(ADMIN_ROUTES.advanceDay.path, async (_req, res) => {
    const t0 = performance.now();
    // TODO(T-27): run runOvernight() here before moving the clock.
    const next = await clock.now();
    next.setDate(next.getDate() + 1);
    next.setHours(7, 0, 0, 0);
    await clock.set(next);
    res.json({
      ok: true,
      clock: next.toISOString(),
      overnight: { mode: env.overnightMode(), ms: Math.round(performance.now() - t0) },
      note: "overnight job not wired yet (T-27); clock moved only",
    });
  });

  r.post(ADMIN_ROUTES.timerSpeed.path, async (req, res) => {
    const body = TimerSpeedRequest.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ ok: false, error: body.error.message });
    await clock.setRestSeconds(body.data.rest_seconds);
    res.json({ ok: true, rest_seconds: body.data.rest_seconds });
  });

  r.get(ADMIN_ROUTES.status.path, async (_req, res) => {
    const status: StatusResponse & { last_reset: string | null } = {
      demo_mode: env.demoMode(),
      clock: (await clock.now()).toISOString(),
      rest_seconds: await clock.restSeconds(),
      overnight_mode: env.overnightMode(),
      understanding: env.understanding(),
      checkout_confirm: env.checkoutConfirm(),
      db_driver: env.dbDriver(),
      last_reset: lastReset,
    };
    res.json(status);
  });

  // Errors (e.g. database down) answer as JSON, never hang.
  r.use((e: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    void res.status(500).json({ ok: false, error: e.message }),
  );
  return r;
}
