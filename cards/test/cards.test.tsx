// Every card renders its mock fixture (validated against the contract) without throwing, showing the key facts.
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CARDS, CARD_URIS, type CardName } from "@dayform/contracts";
import { CARD_COMPONENTS, CardByUri } from "../src/index.ts";

const fx = (tool: string) => JSON.parse(readFileSync(new URL(`../../mock/fixtures/${tool}.json`, import.meta.url), "utf8"));
const CASES: [CardName, string, string[]][] = [
  ["rings", "get_daily_summary", ["Calories", "Protein", "Carbs", "Fat", "Water", "+ water"]],
  ["meal-logged", "log_meal", ["Chicken karahi", "Assumed", "1 plate (250 g) of chicken karahi"]],
  ["workout", "start_workout", ["Bench press", "Set 1 of 3", "80"]],
  ["workout", "log_set", ["New PR", "101.3", "Set 2 of 3"]],
  ["pr", "finish_workout", ["NEW PR", "Bench press", "+3.2 kg vs 98.2"]],
  ["progress", "get_progress", ["+12.7 kg e1RM", "Bench press"]],
  ["meal-prep", "plan_meal_prep", ["Berry chia overnight oats", "Add all to cart", "Start rice and roast chicken"]],
  ["cart", "view_cart", ["14 items · 18 packs", "Checkout"]],
  ["cart", "checkout_cart", ["Open Amazon cart", "QR code"]],
  ["brief", "get_morning_brief", ["Good morning", "Back squat", "102.5 kg × 5", "−150 kcal"]],
];
const callTool = async () => ({});

describe("cards render their fixtures", () => {
  for (const [card, tool, texts] of CASES) {
    it(`${card} <- ${tool}`, () => {
      const data = CARDS[card].parse(fx(tool));
      const html = renderToStaticMarkup(
        (() => { const C = CARD_COMPONENTS[card]; return <C data={data} callTool={callTool} openLink={() => {}} />; })(),
      );
      for (const t of texts) expect(html.replaceAll("&amp;", "&")).toContain(t);
    });
  }
});

it("buttons hide when the host cannot call tools", () => {
  const html = renderToStaticMarkup(<CARD_COMPONENTS.rings data={CARDS.rings.parse(fx("get_daily_summary"))} />);
  expect(html).not.toContain("+ water");
});

it("pr: both PR kinds for one set make one celebration; empty prs is a calm state", () => {
  const bench = fx("finish_workout").prs[0];
  const both = renderToStaticMarkup(<CARD_COMPONENTS.pr data={{ prs: [bench, { ...bench, kind: "rep_best" }] }} />);
  expect(both.match(/NEW PR/g)).toHaveLength(1);
  expect(both).toContain("Also your best for 8 reps");
  expect(renderToStaticMarkup(<CARD_COMPONENTS.pr data={{ prs: [] }} />)).toContain("No PR this time");
});

it("CardByUri maps every ui://cards/<name>", () => {
  for (const n of Object.keys(CARD_URIS) as CardName[]) expect(CardByUri[CARD_URIS[n]]).toBe(CARD_COMPONENTS[n]);
});

it.skipIf(!existsSync(new URL("../dist/rings.html", import.meta.url)))("built cards are single files with no external requests", () => {
  for (const n of Object.keys(CARD_URIS)) {
    const html = readFileSync(new URL(`../dist/${n}.html`, import.meta.url), "utf8");
    expect(html).not.toMatch(/(src|href)=["']?https?:/);
    expect(html).toContain('<div id="root">');
  }
});
