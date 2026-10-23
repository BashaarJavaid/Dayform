// Text helpers: normalization, pg_trgm-compatible similarity, phrase parsing, compound splitting.

const STOP = new Set(["a", "an", "the", "some", "of", "my", "i", "had", "ate", "just", "please"]);

function singular(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("oes")) return w.slice(0, -2);
  if (w.endsWith("es") && /(ch|sh|ss|x)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !/(ss|us)$/.test(w)) return w.slice(0, -1);
  return w;
}

/** Lowercase, drop punctuation and filler words, singularize. Used on both stored terms and queries. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .map(singular)
    .join(" ");
}

/** Trigram set exactly as pg_trgm builds it: each alphanumeric word padded "  w ". */
export function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!w) continue;
    const p = `  ${w} `;
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

/** pg_trgm similarity(): shared / (union). */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

const NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, half: 0.5, quarter: 0.25, couple: 2, single: 1,
};
export const UNITS = [
  "g", "gm", "gram", "kg", "kilo", "ml", "l", "liter", "litre", "oz", "ounce", "lb", "pound",
  "cup", "bowl", "katori", "plate", "glass", "mug", "piece", "slice", "tablespoon", "tbsp", "teaspoon", "tsp",
  "can", "bottle", "serving", "portion", "scoop", "handful", "small", "medium", "large", "skewer",
];
const UNIT_SET = new Set(UNITS);

export type Parsed = { food: string; quantity?: number; unit?: string };

/**
 * "half a plate of chicken biryani" -> {quantity: 0.5, unit: "plate", food: "chicken biryani"}
 * "two rotis" -> {quantity: 2, food: "rotis"}; "200g chicken" -> {quantity: 200, unit: "g", food: "chicken"}
 */
export function parsePhrase(text: string): Parsed {
  let w = text.toLowerCase().replace(/(\d)([a-z])/g, "$1 $2").replace(/[^a-z0-9.\/ ]+/g, " ").split(/\s+/).filter(Boolean);
  let quantity: number | undefined;
  let unit: string | undefined;
  const num = (t: string | undefined) => {
    if (t === undefined) return undefined;
    if (/^\d+(\.\d+)?$/.test(t)) return +t;
    const f = t.match(/^(\d+)\/(\d+)$/);
    if (f) return +f[1] / +f[2];
    return NUM[t];
  };
  // "one and a half", "two and a half"
  if (num(w[0]) !== undefined && w[1] === "and" && (w[2] === "a" || w[2] === "an") && w[3] === "half") {
    quantity = num(w[0])! + 0.5;
    w = w.slice(4);
  } else if ((w[0] === "a" || w[0] === "an") && (w[1] === "half" || w[1] === "quarter" || w[1] === "couple")) {
    quantity = NUM[w[1]];
    w = w.slice(2);
  } else if (num(w[0]) !== undefined && w.length > 1) {
    quantity = num(w[0]);
    w = w.slice(1);
  }
  if ((quantity === 0.5 || quantity === 0.25) && (w[0] === "a" || w[0] === "an")) w = w.slice(1); // "half a plate"
  if (w[0] === "of") w = w.slice(1); // "a couple of"
  if (w.length > 1 && UNIT_SET.has(singularUnit(w[0]))) {
    unit = singularUnit(w[0]);
    w = w.slice(1);
    if (w[0] === "of") w = w.slice(1);
    quantity ??= 1;
  }
  return { food: w.join(" "), quantity, unit };
}

export function singularUnit(u: string): string {
  const s = u.toLowerCase().trim();
  if (s === "grams" || s === "gms" || s === "gm") return s === "gm" ? "gm" : s === "gms" ? "gm" : "gram";
  if (s.endsWith("es") && /(glass|dish)es$/.test(s)) return s.slice(0, -2);
  if (s.endsWith("s") && s.length > 3 && !s.endsWith("ss")) return s.slice(0, -1);
  return s;
}

const SEP = /(\s*(?:,|&|\+|\band then\b|\balong with\b|\band\b|\bwith\b|\bplus\b)\s*)/;

/**
 * Splits "two rotis, chicken karahi and a mango lassi" into three items and "nihari with naan" into two,
 * unless the joined words are themselves a known food name ("lentil curry with rice").
 */
export function splitItems(text: string, isFood: (s: string) => boolean = () => false): string[] {
  const tok = text.trim().split(SEP); // [part, sep, part, sep, part]
  const n = (tok.length + 1) / 2;
  const span = (i: number, j: number) => tok.slice(2 * i, 2 * j + 1).join("").trim();
  const out: string[] = [];
  for (let i = 0; i < n; ) {
    let j = n - 1;
    while (j > i && !isFood(span(i, j))) j--;
    const s = span(i, j);
    if (s) out.push(s);
    i = j + 1;
  }
  return out;
}
