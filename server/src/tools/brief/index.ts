// get_morning_brief (T-27). Reads the brief the overnight job stored for today (demo clock). No LLM call.
// `yesterday` is re-read from the database at call time, so the card shows what was really logged yesterday
// (in cached mode the stored brief was made on the bare seed, before the take's S1-S3).
import { sql } from "drizzle-orm";
import { BriefCard, get_morning_brief } from "@dayform/contracts";
import { defineTool, ToolError } from "../../core/registry.ts";
import { clock } from "../../core/clock.ts";
import { query } from "../../core/db.ts";
import { localDate } from "../../domain/targets/index.ts";
import { yesterdayFacts } from "./overnight.ts";

const signed = (x: number) => `${x > 0 ? "+" : ""}${x}`;

export async function morningBrief() {
  const today = localDate(await clock.now());
  const [[row], y] = await Promise.all([
    query<{ brief: unknown }>(sql`SELECT brief FROM briefs WHERE for_date = ${today}::date`),
    yesterdayFacts(today),
  ]);
  if (!row) throw new ToolError(`No morning brief for ${today} yet; the overnight job makes it.`);
  const stored = (typeof row.brief === "string" ? JSON.parse(row.brief) : row.brief) as BriefCard & { greeting?: string };
  const pick = ({ kcal, protein_g, carbs_g, fat_g }: BriefCard["yesterday"]["eaten"]) => ({ kcal, protein_g, carbs_g, fat_g });
  const card = BriefCard.parse({ ...stored, yesterday: { eaten: pick(y.eaten), targets: pick(y.targets), workout: y.workout } });
  return { card, greeting: stored.greeting ?? "Good morning.", prs: y.prs };
}

export const tools = [
  defineTool(get_morning_brief, async () => {
    const { card: b, greeting, prs } = await morningBrief();
    const w = b.today.workout;
    const tc = b.targets_change;
    const text = [
      greeting,
      `Yesterday: ${b.yesterday.eaten.kcal} of ${b.yesterday.targets.kcal} kcal, protein ${b.yesterday.eaten.protein_g} of ${b.yesterday.targets.protein_g} g; ${b.yesterday.workout ? `${b.yesterday.workout} day done` : "no workout"}` +
        (prs.length ? `, PRs: ${prs.map((p) => `${p.exercise} ${p.weight_kg} kg x ${p.reps}`).join(", ")}.` : "."),
      `Weight trend ${signed(b.weight.change_kg_week)} kg this week, plan ${signed(b.weight.planned_kg_week)} kg.`,
      `Insight: ${b.insight}`,
      w ? `Today: ${w.day_name} day, lead lift ${w.lead.exercise} ${w.lead.weight_kg} kg x ${w.lead.reps}.` : "Today: rest day.",
      `Targets today: ${b.today.targets.kcal} kcal, protein ${b.today.targets.protein_g} g, carbs ${b.today.targets.carbs_g} g, fat ${b.today.targets.fat_g} g.`,
      tc ? `Targets changed: ${signed(tc.kcal_delta)} kcal from ${tc.previous_kcal}. ${tc.reason}` : "Targets unchanged.",
    ].join(" ");
    return { data: b, text };
  }),
];
