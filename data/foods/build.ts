// Builds data/foods/foods.json from the USDA CSVs in raw/ (see download.sh) plus desi.json.
// Also fills nutrients and `source` into desi.json in place. Rules: data/foods/README.md.
// Usage: npx tsx data/foods/build.ts
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL(".", import.meta.url).pathname;
const SR = `${dir}raw/FoodData_Central_sr_legacy_food_csv_2018-04/FoodData_Central_sr_legacy_food_csv_2018-04/`;
const FN = `${dir}raw/FoodData_Central_survey_food_csv_2024-10-31/FoodData_Central_survey_food_csv_2024-10-31/`;

// USDA nutrient id -> our key (per 100 g).
const NUTRIENTS: Record<string, string> = {
  "1008": "kcal", "1003": "protein_g", "1005": "carbs_g", "1004": "fat_g", "1079": "fiber_g", "2000": "sugar_g",
  "1093": "sodium_mg", "1089": "iron_mg", "1087": "calcium_mg", "1092": "potassium_mg", "1114": "vitamin_d_mcg",
};
// FNDDS 2024-10-31 food_nutrient.csv puts the legacy nutrient_nbr (203) in nutrient_id, not nutrient.id (1003).
const NUTRIENTS_FNDDS: Record<string, string> = {
  "208": "kcal", "203": "protein_g", "205": "carbs_g", "204": "fat_g", "291": "fiber_g", "269": "sugar_g",
  "307": "sodium_mg", "303": "iron_mg", "301": "calcium_mg", "306": "potassium_mg", "328": "vitamin_d_mcg",
};
const KEYS = Object.values(NUTRIENTS);
type Nutrients = Record<string, number>;

function* csv(path: string): Generator<string[]> {
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const out: string[] = [];
    let cur = "", q = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (q) {
        if (c === '"' && line[j + 1] === '"') { cur += '"'; j++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else if (c !== "\r") cur += c;
    }
    out.push(cur);
    yield out;
  }
}

// ---- Load USDA ----
type Usda = { fdc_id: number; desc: string; cat: string; dataset: "sr" | "fndds"; code?: string; n: Nutrients; portions: [string, number][] };
const foods = new Map<number, Usda>();
for (const [id, , desc, cat] of csv(SR + "food.csv")) foods.set(+id, { fdc_id: +id, desc, cat, dataset: "sr", n: {}, portions: [] });
for (const [id, , desc, cat] of csv(FN + "food.csv")) foods.set(+id, { fdc_id: +id, desc, cat, dataset: "fndds", n: {}, portions: [] });
for (const [id, code] of csv(FN + "survey_fndds_food.csv")) { const f = foods.get(+id); if (f) f.code = code; }
for (const [file, map] of [[SR, NUTRIENTS], [FN, NUTRIENTS_FNDDS]] as const) for (const [, id, nid, amount] of csv(file + "food_nutrient.csv")) {
  const key = map[nid];
  const f = key && foods.get(+id);
  if (f) f.n[key] = +amount;
}
for (const f of foods.values()) for (const k of KEYS) f.n[k] ??= 0;

const WEIGHT_UNITS = /^(oz|lb|fl oz|g|gram|cubic inch|surface inch)\b/;
function portionKey(text: string): string {
  // Keep qualifiers ("slice, crust not eaten" stays distinct from "slice"); skip "yields" conversions (dry -> cooked).
  if (/yields|yield from/i.test(text)) return "";
  return text.replace(/\(.*?\)/g, "").replace(/["']/g, "").replace(/\s*,\s*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
function addPortion(f: Usda, key: string, grams: number) {
  if (!key || !(grams > 0) || WEIGHT_UNITS.test(key) || f.portions.some(([k]) => k === key)) return;
  f.portions.push([key, Math.round(grams * 10) / 10]);
}
// FNDDS: "1 cup", "1/2 cup", "Quantity not specified" (= the typical amount eaten, our default "serving").
for (const [, id, , , , desc, , grams] of csv(FN + "food_portion.csv")) {
  const f = foods.get(+id);
  if (!f) continue;
  if (desc === "Quantity not specified") { addPortion(f, "serving", +grams); continue; }
  const m = desc.match(/^(\d+(?:\.\d+)?)(?:\/(\d+))?\s+(.*)$/);
  if (!m) continue;
  const amount = m[2] ? +m[1] / +m[2] : +m[1];
  addPortion(f, portionKey(m[3]), +grams / amount);
}
// SR Legacy: amount + modifier ("cup, chopped"), measure_unit 9999 = see modifier.
for (const [, id, , amount, , , modifier, grams] of csv(SR + "food_portion.csv")) {
  const f = foods.get(+id);
  if (f && +amount > 0) addPortion(f, portionKey(modifier), +grams / +amount);
}

// ---- Desi table ----
type Desi = {
  id: string; name: string; aliases: string[]; portions: Record<string, number>; default_portion: string; priority: number;
  fndds?: { code: string; fdc_id: number; desc: string }; usda?: { fdc_id: number; desc: string };
  recipe?: { yield_g: number; items: { fdc_id: number; item: string; g: number }[] };
  source?: string; nutrients?: Nutrients;
};
const round = (n: Nutrients) => Object.fromEntries(KEYS.map((k) => [k, Math.round((n[k] ?? 0) * 100) / 100]));
const desi: Desi[] = JSON.parse(readFileSync(dir + "desi.json", "utf8"));
for (const d of desi) {
  if (d.fndds || d.usda) {
    const ref = (d.fndds ?? d.usda)!;
    const f = foods.get(ref.fdc_id);
    if (!f || f.desc !== ref.desc) throw new Error(`${d.id}: fdc ${ref.fdc_id} is "${f?.desc}", expected "${ref.desc}"`);
    d.nutrients = round(f.n);
    d.source = d.fndds ? `FNDDS ${d.fndds.code} (${ref.desc})` : `USDA SR Legacy ${ref.fdc_id} (${ref.desc})`;
  } else if (d.recipe) {
    const sum: Nutrients = {};
    for (const it of d.recipe.items) {
      const f = foods.get(it.fdc_id);
      if (!f) throw new Error(`${d.id}: ingredient ${it.fdc_id} missing`);
      for (const k of KEYS) sum[k] = (sum[k] ?? 0) + (f.n[k] * it.g) / 100;
    }
    d.nutrients = round(Object.fromEntries(KEYS.map((k) => [k, (sum[k] * 100) / d.recipe!.yield_g])));
    d.source = `recipe: ${d.recipe.items.map((i) => `${i.item} ${i.g} g`).join(", ")}; cooked yield ${d.recipe.yield_g} g`;
  } else throw new Error(`${d.id}: no source`);
  if (!(d.default_portion in d.portions)) throw new Error(`${d.id}: default portion missing`);
}
writeFileSync(dir + "desi.json", JSON.stringify(desi, null, 2) + "\n");

// ---- USDA selection (rules in README.md) ----
const EXCLUDE_CATS = new Set(["9002", "9004", "9006", "9007", "9008", "9010", "9012", "9202", "9204", "9402", "9404", "9602", "9999", "7702", "7704"]);
const SR_CATS = new Set(["1", "9", "11", "12", "16", "20"]); // dairy/egg, fruit, veg, nuts/seeds, legumes, grains (raw meats come in via usda-aliases.json)
const BAD = /\bNS as to\b|\bNFS\b.*\bNFS\b|reduced sodium|low sodium|infant|babyfood|baby food|USDA Commodity|Food Distribution|imported|New Zealand|Australian|frozen, unprepared|canned, drained solids|with salt\b|year round|by-products|separable fat|variety meats|commercial, (?!.*\bbread\b)|prepared from recipe|Alaska Native|Indian \(|Navajo|Apache|Hopi|Shoshone|Ojibwa|Northern Plains/i;
const parts = (s: string) => s.split(",").length;
const selected: Usda[] = [];
const FNDDS_PER_CAT = 10, SR_PER_CAT = 25;
const byCat = new Map<string, Usda[]>();
for (const f of foods.values()) {
  if (BAD.test(f.desc)) continue;
  if (f.dataset === "fndds" && (EXCLUDE_CATS.has(f.cat) || parts(f.desc) > 3)) continue;
  if (f.dataset === "sr" && (!SR_CATS.has(f.cat) || parts(f.desc) > 3 || !/\braw\b|cooked|boiled|roasted|^(Nuts|Seeds|Milk|Cheese|Yogurt|Oats|Bread)/i.test(f.desc))) continue;
  if (!f.n.kcal && f.cat !== "7302" && f.cat !== "7304" && f.cat !== "7102") continue;
  const k = f.dataset + f.cat;
  (byCat.get(k) ?? byCat.set(k, []).get(k)!).push(f);
}
// Within each category keep the most generic foods: fewest comma parts, then NFS/raw first, then shortest name.
const generic = (f: Usda) => parts(f.desc) * 100 - (/\bNFS\b|, raw$|, plain$|, regular$/.test(f.desc) ? 50 : 0) + f.desc.length;
for (const [k, list] of byCat) {
  list.sort((a, b) => generic(a) - generic(b));
  selected.push(...list.slice(0, k.startsWith("fndds") ? FNDDS_PER_CAT : SR_PER_CAT));
}
// Recipe ingredients and curated-alias foods are always included.
// usda-aliases.json is keyed by exact USDA description (FNDDS preferred over SR Legacy on a tie).
const byDesc = new Map<string, Usda>();
for (const f of foods.values()) if (!byDesc.has(f.desc) || f.dataset === "fndds") byDesc.set(f.desc, f);
const curated: Record<number, string[]> = {};
for (const [desc, aliases] of Object.entries(JSON.parse(readFileSync(dir + "usda-aliases.json", "utf8")) as Record<string, string[]>)) {
  const f = byDesc.get(desc);
  if (!f) throw new Error(`usda-aliases.json: no USDA food "${desc}"`);
  curated[f.fdc_id] = aliases;
}
// Foods the grocery catalog (T-13) references by usda-<fdc_id> are always included too.
let catalogIds: number[] = [];
try {
  const cat: { food_id: string }[] = JSON.parse(readFileSync(dir + "../catalog/catalog.json", "utf8"));
  catalogIds = cat.map((c) => c.food_id).filter((id) => id.startsWith("usda-")).map((id) => +id.slice(5));
} catch {}
const force = new Set<number>([...desi.flatMap((d) => d.recipe?.items.map((i) => i.fdc_id) ?? []), ...Object.keys(curated).map(Number), ...catalogIds]);
for (const id of force) {
  const f = foods.get(id);
  if (!f) throw new Error(`forced fdc ${id} missing`);
  if (!selected.includes(f)) selected.push(f);
}

// ---- Normalize into rows ----
type Food = { id: string; name: string; aliases: string[]; nutrients: Nutrients; portions: Record<string, number>; default_portion: string; source: string; priority: number };
const rows: Food[] = desi.map((d) => ({ id: d.id, name: d.name, aliases: d.aliases, nutrients: d.nutrients!, portions: d.portions, default_portion: d.default_portion, source: d.source!, priority: d.priority }));
const lower = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
// Head alias: the first comma part ("Apple" of "Apple, raw") goes to the most generic food of that group.
const heads = new Map<string, Usda>();
for (const f of selected) {
  const head = lower(f.desc.split(",")[0]);
  const cur = heads.get(head);
  if (!cur || (f.dataset === "fndds" && cur.dataset === "sr") || (f.dataset === cur.dataset && generic(f) < generic(cur))) heads.set(head, f);
}
// Heads too vague to stand alone as an exact alias.
const NO_HEAD = new Set(["water", "fish", "nuts", "seeds", "game meat", "beverages", "spices", "soup", "cereal", "candy", "bread", "cheese", "cookie", "crackers", "beans", "rice", "pasta", "sauce", "beef", "pork", "chicken", "turkey", "lamb", "milk", "nutritional drink or shake", "nutrition bar", "energy drink", "soft drink", "wine", "beer"]);
for (const f of selected) {
  const ps = f.portions.filter(([k]) => k.length <= 40);
  const portions: Record<string, number> = Object.fromEntries(ps);
  portions["100 g"] = 100;
  const def = ["serving", "medium", "piece", "slice", "large", "cup"].find((k) => k in portions) ?? "100 g";
  const head = lower(f.desc.split(",")[0]);
  const ps2 = f.desc.split(",").map((p) => p.trim().toLowerCase());
  const aliases = new Set<string>(curated[f.fdc_id] ?? []);
  if (heads.get(head) === f && !NO_HEAD.has(head)) aliases.add(head);
  if (ps2.length === 2 && /^\w+$/.test(ps2[1]) && ps2[1] !== "nfs") aliases.add(`${ps2[1]} ${ps2[0]}`); // "raw apple"
  rows.push({
    id: `usda-${f.fdc_id}`,
    name: f.desc,
    aliases: [...aliases],
    nutrients: round(f.n),
    portions,
    default_portion: def,
    source: f.dataset === "fndds" ? `FNDDS ${f.code} (fdc ${f.fdc_id})` : `USDA SR Legacy (fdc ${f.fdc_id})`,
    priority: curated[f.fdc_id] ? 8 : f.dataset === "fndds" ? 5 : 3,
  });
}
writeFileSync(dir + "foods.json", JSON.stringify(rows) + "\n");
const n = (p: (r: Food) => boolean) => rows.filter(p).length;
console.log(`foods.json: ${rows.length} foods (desi ${desi.length}, FNDDS ${n((r) => r.source.startsWith("FNDDS") && r.id.startsWith("usda"))}, SR ${n((r) => r.source.startsWith("USDA SR") && r.id.startsWith("usda"))})`);
