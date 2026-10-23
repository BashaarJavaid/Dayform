// T-01 smoke: the Nova reasoning model (D21) on Bedrock via Converse / ConverseStream.
// Run: npx tsx smoke/bedrock-claude/run.ts   (reads ../../.env.local)
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand,
  type ToolConfiguration, type ToolChoice, type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(here, "../../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const PRIMARY = process.env.REASONING_MODEL_ID!;
const FALLBACK = process.env.REASONING_MODEL_FALLBACK_ID!;
const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });

type Row = { test: string; model: string; result: "PASS" | "FAIL"; p50?: number; max?: number; notes: string };
const rows: Row[] = [];
const p50 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
const short = (id: string) => id.replace(/^us\.amazon\./, "");
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 200);
const user = (text: string): Message[] => [{ role: "user", content: [{ text }] }];

// ---- schemas
const RecordMeal = z.object({
  items: z.array(z.object({ food: z.string().min(1), quantity: z.number().optional(), unit: z.string().optional() })).min(1),
});
const recordMealTool: ToolConfiguration["tools"] = [{
  toolSpec: {
    name: "record_meal",
    description: "Record the foods the user says they ate.",
    inputSchema: { json: {
      type: "object",
      properties: { items: { type: "array", items: { type: "object", properties: {
        food: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" } }, required: ["food"] } } },
      required: ["items"],
    } },
  },
}];
const MEAL_TEXT = "I had two rotis and a bowl of daal";
const checkMeal = (input: unknown) => {
  const v = RecordMeal.parse(input);
  const foods = v.items.map((i) => i.food.toLowerCase()).join(",");
  if (!/rot/.test(foods) || !/da(a)?l/.test(foods)) throw new Error(`unexpected foods: ${foods}`);
  return v;
};

const Ingredient = z.object({ item: z.string(), grams: z.number().positive() });
const Meal = z.object({
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]), name: z.string(),
  ingredients: z.array(Ingredient).min(2),
  kcal: z.number(), protein_g: z.number(), carbs_g: z.number(), fat_g: z.number(), prep_note: z.string(),
});
const MealPlan = z.object({
  days: z.array(z.object({ day: z.number().int().min(1).max(4), meals: z.array(Meal).length(4) })).length(4),
  shopping_summary: z.string(),
});
const mealPlanJsonSchema = {
  type: "object",
  properties: {
    days: { type: "array", items: { type: "object", properties: {
      day: { type: "integer" },
      meals: { type: "array", items: { type: "object", properties: {
        slot: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
        name: { type: "string" },
        ingredients: { type: "array", items: { type: "object", properties: {
          item: { type: "string" }, grams: { type: "number" } }, required: ["item", "grams"] } },
        kcal: { type: "number" }, protein_g: { type: "number" }, carbs_g: { type: "number" }, fat_g: { type: "number" },
        prep_note: { type: "string" },
      }, required: ["slot", "name", "ingredients", "kcal", "protein_g", "carbs_g", "fat_g", "prep_note"] } },
    }, required: ["day", "meals"] } },
    shopping_summary: { type: "string" },
  },
  required: ["days", "shopping_summary"],
};
const PLAN_PROMPT =
  "Write a 4-day meal-prep plan for a 75 kg man targeting 2400 kcal, 160 g protein, 260 g carbs, 80 g fat per day. " +
  "Pakistani home cooking (roti, daal, chicken karahi, rice, yogurt, eggs, oats, fruit). Each day has exactly 4 meals: " +
  "breakfast, lunch, dinner, snack. Each meal lists 3-6 ingredients with grams, its macros, and a prep_note of 2-3 sentences. " +
  "End with a shopping_summary paragraph. Call the save_meal_plan tool with the plan.";

// ---- tests
async function testA(model: string) {
  const ms: number[] = []; const notes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    const r = await client.send(new ConverseCommand({ modelId: model, messages: user("In one sentence, why does protein matter after a workout?"), inferenceConfig: { maxTokens: 120 } }));
    ms.push(Math.round(performance.now() - t));
    const text = r.output?.message?.content?.find((b) => b.text)?.text ?? "";
    if (!text.trim()) throw new Error(`run ${i + 1}: empty text`);
    if (i === 0) notes.push(`"${text.trim().slice(0, 70)}..."`);
  }
  return { p50: p50(ms), max: Math.max(...ms), notes: `5/5 runs ${ms.join("/")} ms; ${notes[0]}` };
}

async function testB(model: string) {
  const ms: number[] = []; let ok = 0; let sample = "";
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    const r = await client.send(new ConverseCommand({ modelId: model, messages: user(MEAL_TEXT),
      toolConfig: { tools: recordMealTool, toolChoice: { auto: {} } }, inferenceConfig: { temperature: 0, maxTokens: 400 } }));
    ms.push(Math.round(performance.now() - t));
    const tu = r.output?.message?.content?.find((b) => b.toolUse)?.toolUse;
    if (!tu) throw new Error(`run ${i + 1}: no toolUse (stopReason=${r.stopReason})`);
    const v = checkMeal(tu.input); ok++;
    if (i === 0) sample = JSON.stringify(v.items);
  }
  return { p50: p50(ms), max: Math.max(...ms), notes: `toolChoice auto; ${ok}/5 zod-valid; ${ms.join("/")} ms; ${sample}` };
}

async function testCMode(model: string, label: string, toolChoice: ToolChoice) {
  const t = performance.now();
  const r = await client.send(new ConverseCommand({ modelId: model, messages: user(MEAL_TEXT),
    toolConfig: { tools: recordMealTool, toolChoice }, inferenceConfig: { temperature: 0, maxTokens: 400 } }));
  const ms = Math.round(performance.now() - t);
  const tu = r.output?.message?.content?.find((b) => b.toolUse)?.toolUse;
  if (!tu) throw new Error(`${label}: no toolUse (stopReason=${r.stopReason})`);
  checkMeal(tu.input);
  return { ms, notes: `${label} accepted, zod-valid, stopReason=${r.stopReason}` };
}

async function testCNoTools(model: string) {
  // Structured output without tools: schema in the prompt, parse the text.
  const t = performance.now();
  const r = await client.send(new ConverseCommand({ modelId: model,
    system: [{ text: 'Reply with only a JSON object matching this JSON schema, no prose, no code fences: {"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"food":{"type":"string"},"quantity":{"type":"number"},"unit":{"type":"string"}},"required":["food"]}}},"required":["items"]}' }],
    messages: user(MEAL_TEXT), inferenceConfig: { temperature: 0, maxTokens: 400 } }));
  const ms = Math.round(performance.now() - t);
  const text = r.output?.message?.content?.find((b) => b.text)?.text ?? "";
  const fenced = /```/.test(text);
  const json = text.replace(/^[\s\S]*?```(?:json)?\s*|```[\s\S]*$/g, "").trim() || text.trim();
  checkMeal(JSON.parse(fenced ? json : text.trim()));
  return { ms, notes: `prompt-only JSON parsed + zod-valid${fenced ? " (had code fences, stripped)" : " (bare JSON)"}` };
}

async function testD(model: string) {
  const maxTokens = 10000;
  const t = performance.now(); let ttft = 0; let buf = ""; let stop = ""; let outTok = 0;
  const r = await client.send(new ConverseStreamCommand({ modelId: model, messages: user(PLAN_PROMPT),
    toolConfig: { tools: [{ toolSpec: { name: "save_meal_plan", description: "Save a 4-day meal-prep plan.", inputSchema: { json: mealPlanJsonSchema } } }],
      toolChoice: { tool: { name: "save_meal_plan" } } },
    inferenceConfig: { temperature: 0.3, maxTokens } }));
  for await (const ev of r.stream!) {
    const d = ev.contentBlockDelta?.delta;
    if (d && (d.toolUse?.input || d.text)) { if (!ttft) ttft = Math.round(performance.now() - t); buf += d.toolUse?.input ?? ""; }
    if (ev.messageStop) stop = ev.messageStop.stopReason ?? "";
    if (ev.metadata?.usage) outTok = ev.metadata.usage.outputTokens ?? 0;
  }
  const total = Math.round(performance.now() - t);
  const plan = MealPlan.parse(JSON.parse(buf));
  const meals = plan.days.flatMap((d) => d.meals).length;
  return { ttft, total, notes: `forced tool, streamed; ${outTok} output tokens, maxTokens=${maxTokens}, stopReason=${stop}; ${meals} meals zod-valid` };
}

// ---- runner
async function run(model: string, only?: Set<string>) {
  const want = (t: string) => !only || only.has(t);
  const failed = new Set<string>();
  const rec = async (test: string, f: () => Promise<Omit<Row, "test" | "model" | "result">>) => {
    if (!want(test)) return;
    try { rows.push({ test, model: short(model), result: "PASS", ...(await f()) }); }
    catch (e) { failed.add(test); rows.push({ test, model: short(model), result: "FAIL", notes: errText(e) }); }
  };
  await rec("A text x5", () => testA(model));
  await rec("B tool use x5", () => testB(model));
  await rec("C toolChoice tool", async () => { const x = await testCMode(model, "{tool:{name}}", { tool: { name: "record_meal" } }); return { p50: x.ms, max: x.ms, notes: x.notes }; });
  await rec("C toolChoice any", async () => { const x = await testCMode(model, "{any:{}}", { any: {} }); return { p50: x.ms, max: x.ms, notes: x.notes }; });
  await rec("C toolChoice auto", async () => { const x = await testCMode(model, "{auto:{}}", { auto: {} }); return { p50: x.ms, max: x.ms, notes: x.notes }; });
  await rec("C JSON, no tools", async () => { const x = await testCNoTools(model); return { p50: x.ms, max: x.ms, notes: x.notes }; });
  await rec("D stream plan", async () => { const x = await testD(model); return { p50: x.ttft, max: x.total, notes: `p50 col = TTFT, max col = total; ${x.notes}` }; });
  return failed;
}

const failed = await run(PRIMARY);
if (failed.size && FALLBACK) await run(FALLBACK, failed);

console.log("\n| test | model | result | p50 ms | max ms | notes |\n|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.test} | ${r.model} | ${r.result} | ${r.p50 ?? "-"} | ${r.max ?? "-"} | ${r.notes.replace(/\|/g, "/")} |`);
const primaryFails = rows.filter((r) => r.model === short(PRIMARY) && r.result === "FAIL").map((r) => r.test);
const unrecovered = primaryFails.filter((t) => !rows.some((r) => r.test === t && r.model !== short(PRIMARY) && r.result === "PASS"));
console.log(`\n${unrecovered.length ? "FAIL" : "PASS"} primary=${short(PRIMARY)} fallback=${short(FALLBACK)}${primaryFails.length ? ` primary-failed=[${primaryFails.join(", ")}]` : ""}`);
process.exit(unrecovered.length ? 1 : 0);
