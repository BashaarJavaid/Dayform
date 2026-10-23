import type { ProgressCard } from "@dayform/contracts";
import { CardRoot, cap, delay, fmt, fmtDate, signed, type CardProps } from "../ui.tsx";

const METRIC = { e1rm: "estimated 1-rep max", bodyweight: "Bodyweight", calories: "Calories", protein: "Protein" } as const;
const W = 708, H = 290, PAD = { l: 64, r: 26, t: 30, b: 40 };

/** Round axis ticks: ~4 steps of 1, 2, 2.5 or 5 x 10^n covering [lo, hi]. */
function ticks(lo: number, hi: number) {
  const raw = (hi - lo || Math.abs(hi) || 1) / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
  const start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(+v.toFixed(6));
  return out;
}

export function Progress({ data }: CardProps<ProgressCard>) {
  const s = data.series;
  if (s.length === 0) {
    return (
      <CardRoot name="progress" style={{ justifyContent: "center", alignItems: "center" }}>
        <span className="df-eyebrow">Progress · {data.range_weeks} weeks</span>
        <span className="df-title">No data logged yet</span>
      </CardRoot>
    );
  }
  const values = s.map((p) => p.value);
  const yt = ticks(Math.min(...values), Math.max(...values));
  const y0 = yt[0], y1 = yt[yt.length - 1];
  const x = (i: number) => PAD.l + (s.length > 1 ? (i / (s.length - 1)) * (W - PAD.l - PAD.r) : (W - PAD.l - PAD.r) / 2);
  const y = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const line = s.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const area = `${line}L${x(s.length - 1)},${H - PAD.b}L${x(0)},${H - PAD.b}Z`;
  const digits = data.unit === "kg" ? 1 : 0;
  const title = data.metric === "e1rm" && data.exercise ? `${cap(data.exercise)}` : METRIC[data.metric];
  const sub = data.metric === "e1rm" ? METRIC.e1rm : `${data.unit} per day`;
  const labelEvery = s.length > 8 ? Math.ceil(s.length / 7) : 1;

  return (
    <CardRoot name="progress">
      <div className="df-spread df-in">
        <div className="df-col" style={{ gap: 4 }}>
          <span className="df-eyebrow">Progress · {data.range_weeks} weeks</span>
          <span className="df-title">{title} <span className="df-muted" style={{ fontWeight: 500, fontSize: 24 }}>{sub}</span></span>
        </div>
        <div className="df-col df-pop" style={{ alignItems: "flex-end", gap: 6, ...delay(750) }}>
          <span className="df-chip df-chip-good" style={{ fontSize: 28, padding: "8px 18px" }}>
            {signed(data.summary.change, digits)} {data.unit}{data.metric === "e1rm" ? " e1RM" : ""}
          </span>
          <span className="df-muted">{signed(data.summary.change_pct, 1)}% · {fmt(data.summary.start, digits)} → {fmt(data.summary.end, digits)}</span>
        </div>
      </div>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id="df-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#19d3ff" stopOpacity="0.32" />
            <stop offset="1" stopColor="#19d3ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yt.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.l - 12} y={y(v) + 7} textAnchor="end" fontSize="20" fill="var(--muted)">{fmt(v, Number.isInteger(v) ? 0 : 1)}</text>
          </g>
        ))}
        {s.map((p, i) =>
          i % labelEvery === 0 || i === s.length - 1 ? (
            <text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="20" fill="var(--muted)">{fmtDate(p.date, { day: "numeric", month: "short" })}</text>
          ) : null,
        )}
        <path d={area} fill="url(#df-area)" className="df-fade" style={delay(500)} />
        <path d={line} fill="none" stroke="var(--cyan)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round"
          pathLength={1} strokeDasharray="1" style={{ animation: "df-draw 900ms cubic-bezier(0.22, 1, 0.36, 1) 100ms both" }} />
        {s.map((p, i) => {
          const last = i === s.length - 1;
          return (
            <g key={p.date} className="df-pop" style={{ transformOrigin: `${x(i)}px ${y(p.value)}px`, transformBox: "view-box", ...delay(150 + (i / Math.max(s.length - 1, 1)) * 640) }}>
              <circle cx={x(i)} cy={y(p.value)} r={last ? 9 : 6} fill={last ? "var(--cyan)" : "var(--bg)"} stroke="var(--cyan)" strokeWidth="3" />
            </g>
          );
        })}
        <text x={x(s.length - 1)} y={y(s[s.length - 1].value) - 20} textAnchor="end" fontSize="26" fontWeight="800" fill="var(--text)"
          className="df-fade" style={delay(780)}>
          {fmt(s[s.length - 1].value, digits)} {data.unit}
        </text>
      </svg>
    </CardRoot>
  );
}
