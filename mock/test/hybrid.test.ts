// Hybrid mode: REAL_TOOLS go to a second MCP server (a stub), with elicitation and progress relayed.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMockApp } from "../src/app.ts";
import { loadFixtures } from "../src/fixtures.ts";
import { connect, listen } from "./helpers.ts";

function stubApp() {
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const app = express();
  app.use(express.json());
  app.post("/mcp", async (req, res) => {
    let t = transports.get(req.header("mcp-session-id") ?? "");
    if (!t) {
      if (!isInitializeRequest(req.body)) return void res.status(400).end();
      const s = new McpServer({ name: "stub", version: "0.0.0" });
      s.registerTool("ping", { inputSchema: {}, outputSchema: { pong: z.literal("stub") } }, async () => ({
        content: [{ type: "text", text: "pong" }],
        structuredContent: { pong: "stub" },
      }));
      s.registerTool("ask", { inputSchema: {} }, async (_a, extra) => {
        const token = extra._meta?.progressToken;
        if (token !== undefined)
          await extra.sendNotification({
            method: "notifications/progress",
            params: { progressToken: token, progress: 1, message: "thinking" },
          });
        const r = await s.server.elicitInput(
          {
            mode: "form",
            message: "Stub asks?",
            requestedSchema: { type: "object", properties: { confirm: { type: "boolean" } } },
          },
          { relatedRequestId: extra.requestId },
        );
        return { content: [{ type: "text", text: `answer:${r.action}` }] };
      });
      const nt = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => void transports.set(id, nt),
      });
      await s.connect(nt);
      t = nt;
    }
    await t.handleRequest(req, res, req.body);
  });
  return app;
}

let stub: { url: string; server: Server };
let mock: { url: string; server: Server };
beforeAll(async () => {
  stub = await listen(stubApp());
  mock = await listen(
    createMockApp({ fixtures: loadFixtures(), passthroughUrl: stub.url, realTools: ["ping", "ask"] }),
  );
});
afterAll(() => {
  mock.server.close();
  stub.server.close();
});

describe("hybrid mode", () => {
  it("forwards ping to the stub and keeps serving fixtures for the rest", async () => {
    const { client } = await connect(mock.url);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("ping");
    expect(names).toHaveLength(20);
    expect((await client.callTool({ name: "ping", arguments: {} })).structuredContent).toEqual({ pong: "stub" });
    expect((await client.callTool({ name: "view_cart", arguments: {} })).structuredContent).toMatchObject({
      item_count: 14,
    });
    await client.close();
  });

  it("relays the stub's elicitation and progress to the caller", async () => {
    const { client, elicitations } = await connect(mock.url, { action: "accept", content: { confirm: true } });
    const progress: unknown[] = [];
    const r = await client.callTool({ name: "ask", arguments: {} }, undefined, { onprogress: (p) => progress.push(p) });
    expect(elicitations).toEqual([expect.objectContaining({ message: "Stub asks?" })]);
    expect(r.content).toEqual([{ type: "text", text: "answer:accept" }]);
    expect(progress).toEqual([expect.objectContaining({ progress: 1, message: "thinking" })]);
    await client.close();
  });
});
