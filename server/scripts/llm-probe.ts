// One real structured call through the LLM client: npm run llm:probe -w server [-- --stream]
import { fileURLToPath } from "node:url";
import { z } from "zod";
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url)));
} catch {}
const { structured } = await import("../src/core/llm.ts");

const Meal = z.object({
  items: z.array(z.object({ food: z.string().min(1), quantity: z.number().optional(), unit: z.string().optional() })).min(1),
  meal: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
});
const r = await structured({
  name: "record_meal",
  description: "Record the foods the user says they ate.",
  schema: Meal,
  prompt: "I had two rotis, chicken karahi and a mango lassi for lunch",
  stream: process.argv.includes("--stream"),
  timeoutMs: 20_000,
});
console.log(JSON.stringify(r));
