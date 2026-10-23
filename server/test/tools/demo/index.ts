// Test-only tool folder (loaded via loadTools(<this dir>/..)): envelope, error, card and stream cases.
import { z } from "zod";
import { log_water } from "@dayform/contracts";
import { defineTool, ToolError } from "../../../src/core/registry.ts";

const spec = <O extends z.ZodObject = z.ZodObject<{ n: z.ZodNumber }>>(name: string, output?: O) => ({
  name,
  description: `Test tool ${name}.`,
  input: z.object({ n: z.number().optional() }),
  output: (output ?? z.object({ n: z.number() })) as O,
});

export const tools = [
  defineTool(spec("t_ok"), async ({ n }) => ({ data: { n: n ?? 1 }, text: `n is ${n ?? 1}.` })),
  defineTool(spec("t_bad_output"), async () => ({ data: { n: "not a number" } as never, text: "never seen" })),
  defineTool(spec("t_throws"), async () => {
    throw new ToolError("No meal logged today to correct.");
  }),
  defineTool(log_water, async ({ ml, glasses }) => {
    const added_ml = ml ?? (glasses ?? 1) * 250;
    const day = { kcal: 900, protein_g: 60, carbs_g: 100, fat_g: 30, fiber_g: 10, sodium_mg: 1200, water_ml: 1000 + added_ml };
    return {
      data: { date: "2026-10-23", eaten: day, targets: { ...day, kcal: 2200, water_ml: 3000 }, added_ml },
      text: `Added ${added_ml} ml.`,
    };
  }),
  defineTool(spec("t_stream", z.object({ action: z.string(), steps: z.number() })), async (_args, ctx) => {
    await ctx.log("step 1: thinking");
    await ctx.progress(1, 2, "half way");
    const r = await ctx.elicit({
      message: "Proceed?",
      requestedSchema: { type: "object", properties: { confirm: { type: "boolean" } }, required: ["confirm"] },
    });
    await ctx.progress(2, 2, "done");
    return { data: { action: r.action, steps: 2 }, text: `User chose ${r.action}.` };
  }),
];
