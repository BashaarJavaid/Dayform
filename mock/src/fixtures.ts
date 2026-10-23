// Loads mock/fixtures/<tool>.json and validates each against its output contract. Fails fast.
import { readFileSync } from "node:fs";
import { TOOLS, confirm_checkout, type ToolContract } from "@dayform/contracts";

const dir = new URL("../fixtures/", import.meta.url);

export function loadFixtures(tools: readonly ToolContract[] = [...TOOLS, confirm_checkout]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const t of tools) {
    const r = t.output.safeParse(JSON.parse(readFileSync(new URL(`${t.name}.json`, dir), "utf8")));
    if (r.success) out[t.name] = r.data;
    else errors.push(`${t.name}.json: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  if (errors.length) throw new Error(`Fixtures do not match the contracts:\n${errors.join("\n")}`);
  return out;
}
