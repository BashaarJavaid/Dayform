// Simulator frontend (T-31): the Echo Show screen. CARDS_MODE and SIM_PORT come from the shell or .env.local.
import { defineConfig, searchForWorkspaceRoot } from "vite";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url)));
} catch {}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  esbuild: { jsx: "automatic" },
  define: {
    __CARDS_MODE__: JSON.stringify(process.env.CARDS_MODE ?? "mcp-apps"),
    __SIM_PORT__: JSON.stringify(process.env.SIM_PORT ?? "8300"),
  },
  server: { port: 5173, strictPort: true, fs: { allow: [searchForWorkspaceRoot(process.cwd())] } },
  build: { outDir: "dist", emptyOutDir: true },
});
