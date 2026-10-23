import { defineConfig, searchForWorkspaceRoot } from "vite";
import { fileURLToPath } from "node:url";

// Preview page: every card from the mock fixtures, MCP Apps (iframe + AppBridge) next to native.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  esbuild: { jsx: "automatic" },
  server: { port: Number(process.env.CARDS_PREVIEW_PORT ?? 5180), strictPort: true, fs: { allow: [searchForWorkspaceRoot(process.cwd())] } },
  logLevel: "info",
});
