// Two ways to run a scene turn, behind one interface:
//  - mcp: calls the scene's expected tools directly on MCP_URL (mock or real server). Available now.
//  - simulator: types the line into the T-30 backend WebSocket and watches the events. Stub until T-30.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MCP_URL } from "./env.ts";

export type ExpectedCall = { tool: string; args: Record<string, unknown> };
export type ObservedCall = { tool: string; ms: number; result: any; error?: string };

export interface Driver {
  name: string;
  /** One user line. `expected` is used by the mcp driver; the simulator driver lets Alexa choose. */
  turn(line: string, expected: ExpectedCall[]): Promise<ObservedCall[]>;
  listTools(): Promise<{ tools: { name: string }[]; protocol: string | undefined }>;
  /** Elicitation messages seen so far (auto-accepted). */
  elicitations: string[];
  close(): Promise<void>;
}

export async function mcpDriver(url = MCP_URL): Promise<Driver & { client: Client }> {
  const client = new Client({ name: "dayform-demo", version: "0.1.0" }, { capabilities: { elicitation: { form: {} } } });
  const elicitations: string[] = [];
  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    elicitations.push(String(req.params.message));
    return { action: "accept", content: { confirm: true } };
  });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  await client.listTools(); // lets the SDK validate structuredContent against each outputSchema
  return {
    name: `mcp ${url}`,
    client,
    elicitations,
    async turn(_line, expected) {
      const out: ObservedCall[] = [];
      for (const c of expected) {
        const t0 = performance.now();
        try {
          const r = await client.callTool({ name: c.tool, arguments: c.args });
          const ms = Math.round(performance.now() - t0);
          out.push({ tool: c.tool, ms, result: r.structuredContent, error: r.isError ? JSON.stringify(r.content) : undefined });
        } catch (e) {
          out.push({ tool: c.tool, ms: Math.round(performance.now() - t0), result: undefined, error: String(e) });
          break;
        }
      }
      return out;
    },
    async listTools() {
      return { tools: (await client.listTools()).tools, protocol: transport.protocolVersion };
    },
    close: () => client.close(),
  };
}

export async function simulatorDriver(): Promise<Driver> {
  // TODO(T-30): the backend lands with T-30. Plan: send TextInputEvent, pair ToolCallStarted/Finished by call_id,
  // take each result from the CardEvent.data with that call_id, answer ElicitationRequestEvent with accept,
  // end the turn on StateEvent "idle". Events: packages/contracts/src/events.ts.
  throw new Error("simulator driver: waits for T-30 (simulator backend). Use --driver mcp.");
}
