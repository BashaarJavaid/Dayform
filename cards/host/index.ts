// Host side for MCP Apps cards (T-31): a sandboxed 768x480 iframe + the ext-apps AppBridge.
// The bridge is the postMessage relay: card -> `tools/call` arrives in `onCallTool`, card -> `ui/open-link` in `onOpenLink`.
// Pattern proven in T-06 (smoke/mcp-apps/host): AppBridge(null, ...) with no MCP client; the caller forwards tool calls itself.
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";

export type HostToolResult = { content?: unknown[]; structuredContent?: Record<string, unknown>; isError?: boolean; _meta?: Record<string, unknown> };

export interface CardFrameOptions {
  /** Element the iframe is appended to. */
  container: HTMLElement;
  /** The card HTML from `resources/read ui://cards/<name>` (text/html;profile=mcp-app). */
  html: string;
  /** The tool call's result; `structuredContent` is the card data. */
  toolResult: HostToolResult;
  /** The tool call's arguments. */
  toolInput?: Record<string, unknown>;
  /** 1 = 768x480, 1.5 = 1152x720. The card zooms itself to the frame. */
  scale?: number;
  /** Card button -> MCP tools/call. Omit to tell the card that tool calls are unsupported (its buttons hide). */
  onCallTool?: (name: string, args: Record<string, unknown>) => Promise<HostToolResult>;
  /** Card -> open a URL (cart card). Omit and the cart card shows only its QR code. */
  onOpenLink?: (url: string) => void;
}

export interface CardFrame {
  iframe: HTMLIFrameElement;
  /** Resolves once the card has initialized and received the first result. */
  ready: Promise<void>;
  /** Send a newer result for the same card (e.g. correct_meal after log_meal): the card updates in place. */
  update(toolResult: HostToolResult, toolInput?: Record<string, unknown>): Promise<void>;
  destroy(): void;
}

export const CARD_WIDTH = 768;
export const CARD_HEIGHT = 480;

export function mountCardFrame(opts: CardFrameOptions): CardFrame {
  const scale = opts.scale ?? 1;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.title = "Card";
  Object.assign(iframe.style, {
    width: `${CARD_WIDTH * scale}px`, height: `${CARD_HEIGHT * scale}px`, border: "0", display: "block", background: "#090d15",
  });

  const bridge = new AppBridge(null, { name: "dayform-simulator", version: "1.0.0" }, {
    ...(opts.onCallTool && { serverTools: {} }),
    ...(opts.onOpenLink && { openLinks: {} }),
  });
  if (opts.onCallTool) {
    const call = opts.onCallTool;
    bridge.oncalltool = async (params) => (await call(params.name, params.arguments ?? {})) as never;
  }
  if (opts.onOpenLink) {
    const open = opts.onOpenLink;
    bridge.onopenlink = async ({ url }) => { open(url); return {}; };
  }

  const ready = new Promise<void>((resolve) => {
    bridge.oninitialized = async () => {
      await bridge.sendToolInput({ arguments: opts.toolInput ?? {} });
      await bridge.sendToolResult(opts.toolResult as never);
      resolve();
    };
  });
  iframe.addEventListener("load", () => {
    void bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
  }, { once: true });
  iframe.srcdoc = opts.html;
  opts.container.appendChild(iframe);

  return {
    iframe,
    ready,
    async update(toolResult, toolInput) {
      await ready;
      if (toolInput) await bridge.sendToolInput({ arguments: toolInput });
      await bridge.sendToolResult(toolResult as never);
    },
    destroy() {
      void bridge.close();
      iframe.remove();
    },
  };
}
