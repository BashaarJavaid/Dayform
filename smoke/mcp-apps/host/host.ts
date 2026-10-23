// Host page: MCP client over Streamable HTTP + ext-apps AppBridge + sandboxed iframe.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AppBridge, PostMessageTransport, getToolUiResourceUri } from "@modelcontextprotocol/ext-apps/app-bridge";

const log = (s: string) => { document.getElementById("log")!.textContent += s + "\n"; console.log(s); };

const client = new Client({ name: "dayform-smoke-host", version: "0.0.1" });
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", location.href)));
log(`connected, protocol ${(client as any)._transport?.protocolVersion ?? "?"}`);

const { tools } = await client.listTools();
const tool = tools.find((t) => t.name === "show_rings")!;
const uri = getToolUiResourceUri(tool)!;
log(`show_rings -> ${uri}`);

const t0 = performance.now();
const result = await client.callTool({ name: "show_rings", arguments: {} });
log(`tools/call show_rings ${Math.round(performance.now() - t0)} ms: ${JSON.stringify(result.structuredContent)}`);

const res = await client.readResource({ uri });
const html = (res.contents[0] as any).text as string;
log(`resources/read ${uri}: mimeType=${res.contents[0].mimeType}, ${html.length} chars`);

const iframe = document.getElementById("card") as HTMLIFrameElement;
const bridge = new AppBridge(null, { name: "dayform-smoke-host", version: "0.0.1" }, { serverTools: {} });
bridge.oncalltool = async (params) => {
  log(`card -> tools/call ${params.name} ${JSON.stringify(params.arguments)}`);
  return (await client.callTool(params)) as any;
};
bridge.oninitialized = async () => {
  log("card initialized; sending tool input + result");
  await bridge.sendToolInput({ arguments: {} });
  await bridge.sendToolResult(result as any);
};
iframe.addEventListener("load", () => {
  bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
}, { once: true });
iframe.srcdoc = html;
