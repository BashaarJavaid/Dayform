import { fileURLToPath } from "node:url";
// Local runs read the repo's .env.local (git-ignored); the container gets its env from compose or AgentCore.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url)));
} catch {}

const { createApp } = await import("./app.ts");
const { loadTools } = await import("./core/registry.ts");
const { env } = await import("./core/env.ts");

const tools = await loadTools();
const port = Number(process.env.PORT ?? 8000);
createApp(tools).listen(port, "0.0.0.0", () =>
  console.log(
    `Dayform MCP server: http://localhost:${port}/mcp tools=${tools.map((t) => t.contract.name).join(",")} ` +
      `understanding=${env.understanding()} demo_mode=${env.demoMode()} db=${env.dbDriver()}`,
  ),
);
