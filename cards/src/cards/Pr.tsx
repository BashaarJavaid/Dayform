import type { PrCard } from "@dayform/contracts";
import { CardRoot, Confetti, Count, cap, delay, fmtKg, signed, type CardProps } from "../ui.tsx";

export function Pr({ data }: CardProps<PrCard>) {
  // One celebration per lift: the e1RM entry leads; a rep-best on the same lift becomes a secondary line (T-23 returns both kinds for one set).
  const pr = data.prs.find((p) => p.kind === "e1rm") ?? data.prs[0];
  const repBest = pr && data.prs.find((p) => p !== pr && p.kind === "rep_best" && p.exercise === pr.exercise);
  const others = data.prs.filter((p, i, all) => p.exercise !== pr?.exercise && all.findIndex((q) => q.exercise === p.exercise) === i);

  if (!pr) {
    return (
      <CardRoot name="pr" style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <span className="df-eyebrow df-in">Logged</span>
        <span className="df-title df-in" style={delay(100)}>No PR this time</span>
        <span className="df-md df-muted df-in" style={delay(200)}>Saved to your training log.</span>
      </CardRoot>
    );
  }

  const isE1rm = pr.kind === "e1rm";
  const main = isE1rm ? pr.e1rm_kg : pr.weight_kg;

  return (
    <CardRoot name="pr" style={{ alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14 }}>
      <div data-deco aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(50% 55% at 50% 45%, rgba(255, 209, 102, 0.16), transparent 70%)" }} className="df-fade" />
      <Confetti count={44} top="40%" startDelay={100} />
      <span className="df-chip df-pop" style={{ background: "rgba(255, 209, 102, 0.16)", color: "var(--gold)", fontSize: 24, letterSpacing: "0.1em", fontWeight: 800 }}>★ NEW PR</span>
      <span className="df-title df-in" style={{ fontSize: 40, ...delay(120) }}>{cap(pr.exercise)}</span>
      <div className="df-col df-pop" style={{ alignItems: "center", gap: 4, ...delay(200) }}>
        <span className="df-huge" style={{ fontSize: 112 }}><Count value={main} digits={Number.isInteger(main) ? 0 : 1} startDelay={250} /><span style={{ fontSize: 44 }}> kg</span></span>
        <span className="df-md df-muted">{isE1rm ? "estimated 1-rep max" : `best weight for ${pr.reps} reps`}</span>
      </div>
      <div className="df-row df-in" style={{ gap: 12, justifyContent: "center", ...delay(420) }}>
        {pr.change_kg !== null && pr.previous_e1rm_kg !== null ? (
          <span className="df-chip df-chip-good" style={{ fontSize: 22 }}>{signed(pr.change_kg)} kg vs {fmtKg(pr.previous_e1rm_kg)}</span>
        ) : (
          <span className="df-chip df-chip-accent" style={{ fontSize: 22 }}>First record</span>
        )}
        <span className="df-chip" style={{ fontSize: 22 }}>{fmtKg(pr.weight_kg)} kg × {pr.reps}</span>
      </div>
      {repBest && (
        <span className="df-md df-in" style={delay(480)}>
          <span style={{ color: "var(--gold)" }}>★</span> Also your best for {repBest.reps} reps: <strong>{fmtKg(repBest.weight_kg)} kg</strong>
        </span>
      )}
      {others.length > 0 && (
        <span className="df-muted df-in df-ellipsis" style={{ maxWidth: 700, ...delay(520) }}>
          Also: {others.map((o) => `${cap(o.exercise)} ${fmtKg(o.kind === "e1rm" ? o.e1rm_kg : o.weight_kg)} kg`).join(" · ")}
        </span>
      )}
    </CardRoot>
  );
}
