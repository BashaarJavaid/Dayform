// Scenes S1–S7 from DEMO-SCRIPT.md §1: the line, the tools we expect, and the fields that must hold.
// Each line is also its typed safe line (DEMO-MONITOR.md §4).
import type { ExpectedCall, ObservedCall } from "./drivers.ts";

export type Ctx = Record<string, any>; // values carried between scenes (one MCP session per run)
export type Check = (calls: Record<string, any>, ctx: Ctx) => string[]; // returns failures
export type Turn = { line: string; calls: ExpectedCall[]; check: Check; offScript?: boolean };
export type Scene = {
  id: string;
  budgetSec: number;
  needs?: string; // scene to run first when this one runs alone
  before?: "advance-day";
  turns?: Turn[];
  toolsList?: true;
};

/** CHECKOUT_CONFIRM=tool (fallback, D9): Alexa confirms with confirm_checkout instead of elicitation. */
export const TOOL_CONFIRM = process.env.CHECKOUT_CONFIRM === "tool";

const fail = (ok: unknown, msg: string) => (ok ? [] : [msg]);
const call = (tool: string, args: Record<string, unknown> = {}): ExpectedCall => ({ tool, args });

export const SCENES: Scene[] = [
  {
    id: "S1",
    budgetSec: 20,
    turns: [
      {
        line: "Alexa, I had two rotis, chicken karahi and a mango lassi for lunch.",
        calls: [
          call("log_meal", {
            meal: "lunch",
            items: [{ food: "roti", quantity: 2 }, { food: "chicken karahi" }, { food: "mango lassi", quantity: 1 }],
          }),
        ],
        check: ({ log_meal: r }, ctx) => {
          ctx.lunchKcal = r?.entry?.totals?.kcal;
          ctx.dayKcal = r?.day?.eaten?.kcal;
          return [
            ...fail(r?.entry?.items?.length === 3, `3 items, got ${r?.entry?.items?.length}`),
            ...fail(r?.assumptions?.length >= 1 && r.entry.items.some((i: any) => i.assumed), "an assumed portion"),
            ...fail(r?.entry?.totals?.kcal > 0 && r?.day?.remaining?.protein_g >= 0, "meal totals and protein left"),
          ];
        },
      },
    ],
  },
  {
    id: "S2",
    budgetSec: 12,
    needs: "S1",
    turns: [
      {
        line: "Actually, make that one roti.",
        calls: [call("correct_meal", { changes: [{ food: "roti", action: "set_quantity", quantity: 1 }] })],
        check: ({ correct_meal: r }, ctx) => [
          ...fail(r?.entry?.totals?.kcal < ctx.lunchKcal, `meal kcal drops (${ctx.lunchKcal} → ${r?.entry?.totals?.kcal})`),
          ...fail(r?.day?.eaten?.kcal < ctx.dayKcal, `day kcal drops (${ctx.dayKcal} → ${r?.day?.eaten?.kcal})`),
          ...fail(r?.entry?.items?.find((i: any) => i.food === "roti")?.quantity === 1, "roti quantity is 1"),
        ],
      },
    ],
  },
  {
    id: "S3",
    budgetSec: 38,
    turns: [
      {
        line: "Alexa, start push day.",
        calls: [call("start_workout", { day: "push" })],
        check: ({ start_workout: r }) => [
          ...fail(/push/i.test(r?.day_name ?? ""), `day is Push, got ${r?.day_name}`),
          ...fail(r?.exercise && r?.target?.weight_kg > 0, "first exercise with a target"),
        ],
      },
      {
        line: "Done, eight reps.",
        calls: [call("log_set", { reps: 8 })],
        check: ({ log_set: r }) => [
          ...fail(r?.is_pr === true && r?.pr, "PR flagged"),
          ...fail(r?.logged?.reps === 8, "8 reps logged"),
          ...fail(r?.rest_ends_at, "rest timer running"),
        ],
      },
      {
        line: "My shoulder feels off. Swap the overhead press.",
        calls: [call("swap_exercise", { exercise: "overhead press", reason: "shoulder feels off" })],
        check: ({ swap_exercise: r }) => [
          ...fail(r?.replaced === "overhead press", `replaced overhead press, got ${r?.replaced}`),
          ...fail(r?.exercise && r.exercise !== "overhead press" && r?.target?.reps > 0, "new exercise with a target"),
        ],
      },
      {
        line: "I'm done, finish my workout.",
        offScript: true,
        calls: [call("finish_workout")],
        check: ({ finish_workout: r }) => fail(r?.prs?.length >= 1, "PR listed in the summary"),
      },
    ],
  },
  {
    id: "S4",
    budgetSec: 50,
    turns: [
      {
        line: "Plan my meal prep for the next four days and add what I need to my cart.",
        calls: [
          call("get_daily_summary"),
          call("plan_meal_prep", { days: 4 }),
          call("add_to_cart", { from_plan: true }),
          call("checkout_cart"),
          ...(TOOL_CONFIRM ? [call("confirm_checkout", { confirm: true })] : []),
        ],
        check: (c, ctx) => {
          const plan = c.plan_meal_prep?.plan;
          const co = TOOL_CONFIRM ? c.confirm_checkout : c.checkout_cart;
          ctx.cart = co && { items: co.item_count, usd: co.estimated_total_usd };
          return [
            ...fail(c.get_daily_summary?.targets?.kcal > 0, "daily summary with targets"),
            ...fail(c.plan_meal_prep?.status === "ready", `plan ready, got ${c.plan_meal_prep?.status}`),
            ...fail(plan?.days?.length === 4, `4 plan days, got ${plan?.days?.length}`),
            ...fail(plan?.days?.every((d: any) => d.within_tolerance), "every day within ±5%"),
            ...fail(c.add_to_cart?.items?.length > 0, "cart has items"),
            ...fail(co?.checkout?.status === "confirmed", `checkout confirmed, got ${co?.checkout?.status}`),
            ...fail(/^https:\/\/www\.amazon\.com\//.test(co?.add_to_cart_url ?? ""), "Add-to-Cart link"),
          ];
        },
      },
    ],
  },
  {
    id: "S5",
    budgetSec: 25,
    before: "advance-day",
    turns: [
      {
        line: "Alexa, good morning.",
        calls: [call("get_morning_brief")],
        check: ({ get_morning_brief: r }) => [
          ...fail(r?.targets_change && r.targets_change.kcal_delta !== 0, "targets_change present"),
          ...fail(r?.today?.workout?.lead?.weight_kg > 0, "today's lead lift"),
        ],
      },
    ],
  },
  {
    id: "S6",
    budgetSec: 10,
    turns: [
      {
        line: "How's my bench going?",
        calls: [call("get_progress", { metric: "e1rm", exercise: "bench press" })],
        check: ({ get_progress: r }) => {
          const s = r?.series ?? [];
          return [
            ...fail(s.length >= 6, `at least 6 points, got ${s.length}`),
            ...fail(s.length && s.at(-1).value > s[0].value, "series rises"),
          ];
        },
      },
    ],
  },
  { id: "S7", budgetSec: 24, toolsList: true },
];

export const byTool = (calls: ObservedCall[]) => Object.fromEntries(calls.map((c) => [c.tool, c.result]));
