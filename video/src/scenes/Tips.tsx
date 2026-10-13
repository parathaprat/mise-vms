import React from "react"
import { AbsoluteFill, Easing, interpolate } from "remotion"
import { Avatar, C, FPS, POP, TL, Words, clamp01, money, sp } from "../lib"

const CX = 960
const CY = 610
const PROS = [
  { name: "Maya Patel", hrs: 7.5, x: 430, y: 460 },
  { name: "Diego Alvarez", hrs: 7, x: 360, y: 680 },
  { name: "Imani Brooks", hrs: 7.5, x: 560, y: 880 },
  { name: "Jamal Carter", hrs: 6, x: 1490, y: 460 },
  { name: "Sofia Reyes", hrs: 7, x: 1560, y: 680 },
  { name: "Kenji Nguyen", hrs: 6.5, x: 1360, y: 880 },
]
const TOTAL = 1840
const HOURS = PROS.reduce((a, p) => a + p.hrs, 0)

export function Tips({ frame }: { frame: number }) {
  const t = TL.tips
  const s = frame / FPS
  const reveal = sp(frame, 35.6, { damping: 26, stiffness: 70, mass: 1 })
  const pool = sp(frame, t.pool, POP)
  const stamp = sp(frame, t.matched, { damping: 10, stiffness: 220, mass: 0.7 })
  const out = interpolate(frame, [39.55 * FPS, 40 * FPS], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.6, 0, 0.9, 0.3) })
  const drift = Math.sin(s * 1.2) * 6
  const pulse = 1 + 0.025 * Math.sin(s * Math.PI * 4) * clamp01(s - 38)

  return (
    <AbsoluteFill style={{ clipPath: `circle(${reveal * 1300}px at 50% 55%)` }}>
      <AbsoluteFill style={{ background: "#F3F6E6", transform: `scale(${1 - out * 0.35})`, opacity: 1 - out }}>
        <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 58%, rgba(205,239,76,0.5), transparent 40%)" }} />
        <div style={{ position: "absolute", top: 60, left: 0, right: 0, textAlign: "center", fontSize: 96, fontWeight: 600, letterSpacing: -4.2 }}>
          <Words text="Tips, split by hours worked." frame={frame} at={35.9} stagger={0.07} />
        </div>
        <div style={{ position: "absolute", top: 190, left: 0, right: 0, textAlign: "center", fontSize: 34, color: C.muted, fontWeight: 500 }}>
          <Words text="Paid to Pros the next business day." frame={frame} at={36.3} stagger={0.04} />
        </div>

        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
          {PROS.map((p, i) => {
            const at = t.splits[i]
            const draw = clamp01((s - (at - 0.45)) / 0.4)
            const mx = (CX + p.x) / 2
            const my = Math.min(CY, p.y) - 90
            const d = `M ${CX} ${CY} Q ${mx} ${my} ${p.x} ${p.y}`
            return <path key={i} d={d} stroke={C.limeDeep} strokeWidth={3} fill="none" strokeDasharray="1200" strokeDashoffset={1200 * (1 - draw)} strokeLinecap="round" opacity={0.55} />
          })}
        </svg>

        {PROS.map((p, i) => {
          const at = t.splits[i]
          const k = clamp01((s - (at - 0.45)) / 0.45)
          const e = Easing.bezier(0.4, 0, 0.2, 1)(k)
          const mx = (CX + p.x) / 2
          const my = Math.min(CY, p.y) - 90
          const bx = (1 - e) * (1 - e) * CX + 2 * (1 - e) * e * mx + e * e * p.x
          const by = (1 - e) * (1 - e) * CY + 2 * (1 - e) * e * my + e * e * p.y
          const chip = sp(frame, at, POP)
          const amount = (TOTAL * p.hrs) / HOURS
          return (
            <React.Fragment key={p.name}>
              {k > 0 && k < 1 ? (
                <div style={{ position: "absolute", left: bx, top: by, width: 26, height: 26, borderRadius: 26, background: C.lime, transform: "translate(-50%, -50%)", boxShadow: "0 0 24px 8px rgba(205,239,76,0.7)" }} />
              ) : null}
              <div
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y + drift * (i % 2 ? 1 : -1),
                  transform: `translate(-50%, -50%) scale(${chip})`,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 22px 14px 14px",
                  borderRadius: 999,
                  background: C.card,
                  boxShadow: "0 24px 50px -20px rgba(60,80,10,0.35), 0 0 0 1px rgba(0,0,0,0.04)",
                }}
              >
                <Avatar name={p.name} size={52} />
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 19, fontWeight: 600, whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ fontSize: 18, color: C.ink2, fontWeight: 500 }}>{p.hrs} hours</span>
                </div>
                <span style={{ marginLeft: 8, fontSize: 26, fontWeight: 600, color: C.limeInk, fontVariantNumeric: "tabular-nums" }}>{money(amount, true)}</span>
              </div>
            </React.Fragment>
          )
        })}

        <div
          style={{
            position: "absolute",
            left: CX,
            top: CY,
            transform: `translate(-50%, -50%) scale(${pool * pulse})`,
            width: 400,
            padding: "30px 34px",
            borderRadius: 32,
            background: C.ink,
            color: "#fff",
            boxShadow: "0 40px 90px -30px rgba(0,0,0,0.6)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 17, color: "#A7A49C", fontWeight: 500 }}>Tip pool · Cubs vs. Cardinals</span>
          <span style={{ fontSize: 66, fontWeight: 600, letterSpacing: -2.5, fontVariantNumeric: "tabular-nums" }}>{money(TOTAL, true)}</span>
          <span style={{ fontSize: 16, color: C.lime, fontWeight: 600 }}>{t.splits.filter((a) => s >= a).length} of 6 Pros paid</span>
        </div>

        <div
          style={{
            position: "absolute",
            left: CX,
            top: CY + 175,
            transform: `translate(-50%, -50%) scale(${stamp}) rotate(${(1 - stamp) * 18 - 4}deg)`,
            opacity: clamp01(stamp * 2),
            padding: "12px 22px",
            borderRadius: 14,
            border: `3px solid ${C.limeInk}`,
            color: C.limeInk,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            background: "rgba(241,249,210,0.9)",
          }}
        >
          Billed at cost · INV-2291
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
