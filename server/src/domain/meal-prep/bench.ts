// npm run mealprep:bench -w @dayform/server -- --runs 10 [--constraints "no chicken"]
// Generates plans on the seed targets and preferences (local DB after db:reset) and appends the table to bench-log.md.
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../../.env.local", import.meta.url)));
} catch {}
const { generatePlan } = await import("./plan.ts");
const { seedInputs } = await import("./store.ts");

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const runs = Number(arg("runs") ?? 10);
const constraints = arg("constraints");
const { today, targets, preferences } = await seedInputs();

const rows: string[] = [];
let ok = 0;
for (let run = 1; run <= runs; run++) {
  try {
    const g = await generatePlan({ startDate: today, days: 4, targets, preferences, constraints });
    if (g.within_tolerance) ok++;
    const d = g.plan.days[0].totals;
    rows.push(`| ${run} | ${g.rounds} | ${g.within_tolerance ? "yes" : "no"} | ${g.seconds} | ${g.plan.recipes.length} | ${d.kcal} / ${d.protein_g} / ${d.carbs_g} / ${d.fat_g} | $${g.grocery.total_usd} (${g.grocery.lines.length} items, ${g.grocery.packs} packs) | ${g.misses.map((m) => `d${m.day} ${m.nutrient} ${m.value}/${m.target}`).join("; ")} |`);
  } catch (e) {
    rows.push(`| ${run} | - | error | - | - | - | - | ${(e as Error).message.slice(0, 120)} |`);
  }
  console.log(rows.at(-1));
}
const head = [
  `\n## ${new Date().toISOString()} · ${process.env.REASONING_MODEL_ID} · ${runs} runs${constraints ? ` · constraints "${constraints}"` : ""}`,
  `Targets ${targets.kcal} kcal, P ${targets.protein_g} g, C ${targets.carbs_g} g, F ${targets.fat_g} g. **${ok}/${runs} within tolerance.**\n`,
  `| Run | Rounds | Within tolerance | Seconds | Recipes | Day 1 kcal / P / C / F | Grocery | Misses |`,
  `|---|---|---|---|---|---|---|---|`,
];
const out = [...head, ...rows].join("\n") + "\n";
appendFileSync(new URL("./bench-log.md", import.meta.url), out);
console.log(out);
process.exit(0);
