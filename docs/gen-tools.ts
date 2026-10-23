// Prints the README tool table from the contracts. Run: npx tsx docs/gen-tools.ts
import { z } from "zod";
import { TOOLS, confirm_checkout } from "../packages/contracts/src/tools/index.ts";

const rows = [...TOOLS, confirm_checkout].map((t) => {
  const js = z.toJSONSchema(t.input, { io: "input" }) as { properties?: object; required?: string[] };
  const req = new Set(js.required ?? []);
  const inputs = Object.keys(js.properties ?? {}).map((k) => (req.has(k) ? k : `${k}?`)).join(", ") || "none";
  const when = t.description.split(/(?<!e\.g)\.\s/)[0].replace(/^Call (only )?(when |to )?/, "").replace(/\.$/, "");
  const name = t.name === "confirm_checkout" ? "`confirm_checkout` (only with `CHECKOUT_CONFIRM=tool`)" : `\`${t.name}\``;
  return `| ${name} | ${when} | ${inputs} | ${"card" in t && t.card ? `\`${t.card}\`` : "none"} |`;
});
console.log(["| Tool | Called when | Inputs (alexa mode) | Card |", "|---|---|---|---|", ...rows].join("\n"));
