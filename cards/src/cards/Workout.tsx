import { useEffect, useState } from "react";
import type { WorkoutCard } from "@dayform/contracts";
import { CardRoot, Confetti, Ring, cap, dayLabel, delay, fmtKg, signed, type CardProps } from "../ui.tsx";

/** Seconds left in the rest. Counts from when this result arrived: rest_ends_at is on the demo clock, not the browser clock. */
function useRest(restEndsAt: string | null, restSeconds: number) {
  const [left, setLeft] = useState(restEndsAt ? restSeconds : 0);
  useEffect(() => {
    if (!restEndsAt || restSeconds <= 0) return setLeft(0);
    const t0 = performance.now();
    setLeft(restSeconds);
    const id = setInterval(() => {
      const l = Math.max(restSeconds - (performance.now() - t0) / 1000, 0);
      setLeft(l);
      if (l === 0) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [restEndsAt, restSeconds]);
  return left;
}

export function Workout({ data }: CardProps<WorkoutCard>) {
  const d = data;
  const left = useRest(d.rest_ends_at, d.rest_seconds);
  const resting = left > 0;

  return (
    <CardRoot name="workout">
      {d.pr && <Confetti top="20%" startDelay={150} />}
      <div className="df-spread df-in">
        <div className="df-col" style={{ gap: 4 }}>
          <span className="df-eyebrow">{dayLabel(d.day_name)} · exercise {d.exercise_index} of {d.exercise_count}</span>
          <span className="df-title df-ellipsis" style={{ fontSize: 42, maxWidth: 520 }}>{cap(d.exercise)}</span>
        </div>
        {d.pr && (
          <div className="df-chip df-pop" style={{ background: "rgba(255, 209, 102, 0.16)", color: "var(--gold)", fontSize: 22, ...delay(250) }}>
            ★ New PR · {fmtKg(d.pr.e1rm_kg)} kg{d.pr.change_kg !== null ? ` (${signed(d.pr.change_kg)})` : ""}
          </div>
        )}
      </div>

      <div className="df-row df-grow" style={{ gap: 28, alignItems: "center" }}>
        <div className="df-col df-grow" style={{ gap: 18 }}>
          <div className="df-row df-in" style={{ gap: 14, ...delay(80) }}>
            <span className="df-md df-strong">Set {d.set_number} of {d.set_count}</span>
            <span className="df-row" style={{ gap: 8 }}>
              {Array.from({ length: d.set_count }, (_, i) => (
                <span key={i} style={{
                  width: 34, height: 10, borderRadius: 5,
                  background: i < d.set_number - 1 ? "var(--good)" : i === d.set_number - 1 ? "var(--cyan)" : "var(--surface-2)",
                }} />
              ))}
            </span>
          </div>
          <div className="df-row df-pop" style={{ gap: 18, alignItems: "baseline", ...delay(140) }}>
            <span className="df-huge">{fmtKg(d.target.weight_kg)}<span style={{ fontSize: 40, fontWeight: 700 }}> kg</span></span>
            <span style={{ fontSize: 56, fontWeight: 300, color: "var(--muted)" }}>×</span>
            <span className="df-huge" style={{ color: "var(--cyan)" }}>{d.target.reps}</span>
          </div>
          <div className="df-row df-in" style={{ gap: 10, flexWrap: "wrap", minHeight: 38, ...delay(260) }}>
            {d.done_sets.length === 0 ? (
              <span className="df-muted">Target for this set</span>
            ) : (
              d.done_sets.slice(-4).map((s) => (
                <span key={s.set} className="df-chip df-chip-good">✓ Set {s.set} · {fmtKg(s.weight_kg)} × {s.reps}</span>
              ))
            )}
          </div>
        </div>

        <div className="df-col df-in" style={{ alignItems: "center", gap: 10, ...delay(200) }}>
          <Ring size={190} stroke={14} frac={resting ? left / d.rest_seconds : 1} color={resting ? "var(--cyan)" : "var(--good)"} delayMs={200}>
            {resting ? (
              <>
                <span style={{ fontSize: 64, fontWeight: 800, lineHeight: 1 }}>{Math.ceil(left)}</span>
                <span className="df-muted">sec rest</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, color: "var(--good)" }}>Go</span>
                <span className="df-muted">{d.rest_seconds} s rest after</span>
              </>
            )}
          </Ring>
        </div>
      </div>
    </CardRoot>
  );
}
