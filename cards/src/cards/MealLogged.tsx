import type { MealLoggedCard } from "@dayform/contracts";
import { CardRoot, Count, MACROS, cap, delay, fmt, fmtTime, type CardProps } from "../ui.tsx";

const MAX_ROWS = 3;

export function MealLogged({ data }: CardProps<MealLoggedCard>) {
  const { entry, day } = data;
  const rows = entry.items.slice(0, MAX_ROWS);
  const more = entry.items.length - rows.length;

  return (
    <CardRoot name="meal-logged">
      <div className="df-spread df-in">
        <div className="df-col" style={{ gap: 4 }}>
          <span className="df-eyebrow">{cap(entry.meal)} logged · {fmtTime(entry.logged_at)}</span>
          <span className="df-title"><Count value={entry.totals.kcal} /> kcal <span className="df-muted" style={{ fontWeight: 600 }}>· {entry.items.length} item{entry.items.length === 1 ? "" : "s"}</span></span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="df-muted">Left today</div>
          <div className="df-md" style={{ whiteSpace: "nowrap" }}>
            <strong style={{ color: "var(--cyan)", fontSize: 30 }}><Count value={day.remaining.kcal} /></strong> kcal ·{" "}
            <strong style={{ color: "var(--protein)", fontSize: 30 }}><Count value={day.remaining.protein_g} /></strong> g protein
          </div>
        </div>
      </div>

      <ul className="df-col df-grow" style={{ gap: 10 }}>
        {rows.map((it, i) => (
          <li key={`${it.food}-${i}`} className="df-panel df-row df-in" style={{ padding: "10px 18px", gap: 16, ...delay(100 + i * 80) }}>
            <div className="df-col df-grow" style={{ gap: 2 }}>
              <div className="df-row" style={{ gap: 10 }}>
                <span className="df-md df-strong df-ellipsis">{cap(it.food)}</span>
                {it.assumed && <span className="df-badge df-badge-assumed">Assumed</span>}
                {it.estimated && <span className="df-badge df-badge-estimated">Estimated</span>}
              </div>
              <span className="df-muted df-ellipsis">
                {it.assumed && it.assumption ? it.assumption : `${fmt(it.quantity)} ${it.unit}`} · {fmt(it.grams)} g
              </span>
            </div>
            <div style={{ textAlign: "right", flex: "none" }}>
              <div className="df-md df-strong">{fmt(it.macros.kcal)} kcal</div>
              <div style={{ color: "var(--protein)" }}>{fmt(it.macros.protein_g)} g protein</div>
            </div>
          </li>
        ))}
        {more > 0 && <li className="df-muted df-in" style={delay(420)}>+ {more} more item{more === 1 ? "" : "s"}</li>}
      </ul>

      <div className="df-row df-in" style={{ gap: 10, ...delay(380) }}>
        <span className="df-muted" style={{ marginRight: 4 }}>This meal</span>
        {MACROS.slice(1).map((m) => (
          <span key={m.key} className="df-chip"><span className="df-dot" style={{ background: m.color }} />{fmt(entry.totals[m.key])} g {m.label.toLowerCase()}</span>
        ))}
      </div>
    </CardRoot>
  );
}
