// T-21: set_goals and log_bodyweight. The maths lives in server/src/domain/targets/.
import { log_bodyweight, set_goals } from "@dayform/contracts";
import { defineTool } from "../../core/registry.ts";
import { logBodyweight, setGoals } from "../../domain/targets/index.ts";

const signed = (x: number) => `${x > 0 ? "+" : ""}${x}`;

export const tools = [
  defineTool(set_goals, async (args) => {
    const r = await setGoals(args);
    const t = r.targets;
    return {
      data: {
        date: r.date, eaten: r.eaten, targets: t, goal: r.goal, rate_kg_per_week: r.rate_kg_per_week,
        effective_date: r.date, previous_targets: r.previous_targets, reason: r.reason,
      },
      text: `Goal ${r.goal}${r.rate_kg_per_week ? ` ${r.rate_kg_per_week} kg a week` : ""}. New daily targets: ${t.kcal} kcal, protein ${t.protein_g} g, carbs ${t.carbs_g} g, fat ${t.fat_g} g, water ${t.water_ml} ml.` +
        (r.previous_targets ? ` Calories were ${r.previous_targets.kcal}.` : "") + ` Eaten today: ${r.eaten.kcal} kcal.`,
    };
  }),
  defineTool(log_bodyweight, async ({ kg }) => {
    const r = await logBodyweight(kg);
    return { data: r, text: `Logged ${r.kg} kg. Trend weight ${r.trend_kg} kg, ${signed(r.weekly_change_kg)} kg over the last 7 days.` };
  }),
];
