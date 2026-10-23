import { useEffect, useRef, useState } from "react";
import type { MealPrepCard } from "@dayform/contracts";
import { Bar, CardRoot, MACROS, ToolButton, cap, delay, fmt, fmtDate, type CardProps } from "../ui.tsx";

const ADVANCE_MS = 5000;

export function MealPrep({ data, callTool }: CardProps<MealPrepCard>) {
  const plan = data.status === "ready" ? data.plan : null;
  const slides = plan ? plan.days.length + 1 : 0; // days, then the batch-cook steps
  const [i, setI] = useState(0);
  const [tick, setTick] = useState(0); // restarts the auto-advance timer after a swipe
  const down = useRef<number | null>(null);

  useEffect(() => setI(0), [plan?.plan_id]);
  useEffect(() => {
    if (slides < 2) return;
    const id = setTimeout(() => setI((n) => (n + 1) % slides), ADVANCE_MS);
    return () => clearTimeout(id);
  }, [i, tick, slides]);

  if (!plan) {
    const failed = data.status === "failed";
    return (
      <CardRoot name="meal-prep" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: 22 }}>
        {!failed && (
          <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden className="df-fade" style={{ animation: "df-spin 1.2s linear infinite" }}>
            <circle cx="48" cy="48" r="40" fill="none" stroke="var(--surface-2)" strokeWidth="10" />
            <circle cx="48" cy="48" r="40" fill="none" stroke="var(--cyan)" strokeWidth="10" strokeLinecap="round" strokeDasharray="70 252" />
          </svg>
        )}
        <span className="df-eyebrow df-in">Meal prep</span>
        <span className="df-title df-in" style={delay(100)}>{failed ? "Couldn't build a plan" : "Preparing your plan…"}</span>
        {data.message && <span className="df-md df-muted df-in" style={{ maxWidth: 620, ...delay(200) }}>{data.message}</span>}
      </CardRoot>
    );
  }

  const recipes = new Map(plan.recipes.map((r) => [r.id, r]));
  const go = (n: number) => { setI((n + slides) % slides); setTick((t) => t + 1); };
  const onUp = (x: number) => {
    if (down.current === null) return;
    const dx = x - down.current;
    down.current = null;
    if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
  };

  return (
    <CardRoot name="meal-prep">
      <div className="df-spread df-in">
        <div className="df-col" style={{ gap: 4 }}>
          <span className="df-eyebrow">Meal prep · {plan.days.length} days</span>
          <span className="df-title">
            {i < plan.days.length ? `Day ${i + 1} · ${fmtDate(plan.days[i].date)}` : `Batch cook · ${plan.batch_cook.total_minutes} min`}
          </span>
        </div>
        <span className="df-chip df-chip-accent">Target {fmt(plan.targets.kcal)} kcal · {fmt(plan.targets.protein_g)} g protein</span>
      </div>

      <div data-clip className="df-grow df-in" style={{ position: "relative", overflow: "hidden", touchAction: "pan-y", ...delay(100) }}
        onPointerDown={(e) => (down.current = e.clientX)} onPointerUp={(e) => onUp(e.clientX)} onPointerLeave={(e) => onUp(e.clientX)}>
        <div data-track style={{ display: "flex", height: "100%", transform: `translateX(-${i * 100}%)`, transition: "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {plan.days.map((day, di) => (
            <section key={day.date} data-clip aria-hidden={di !== i} className="df-row" style={{ flex: "0 0 100%", gap: 22, alignItems: "stretch" }}>
              <ul className="df-col df-grow" style={{ gap: 6 }}>
                {day.meals.map((m) => {
                  const r = recipes.get(m.recipe_id);
                  return (
                    <li key={m.meal} className="df-panel" style={{ padding: "5px 16px", borderRadius: 14 }}>
                      <div className="df-muted" style={{ fontSize: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1.2 }}>{m.meal}</div>
                      <div className="df-strong df-ellipsis" style={{ fontSize: 22, lineHeight: 1.2 }}>{r?.name ?? m.recipe_id}</div>
                    </li>
                  );
                })}
              </ul>
              <div className="df-col" style={{ width: 236, flex: "none", gap: 9, justifyContent: "center" }}>
                {MACROS.map((mc) => {
                  const v = day.totals[mc.key], t = plan.targets[mc.key];
                  return (
                    <div key={mc.key} className="df-col" style={{ gap: 4 }}>
                      <div className="df-spread" style={{ alignItems: "baseline" }}>
                        <span className="df-strong" style={{ color: mc.color }}>{mc.label}</span>
                        <span><strong>{fmt(v)}</strong><span className="df-muted"> / {fmt(t)}</span></span>
                      </div>
                      <Bar frac={v / (t * 1.2)} marker={1 / 1.2} color={mc.color} height={10} delayMs={250} />
                    </div>
                  );
                })}
                {day.within_tolerance && <span className="df-chip df-chip-good" style={{ alignSelf: "flex-start", padding: "3px 12px" }}>✓ Within 5% of targets</span>}
              </div>
            </section>
          ))}
          <section data-clip aria-hidden={i !== plan.days.length} className="df-col" style={{ flex: "0 0 100%", gap: 10 }}>
            <ol className="df-col" style={{ gap: 10 }}>
              {plan.batch_cook.steps.slice(0, 5).map((step, si) => (
                <li key={si} className="df-row" style={{ gap: 14, alignItems: "flex-start" }}>
                  <span className="df-chip df-chip-accent" style={{ width: 40, justifyContent: "center", padding: "4px 0", flex: "none" }}>{si + 1}</span>
                  <span className="df-md" style={{ paddingTop: 4 }}>{step}</span>
                </li>
              ))}
            </ol>
            <span className="df-muted">{plan.recipes.length} recipes · {plan.recipes.reduce((n, r) => n + r.servings, 0)} portions · {plan.grocery.length} grocery items</span>
          </section>
        </div>
      </div>

      <div className="df-spread df-in" style={{ alignItems: "center", ...delay(300) }}>
        <div className="df-row" style={{ gap: 10 }}>
          {Array.from({ length: slides }, (_, n) => (
            <button key={n} aria-label={`Slide ${n + 1}`} onClick={() => go(n)} style={{
              appearance: "none", border: 0, padding: 0, cursor: "pointer", height: 12, borderRadius: 6,
              width: n === i ? 36 : 12, background: n === i ? "var(--cyan)" : "var(--surface-2)", transition: "width 300ms, background 300ms",
            }} />
          ))}
          <span className="df-muted" style={{ marginLeft: 8 }}>{cap(i < plan.days.length ? "swipe for more" : "then shop")}</span>
        </div>
        <ToolButton callTool={callTool} name="add_to_cart" args={{ from_plan: true }} label="Add all to cart" doneLabel="✓ In your cart" />
      </div>
    </CardRoot>
  );
}
