import { createMockApp } from "./app.ts";
import { loadFixtures } from "./fixtures.ts";

const env = process.env;
const realTools = (env.REAL_TOOLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const app = createMockApp({
  fixtures: loadFixtures(),
  checkoutConfirm: env.CHECKOUT_CONFIRM === "tool" ? "tool" : "elicitation",
  passthroughUrl: env.MOCK_PASSTHROUGH_URL || undefined,
  realTools,
});
const port = Number(env.PORT ?? 8100);
app.listen(port, "0.0.0.0", () => {
  console.log(`Dayform mock MCP server: http://localhost:${port}/mcp`);
  if (realTools.length) console.log(`Hybrid: ${realTools.join(", ")} -> ${env.MOCK_PASSTHROUGH_URL}`);
});
