import type { BriefCard } from "@dayform/contracts";
import { CardRoot, MACROS, cap, dayLabel, delay, fmt, fmtDate, fmtKg, signed, type CardProps } from "../ui.tsx";

export function Brief({ data }: CardProps<BriefCard>) {
  const { yesterday: y, today, weight, targets_change: tc } = data;
  const facts = [
    { k: "Calories", v: `${fmt(y.eaten.kcal)} / ${fmt(y.targets.kcal)}`, color: "var(--kcal)" },
    { k: "Protein", v: `${fmt(y.eaten.protein_g)} / ${fmt(y.targets.protein_g)} g`, color: "var(--protein)" },
    // Weight is always in the header chip, so the third fact is the training day.
    y.workout ? { k: "Trained", v: dayLabel(y.workout), color: "var(--good)" } : { k: "Rest", v: "day", color: "var(--good)" },
  ];

  return (
    <CardRoot name="brief" style={{ gap: 14 }}>
      <div className="df-spread df-in">
        <div className="df-col" style={{ gap: 2 }}>
          <span className="df-eyebrow">{fmtDate(data.date, { weekday: "long", day: "numeric", month: "long" })}</span>
          <span className="df-title" style={{ fontSize: 40 }}>Good morning</span>
        </div>
        <span className="df-chip" style={{ fontSize: 20 }}>
          Weight {signed(weight.change_kg_week)} kg/wk <span className="df-muted">· plan {signed(weight.planned_kg_week)}</span>
        </span>
      </div>

      <div className="df-row" style={{ gap: 14, alignItems: "stretch" }}>
        <div className="df-panel df-col df-in" style={{ width: 286, flex: "none", gap: 6, ...delay(100) }}>
          <span className="df-muted df-strong">Yesterday</span>
          {facts.map((f) => (
            <div key={f.k} className="df-row" style={{ gap: 10 }}>
              <span className="df-dot" style={{ background: f.color }} />
              <span><span className="df-muted">{f.k}</span> <strong>{f.v}</strong></span>
            </div>
          ))}
        </div>
        <div className="df-panel df-col df-grow df-in" style={{ gap: 6, ...delay(180) }}>
          <span className="df-muted df-strong">Today</span>
          {/* Day and lead lift on their own lines so long names wrap instead of truncating. */}
          <span className="df-md df-strong">{today.workout ? dayLabel(today.workout.day_name) : "Rest day"}</span>
          {today.workout && (
            <span className="df-strong" style={{ fontSize: 22 }}>
              {cap(today.workout.lead.exercise)} <span style={{ color: "var(--cyan)", whiteSpace: "nowrap" }}>{fmtKg(today.workout.lead.weight_kg)} kg × {today.workout.lead.reps}</span>
            </span>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "6px 18px", justifyContent: "start" }}>
            {MACROS.map((m) => (
              <span key={m.key} className="df-row" style={{ gap: 6 }}>
                <span className="df-dot" style={{ background: m.color }} />
                <strong>{fmt(today.targets[m.key])}</strong><span className="df-muted">{m.key === "kcal" ? "kcal" : `g ${m.label.toLowerCase()}`}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="df-panel df-row df-in" style={{ gap: 14, borderColor: "rgba(25, 211, 255, 0.35)", ...delay(260) }}>
        <span className="df-eyebrow" style={{ flex: "none", alignSelf: "flex-start", paddingTop: 1 }}>Insight</span>
        <span>{data.insight}</span>
      </div>

      {tc && (
        <div className="df-row df-in" style={{ gap: 14, alignItems: "flex-start", ...delay(340) }}>
          <span className="df-chip df-chip-accent" style={{ fontSize: 24, flex: "none" }}>
            {signed(tc.kcal_delta, 0)} kcal → {fmt(tc.previous_kcal + tc.kcal_delta)}
          </span>
          <span style={{ paddingTop: 4 }}>{tc.reason}</span>
        </div>
      )}
    </CardRoot>
  );
}
