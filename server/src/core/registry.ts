// Tool registry: every server/src/tools/<domain>/index.ts exports `tools` (an array of defineTool(...)).
// Core wraps each handler in the result envelope (DESIGN §3, D16): structuredContent checked against the
// contract, a short factual `content` text, `_meta.ui.resourceUri` for tools with a card, isError on failure.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ElicitRequestFormParams,
  ElicitResult,
  LoggingLevel,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { CARD_URIS, ServerModeInput, type ToolContract } from "@dayform/contracts";
import { env } from "./env.ts";

export type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** What a handler gets besides its input. Everything here rides the tool call's own POST stream (F-009). */
export interface ToolCtx {
  extra: Extra;
  /** MCP progress notification; a no-op when the client sent no progressToken. */
  progress(progress: number, total?: number, message?: string): Promise<void>;
  /** MCP log message (the simulator's "Under the hood" panel). */
  log(data: unknown, level?: LoggingLevel): Promise<void>;
  /** Form elicitation, sent with relatedRequestId so it works without the GET stream (AgentCore). */
  elicit(params: Omit<ElicitRequestFormParams, "mode">): Promise<ElicitResult>;
}

export interface ToolReply<T> {
  /** structuredContent; must match the contract's output schema. */
  data: T;
  /** Short facts for Alexa to speak from. Not a script. */
  text: string;
}

export interface ToolDef<C extends ToolContract = ToolContract> {
  contract: C;
  handler: (args: z.infer<C["input"]>, ctx: ToolCtx) => Promise<ToolReply<z.input<C["output"]>>>;
}

export const defineTool = <C extends ToolContract>(contract: C, handler: ToolDef<C>["handler"]): ToolDef<C> => ({
  contract,
  handler,
});

/** A message the user may hear. Any thrown error becomes an isError result with its message. */
export class ToolError extends Error {}

export const TOOLS_DIR = fileURLToPath(new URL("../tools/", import.meta.url));

export async function loadTools(dir = TOOLS_DIR): Promise<ToolDef[]> {
  const defs: ToolDef[] = [];
  // Folders starting with "_" (the T-20 sample) load only in tests, so tools/list shows exactly the 18 contract tools.
  const dirs = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (!d.name.startsWith("_") || process.env.LOAD_SAMPLE_TOOLS === "1"))
    .map((d) => d.name)
    .sort();
  for (const name of dirs) {
    const file = join(dir, name, "index.ts");
    if (!existsSync(file)) continue;
    const mod = await import(pathToFileURL(file).href);
    if (!Array.isArray(mod.tools)) throw new Error(`${file} must export \`tools\` (an array of defineTool(...))`);
    defs.push(...mod.tools);
  }
  const names = defs.map((d) => d.contract.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`Tool ${dup} is defined twice`);
  return defs;
}

const errorResult = (message: string): CallToolResult => ({ isError: true, content: [{ type: "text", text: message }] });

// UNDERSTANDING=server (D3): T-28 provides server/src/understanding/index.ts with
// `parseRequest(contract, text, ctx)` returning the alexa-mode input.
async function understand(contract: ToolContract, text: string, ctx: ToolCtx): Promise<unknown> {
  let mod: { parseRequest?: (c: ToolContract, t: string, x: ToolCtx) => Promise<unknown> };
  try {
    const path = "../understanding/index.ts"; // a variable, so typecheck passes before T-28 exists
    mod = await import(path);
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_MODULE_NOT_FOUND") mod = {};
    else throw e;
  }
  if (!mod.parseRequest) throw new ToolError("UNDERSTANDING=server is not implemented yet (T-28).");
  return contract.input.parse(await mod.parseRequest(contract, text, ctx));
}

export function registerTools(server: McpServer, defs: ToolDef[]) {
  const serverMode = env.understanding() === "server";
  for (const def of defs) {
    const { name, description, input, output, card } = def.contract;
    const uri = card ? CARD_URIS[card] : undefined;
    const meta = uri ? { ui: { resourceUri: uri }, "ui/resourceUri": uri } : undefined;
    server.registerTool(
      name,
      { description, inputSchema: serverMode ? ServerModeInput : input, outputSchema: output, _meta: meta },
      async (args: Record<string, unknown>, extra: Extra): Promise<CallToolResult> => {
        const t0 = performance.now();
        let status = "ok";
        const ctx: ToolCtx = {
          extra,
          progress: async (progress, total, message) => {
            const token = extra._meta?.progressToken;
            if (token === undefined) return;
            await extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress, total, message } });
          },
          log: (data, level = "info") => extra.sendNotification({ method: "notifications/message", params: { level, logger: name, data } }),
          elicit: (params) => server.server.elicitInput({ mode: "form", ...params }, { relatedRequestId: extra.requestId }),
        };
        try {
          const parsedArgs = serverMode ? await understand(def.contract, String(args.text), ctx) : args;
          const reply = await def.handler(parsedArgs as never, ctx);
          const out = output.safeParse(reply.data);
          if (!out.success) {
            status = "bad_output";
            console.error(`tool=${name} output does not match its contract: ${out.error.message}`);
            return errorResult(`${name} could not build a valid result.`);
          }
          return {
            content: [{ type: "text", text: reply.text }],
            structuredContent: out.data as Record<string, unknown>,
            ...(meta && { _meta: meta }),
          };
        } catch (e) {
          status = "error";
          if (!(e instanceof ToolError)) console.error(`tool=${name}`, e);
          return errorResult(e instanceof Error ? e.message : String(e));
        } finally {
          console.log(`tool=${name} ms=${Math.round(performance.now() - t0)} status=${status}`);
        }
      },
    );
  }
}
