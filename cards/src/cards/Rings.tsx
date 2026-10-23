import { useEffect, useState } from "react";
import type { RingsCard } from "@dayform/contracts";
import { Bar, CardRoot, Count, MACROS, Ring, ToolButton, delay, fmt, fmtDate, type CardProps } from "../ui.tsx";

export function Rings({ data, callTool }: CardProps<RingsCard>) {
  const [d, setD] = useState(data);
  useEffect(() => setD(data), [data]);
  const left = d.targets.kcal - d.eaten.kcal;
  const water = d.eaten.water_ml / 1000;
  const waterTarget = d.targets.water_ml / 1000;

  return (
    <CardRoot name="rings">
      <div className="df-spread df-in">
        <div className="df-col" style={{ gap: 4 }}>
          <span className="df-eyebrow">Today</span>
          <span className="df-title">{fmtDate(d.date, { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="df-big" style={{ color: "var(--cyan)" }}><Count value={Math.abs(left)} /></div>
          <div className="df-muted">kcal {left >= 0 ? "left" : "over"}</div>
        </div>
      </div>

      <div className="df-row" style={{ justifyContent: "space-between", flex: 1 }}>
        {MACROS.map((m, i) => (
          <div key={m.key} className="df-col df-in" style={{ alignItems: "center", gap: 10, ...delay(80 + i * 60) }}>
            <Ring size={156} stroke={14} frac={d.eaten[m.key] / d.targets[m.key]} color={m.color} delayMs={150 + i * 60}>
              <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}><Count value={d.eaten[m.key]} startDelay={150 + i * 60} /></span>
              <span className="df-muted" style={{ marginTop: 4 }}>of {fmt(d.targets[m.key])}{m.unit === "g" ? " g" : ""}</span>
            </Ring>
            <span className="df-md df-strong" style={{ color: m.color }}>{m.label}</span>
          </div>
        ))}
      </div>

      <div className="df-panel df-row df-in" style={{ gap: 18, ...delay(320) }}>
        <svg width="26" height="32" viewBox="0 0 26 32" aria-hidden style={{ flex: "none" }}>
          <path d="M13 1C13 1 2 14 2 21a11 11 0 0 0 22 0C24 14 13 1 13 1Z" fill="var(--water)" />
        </svg>
        <div className="df-col df-grow" style={{ gap: 8 }}>
          <div className="df-spread" style={{ alignItems: "baseline" }}>
            <span className="df-md df-strong">Water</span>
            <span className="df-md"><strong><Count value={water} digits={2} /></strong> <span className="df-muted">of {fmt(waterTarget, 1)} L</span></span>
          </div>
          <Bar frac={water / waterTarget} color="var(--water)" delayMs={350} />
        </div>
        <ToolButton callTool={callTool} name="log_water" args={{ glasses: 1 }} label="+ water" doneLabel="Added" repeat
          onResult={(r) => r.structuredContent && "eaten" in r.structuredContent && setD(r.structuredContent as RingsCard)} />
      </div>
    </CardRoot>
  );
}
