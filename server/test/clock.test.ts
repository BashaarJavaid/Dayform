import { afterAll, describe, expect, it } from "vitest";
import { clock } from "../src/core/clock.ts";

afterAll(() => void (process.env.DEMO_MODE = "false"));
const near = (a: Date, iso: string) => expect(Math.abs(a.getTime() - Date.parse(iso))).toBeLessThan(500);

describe("clock", () => {
  it("follows the demo_clock table when DEMO_MODE=true, and runs on from the set time", async () => {
    process.env.DEMO_MODE = "true";
    await clock.set(new Date("2026-10-23T08:00:00.000Z"));
    near(await clock.now(), "2026-10-23T08:00:00.000Z");
    await new Promise((r) => setTimeout(r, 300));
    const t = (await clock.now()).getTime() - Date.parse("2026-10-23T08:00:00.000Z");
    expect(t).toBeGreaterThanOrEqual(300);
    await clock.set(new Date("2026-10-24T02:00:00.000Z"));
    near(await clock.now(), "2026-10-24T02:00:00.000Z");
  });

  it("uses real time when DEMO_MODE=false", async () => {
    process.env.DEMO_MODE = "false";
    near(await clock.now(), new Date().toISOString());
  });
});
