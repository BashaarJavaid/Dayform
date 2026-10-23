// MCP Apps entry: the ext-apps App receives the tool result from the host and renders the card component.
import type { ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@modelcontextprotocol/ext-apps";
import type { CallTool, CardProps } from "../ui.tsx";

const W = 768, H = 480;

export async function mountMcpCard<T>(name: string, Card: ComponentType<CardProps<T>>) {
  const el = document.getElementById("root")!;
  // Fill whatever frame the host gives (768x480, 1152x720, ...) by zooming; text stays vector-sharp.
  const fit = () => { el.style.zoom = String(Math.min(innerWidth / W, innerHeight / H) || 1); };
  fit();
  addEventListener("resize", fit);

  const root = createRoot(el);
  const app = new App({ name: `dayform-${name}`, version: "1.0.0" }, {});
  const callTool: CallTool = (tool, args) => app.callServerTool({ name: tool, arguments: args }) as ReturnType<CallTool>;
  const openLink = (url: string) => void app.openLink({ url });

  app.ontoolresult = (params) => {
    if (params.isError || !params.structuredContent) return;
    const caps = app.getHostCapabilities();
    root.render(
      <Card data={params.structuredContent as T} callTool={caps?.serverTools ? callTool : undefined} openLink={caps?.openLinks ? openLink : undefined} />,
    );
  };
  await app.connect();
}
