import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import type { CartCard } from "@dayform/contracts";
import { CardRoot, Count, ToolButton, delay, fmtDate, type CardProps } from "../ui.tsx";

const MAX_LINES = 14; // two columns of 7

function Qr({ text, size }: { text: string; size: number }) {
  const path = useMemo(() => {
    const qr = qrcode(0, "L");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
    return { d, n };
  }, [text]);
  const q = 2; // quiet zone, in modules
  return (
    <svg width={size} height={size} viewBox={`${-q} ${-q} ${path.n + 2 * q} ${path.n + 2 * q}`} shapeRendering="crispEdges"
      style={{ background: "#fff", borderRadius: 12, display: "block" }} role="img" aria-label="QR code for the Amazon cart">
      <path d={path.d} fill="#000" />
    </svg>
  );
}

export function Cart({ data, callTool, openLink }: CardProps<CartCard>) {
  const [d, setD] = useState(data);
  useEffect(() => setD(data), [data]);
  const lines = d.items.slice(0, d.items.length > MAX_LINES ? MAX_LINES - 1 : MAX_LINES);
  const more = d.items.length - lines.length;
  const url = d.add_to_cart_url;

  return (
    <CardRoot name="cart">
      <div className="df-spread df-in">
        <div className="df-col" style={{ gap: 4 }}>
          <span className="df-eyebrow">Amazon cart</span>
          <span className="df-title">{d.item_count} items · {d.pack_count} packs</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="df-big" style={{ color: "var(--cyan)" }}>$<Count value={d.estimated_total_usd} digits={2} /></div>
          <div className="df-muted">estimated · prices {fmtDate(d.price_date, { day: "numeric", month: "short" })}</div>
        </div>
      </div>

      <div className="df-row df-grow" style={{ gap: 18, alignItems: "stretch" }}>
        <ul className="df-grow" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridAutoRows: 36, columnGap: 16, alignContent: "start" }}>
          {lines.map((it, i) => (
            <li key={it.catalog_item_id} className="df-row df-in" style={{ gap: 8, borderBottom: "1px solid var(--line)", ...delay(60 + i * 30) }}>
              <span className="df-ellipsis df-grow">{it.name}</span>
              {it.packs > 1 && <span className="df-strong" style={{ color: "var(--cyan)", flex: "none" }}>×{it.packs}</span>}
            </li>
          ))}
          {more > 0 && <li className="df-muted df-row">+ {more} more</li>}
        </ul>

        <div className="df-col df-pop" style={{ width: 172, flex: "none", alignItems: "center", justifyContent: "center", gap: 12, ...delay(300) }}>
          {url ? (
            <>
              <Qr text={url} size={168} />
              {openLink ? (
                <button className="df-btn" onClick={() => openLink(url)} style={{ fontSize: 20, padding: "10px 14px", whiteSpace: "normal", lineHeight: 1.1 }}>Open Amazon cart</button>
              ) : (
                <span className="df-muted" style={{ textAlign: "center" }}>Scan to open your Amazon cart</span>
              )}
            </>
          ) : (
            <>
              <span className="df-muted" style={{ textAlign: "center" }}>You check out on Amazon. Alexa never places the order.</span>
              <ToolButton callTool={callTool} name="checkout_cart" args={{}} label="Checkout" doneLabel="✓ Ready"
                onResult={(r) => r.structuredContent && "items" in r.structuredContent && setD(r.structuredContent as CartCard)} />
            </>
          )}
        </div>
      </div>
    </CardRoot>
  );
}
