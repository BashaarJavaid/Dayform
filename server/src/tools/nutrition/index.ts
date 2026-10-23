// T-22 nutrition tools: log_meal, correct_meal, log_water, get_daily_summary. Facts in `content`, never a script.
import { correct_meal, get_daily_summary, log_meal, log_water } from "@dayform/contracts";
import { defineTool, ToolError, type ToolCtx } from "../../core/registry.ts";
import { clock } from "../../core/clock.ts";
import {
  applyChanges, assumptionsOf, dayNumbers, entryCard, lastEntryId, localDate, mealFor, mealsOn, once, readEntry, resolveItems, saveEntry, addWater,
  type EstimateInfo,
} from "../../domain/nutrition/index.ts";

type Day = Awaited<ReturnType<typeof dayNumbers>>;
const dayFacts = (d: Day) =>
  `Today: ${d.eaten.kcal} of ${d.targets.kcal} kcal, ${d.eaten.protein_g} of ${d.targets.protein_g} g protein. Left: ${d.remaining.kcal} kcal, ${d.remaining.protein_g} g protein.`;

async function logEstimates(ctx: ToolCtx, estimates: EstimateInfo[]) {
  for (const e of estimates) await ctx.log(`estimated "${e.said}" with ${e.model} in ${e.ms} ms`).catch(() => {});
}

export const tools = [
  defineTool(log_meal, async ({ items, meal }, ctx) => {
    const at = await clock.now();
    const key = JSON.stringify([meal ?? null, items.map((i) => [i.food.trim().toLowerCase(), i.quantity ?? null, i.unit?.trim().toLowerCase() ?? null])]);
    return once(key, at, async () => {
      const r = await resolveItems(items);
      await logEstimates(ctx, r.estimates);
      const mealType = meal ?? mealFor(at);
      const entry = await readEntry(await saveEntry(at, mealType, r.items));
      const day = await dayNumbers(localDate(at));
      const card = entryCard(entry);
      const assumptions = assumptionsOf(r.items);
      return {
        data: { entry: card, day, assumptions },
        text: [`Logged ${mealType}: ${card.items.length} items, ${card.totals.kcal} kcal, ${card.totals.protein_g} g protein.`, dayFacts(day), ...assumptions].join(" "),
      };
    });
  }),

  defineTool(correct_meal, async ({ entry_id, changes }, ctx) => {
    const id = entry_id ? Number(entry_id) : await lastEntryId();
    if (!Number.isInteger(id)) throw new ToolError("That meal was not found.");
    const { applied, estimates } = await applyChanges(id, changes);
    await logEstimates(ctx, estimates);
    const entry = await readEntry(id);
    const day = await dayNumbers(entry.date);
    const card = entryCard(entry);
    return {
      data: { entry: card, day, changes_applied: applied },
      text: [...applied, `${entry.meal[0].toUpperCase()}${entry.meal.slice(1)} now ${card.totals.kcal} kcal, ${card.totals.protein_g} g protein.`, dayFacts(day)].join(" "),
    };
  }),

  defineTool(log_water, async ({ ml, glasses }) => {
    if (ml === undefined && glasses === undefined) throw new ToolError("Say how much water, in ml or glasses.");
    const added_ml = Math.round(ml ?? glasses! * 250);
    const at = await clock.now();
    await addWater(at, added_ml);
    const date = localDate(at);
    const { eaten, targets } = await dayNumbers(date);
    return {
      data: { date, eaten, targets, added_ml },
      text: `Added ${added_ml} ml water. Water today: ${eaten.water_ml} of ${targets.water_ml} ml.`,
    };
  }),

  defineTool(get_daily_summary, async ({ date }) => {
    const d = date ?? localDate(await clock.now());
    const [day, meals] = await Promise.all([dayNumbers(d), mealsOn(d)]);
    const { eaten, targets } = day;
    return {
      data: { date: d, eaten, targets, meals },
      text: [
        `${d}: ${meals.length} meals.`,
        `Eaten ${eaten.kcal} of ${targets.kcal} kcal, protein ${eaten.protein_g} of ${targets.protein_g} g, carbs ${eaten.carbs_g} of ${targets.carbs_g} g, fat ${eaten.fat_g} of ${targets.fat_g} g,`,
        `fiber ${eaten.fiber_g} of ${targets.fiber_g} g, sodium ${eaten.sodium_mg} of ${targets.sodium_mg} mg, water ${eaten.water_ml} of ${targets.water_ml} ml.`,
        `Left: ${day.remaining.kcal} kcal, ${day.remaining.protein_g} g protein.`,
      ].join(" "),
    };
  }),
];
