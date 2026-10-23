import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { CARD_MIME_TYPE, CARD_NAMES } from "@dayform/contracts";
import { createApp } from "../src/app.ts";
import { loadTools } from "../src/core/registry.ts";
import { connect, listen } from "./helpers.ts";
process.env.LOAD_SAMPLE_TOOLS = "1"; // the sample ping tool is test-only

let base: string;
let url: string;
let server: Server;
beforeAll(async () => {
  process.env.DEMO_MODE = "false";
  ({ base, url, server } = await listen(createApp(await loadTools())));
});
afterAll(() => void server.close());

describe("server", () => {
  it("negotiates 2025-11-25, lists the sample ping from src/tools/_sample and answers it", async () => {
    const { client, transport } = await connect(url);
    expect(transport.protocolVersion).toBe("2025-11-25");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("ping");
    const r = await client.callTool({ name: "ping", arguments: {} });
    expect(Date.parse((r.structuredContent as any).server_time)).toBeGreaterThan(0);
    await client.close();
  });

  it("serves the 8 cards as ui://cards/<name> with the MCP Apps MIME type", async () => {
    const { client } = await connect(url);
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual(CARD_NAMES.map((n) => `ui://cards/${n}`).sort());
    const r = await client.readResource({ uri: "ui://cards/rings" });
    expect(r.contents[0].mimeType).toBe(CARD_MIME_TYPE);
    expect(String((r.contents[0] as { text: string }).text)).toContain("<html");
    await client.close();
  });

  it("/health answers; admin routes are 404 when DEMO_MODE=false", async () => {
    expect((await fetch(`${base}/health`)).status).toBe(200);
    const r = await fetch(`${base}/admin/status`, { headers: { "x-admin-token": "test-token" } });
    expect(r.status).toBe(404);
  });

  it("UNDERSTANDING=server swaps inputs to {text}", async () => {
    process.env.UNDERSTANDING = "server";
    const s = await listen(createApp(await loadTools()));
    try {
      const { client } = await connect(s.url);
      const { tools } = await client.listTools();
      expect(Object.keys(tools.find((t) => t.name === "ping")!.inputSchema.properties ?? {})).toEqual(["text"]);
      // T-28 landed: the call now goes through parseRequest (a real model call), covered by test/understanding.test.ts.
      await client.close();
    } finally {
      delete process.env.UNDERSTANDING;
      s.server.close();
    }
  });
});
