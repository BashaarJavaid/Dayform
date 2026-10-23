import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.ts";
import { loadTools } from "../src/core/registry.ts";
import { connect, listen } from "./helpers.ts";

let url: string;
let server: Server;
beforeAll(async () => {
  const tools = await loadTools(fileURLToPath(new URL("./tools/", import.meta.url)));
  ({ url, server } = await listen(createApp(tools)));
});
afterAll(() => void server.close());

describe("registry and envelope", () => {
  it("loads a tool folder with no core edit; card tools carry _meta.ui.resourceUri", async () => {
    const { client } = await connect(url);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["log_water", "t_bad_output", "t_ok", "t_stream", "t_throws"]);
    expect(tools.find((t) => t.name === "log_water")?._meta?.ui).toEqual({ resourceUri: "ui://cards/rings" });
    expect(tools.find((t) => t.name === "t_ok")?._meta).toBeUndefined();
    await client.close();
  });

  it("success: structuredContent matches the contract, content is the fact text, card URI on the result", async () => {
    const { client } = await connect(url);
    const r = await client.callTool({ name: "log_water", arguments: { glasses: 2 } });
    expect(r.isError).toBeFalsy();
    expect((r.structuredContent as any).added_ml).toBe(500);
    expect(r.content).toEqual([{ type: "text", text: "Added 500 ml." }]);
    expect((r._meta as any).ui.resourceUri).toBe("ui://cards/rings");
    const ok = await client.callTool({ name: "t_ok", arguments: { n: 3 } });
    expect(ok.structuredContent).toEqual({ n: 3 });
    expect(ok._meta).toBeUndefined();
    await client.close();
  });

  it("errors: thrown error, contract-breaking output and bad input all return isError with a plain message", async () => {
    const { client } = await connect(url);
    const thrown = await client.callTool({ name: "t_throws", arguments: {} });
    expect(thrown).toMatchObject({ isError: true, content: [{ type: "text", text: "No meal logged today to correct." }] });
    const bad = await client.callTool({ name: "t_bad_output", arguments: {} });
    expect(bad).toMatchObject({ isError: true, content: [{ type: "text", text: "t_bad_output could not build a valid result." }] });
    expect(bad.structuredContent).toBeUndefined();
    const badIn = await client.callTool({ name: "t_ok", arguments: { n: "x" } });
    expect(badIn.isError).toBe(true);
    await client.close();
  });

  it("elicitation, progress and log ride the POST stream with the GET stream refused (AgentCore, F-009)", async () => {
    const c = await connect(url, { noGet: true });
    const progress: unknown[] = [];
    const r = await c.client.callTool({ name: "t_stream", arguments: {} }, undefined, {
      onprogress: (p) => void progress.push(p),
      timeout: 5000,
    });
    expect(c.gets.length).toBeGreaterThan(0); // the client did try the GET stream and got 405
    expect(c.elicitations).toHaveLength(1);
    expect(r.structuredContent).toEqual({ action: "accept", steps: 2 });
    expect(progress).toEqual([
      { progress: 1, total: 2, message: "half way" },
      { progress: 2, total: 2, message: "done" },
    ]);
    expect(c.logs).toEqual(["step 1: thinking"]);
    await c.client.close();
  });
});
