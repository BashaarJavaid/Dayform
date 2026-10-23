// plan_meal_prep (T-25). Fast path: a fresh ready plan in meal_plans (overnight job or an earlier run) comes back
// with no LLM call. New constraints (or no plan yet): a `preparing` row, generation in the background, and the
// next call returns the result (DESIGN §7: the one tool allowed to start slow work).
import { plan_meal_prep, type MealPrepCard } from "@dayform/contracts";
import { defineTool } from "../../core/registry.ts";
import { clock } from "../../core/clock.ts";
import { addDays, localDate } from "../../domain/targets/index.ts";
import { ETA_S, STALE_S, coversDays, failRow, normConstraints, recentPlans, startPlan, type PlanRow } from "../../domain/meal-prep/store.ts";

const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function readyReply(r: PlanRow) {
  const p = r.plan!;
  const m = r.totals ?? { constraints: "" };
  const t = p.targets;
  const misses = p.days.filter((d) => !d.within_tolerance).length;
  const text =
    `${p.days.length}-day meal-prep plan from ${short(p.start_date)}${m.constraints ? ` (${m.constraints})` : ""}: ` +
    `${p.recipes.map((x) => x.name).join(", ")}. ` +
    (m.avg ? `Average ${m.avg.kcal} kcal and ${m.avg.protein_g} g protein a day, against targets of ${t.kcal} kcal and ${t.protein_g} g. ` : "") +
    (misses ? `${misses} of ${p.days.length} days miss the 5% tolerance. ` : "Every day is within 5% of target. ") +
    `One batch-cook session of about ${p.batch_cook.total_minutes} minutes. ` +
    `Groceries: ${p.grocery.length} items` + (m.grocery_total_usd ? `, about $${Math.round(m.grocery_total_usd)}.` : ".");
  const data: MealPrepCard = { status: "ready", message: null, plan: p };
  return { data, text };
}

const preparing = (message: string) => ({ data: { status: "preparing", message, plan: null } satisfies MealPrepCard, text: message });

export const tools = [
  defineTool(plan_meal_prep, async ({ days: asked, constraints }, ctx) => {
    const days = asked ?? 4;
    const c = normConstraints(constraints);
    const today = localDate(await clock.now());
    const start = addDays(today, 1);
    const rows = await recentPlans([today, start]);

    const busy = rows.find((r) => r.status === "preparing");
    if (busy && busy.age_s < STALE_S) {
      const eta = Math.max(5, Math.round(ETA_S - busy.age_s));
      return preparing(`Still making the meal plan${busy.totals?.constraints ? ` (${busy.totals.constraints})` : ""}; about ${eta} seconds left. Ask again then.`);
    }
    if (busy) await failRow(busy.id, "timed out", busy.totals?.constraints ?? "");

    const ready = rows.filter((r) => r.status === "ready" && r.plan && coversDays(r, days));
    // No constraints: the newest ready plan (from the overnight job, or the last constrained request).
    // Constraints: the newest ready plan made with the same constraints.
    const hit = c ? ready.find((r) => (r.totals?.constraints ?? "") === c) : ready[0];
    if (hit) return readyReply(hit);

    await ctx.progress(0, 2, "Planning recipes…");
    await ctx.log(`plan_meal_prep: generating a ${days}-day plan from ${start}${c ? ` with "${c}"` : ""} in the background`);
    const send = (msg: string) => void ctx.log(msg).catch(() => {}); // the request may be closed by then
    await startPlan(start, days, c, send);
    return preparing(`Making a new ${days}-day meal plan${c ? ` with ${c}` : ""}. It takes about ${ETA_S} seconds; ask again then.`);
  }),
];
