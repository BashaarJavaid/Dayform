// Card resources (DESIGN §5): ui://cards/<name> served from cards/dist/<name>.html (T-32), placeholder until then.
import { readFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CARD_MIME_TYPE, CARD_NAMES, CARD_URIS } from "@dayform/contracts";

const DIST = new URL("../../../cards/dist/", import.meta.url);

// Same placeholder as the mock (T-10): does the MCP Apps handshake and prints the tool result.
const placeholder = (name: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:768px;height:480px;overflow:auto;font:13px/1.4 system-ui;background:#111;color:#eee}
h1{font-size:16px;margin:12px}pre{margin:12px;white-space:pre-wrap}</style></head>
<body><h1>${name} (placeholder card)</h1><pre id="d">waiting for data…</pre><script>
const send=(m)=>parent.postMessage(Object.assign({jsonrpc:"2.0"},m),"*");
addEventListener("message",(e)=>{const m=e.data||{};
 if(m.id===1&&m.result)send({method:"ui/notifications/initialized",params:{}});
 if(m.method==="ui/notifications/tool-result")document.getElementById("d").textContent=JSON.stringify(m.params.structuredContent??m.params,null,2);});
send({id:1,method:"ui/initialize",params:{appInfo:{name:"${name}-placeholder",version:"0.0.0"},appCapabilities:{},protocolVersion:"2026-01-26"}});
</script></body></html>`;

export function registerCards(server: McpServer) {
  for (const name of CARD_NAMES) {
    server.registerResource(`${name} card`, CARD_URIS[name], { mimeType: CARD_MIME_TYPE, description: `The ${name} card (768×480).` }, async (uri) => {
      const text = await readFile(new URL(`${name}.html`, DIST), "utf8").catch(() => placeholder(name));
      return { contents: [{ uri: uri.href, mimeType: CARD_MIME_TYPE, text }] };
    });
  }
}
