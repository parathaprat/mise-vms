import React from "react"
import { AbsoluteFill } from "remotion"
import { AppWindow, Avatar, C, FPS, POP, SNAPPY, TL, Words, camStyle, camera, clamp01, pan, sp } from "../lib"

const VENUES = [
  { name: "Wrigley Field", sub: "General Concessions", hue: 222 },
  { name: "Soldier Field", sub: "United Club & Suites", hue: 30 },
  { name: "United Center", sub: "Premium Dining", hue: 352 },
]
const DAYS = ["Mon 12", "Tue 13", "Wed 14", "Thu 15", "Fri 16", "Sat 17", "Sun 18"]
const ROLES = ["Bartender", "Server", "Cashier", "Barback", "Runner", "Cook", "Host"]
const COUNTS = [6, 8, 4, 10, 12, 14, 8, 5, 6, 9, 7, 12, 16, 10, 4, 6, 8, 5, 10, 12, 8]
// a deterministic, lively fill order
const ORDER = [5, 12, 0, 19, 8, 3, 15, 10, 20, 1, 13, 6, 17, 9, 2, 18, 11, 4, 14, 7, 16]

const GX = 268
const GY = 150
const CW = 160.5
const RH = 166

const TOASTS = [
  { name: "Maya Patel", text: "Checked in at Gate K", where: "Wrigley Field · 3:12 PM" },
  { name: "Diego Alvarez", text: "Checked in on site", where: "Soldier Field · 3:18 PM" },
  { name: "Grace Kim", text: "Picked up an open shift", where: "United Center · Sat" },
]

const rel = (cx: number, cy: number) => ({ x: cx - 720, y: cy - 302 })

export function Schedule({ frame }: { frame: number }) {
  const t = TL.schedule
  const s = frame / FPS
  const enter = pan(frame, 17.3)
  const exit = pan(frame, 23.3)

  const cam = camera(frame, [
    [0, { ...rel(720, 300), s: 0.8, rx: 10, ry: -14 }],
    [17.9, { ...rel(720, 300), s: 0.86, rx: 0, ry: 0 }],
    [19.7, { ...rel(840, 400), s: 1.16 }],
    [20.95, { ...rel(1130, 640), s: 1.55 }],
    [22.95, { ...rel(720, 380), s: 0.96 }],
  ])

  const fillAt = (i: number) => t.fillStart + ORDER.indexOf(i) * t.fillStep
  const filledFrac = clamp01((s - t.fillStart) / (t.fillCount * t.fillStep))
  const filled = 112 + Math.round(36 * filledFrac)
  const live = 0.5 + 0.5 * Math.sin(s * 6)

  return (
    <AbsoluteFill style={{ transform: `translateX(${2100 * (1 - enter.p)}px) translateY(${-1250 * exit.p}px) scale(${enter.dip * exit.dip})` }}>
      <AbsoluteFill style={{ background: C.bg }}>
        <AbsoluteFill style={{ background: "radial-gradient(circle at 20% 0%, rgba(205,239,76,0.22), transparent 38%)" }} />
        <div style={{ position: "absolute", top: 56, left: 0, right: 0, textAlign: "center", fontSize: 96, fontWeight: 600, letterSpacing: -4.2 }}>
          <Words text="Every shift, live." frame={frame} at={17.95} stagger={0.08} out={19.6} />
        </div>
        <AbsoluteFill style={camStyle(cam)}>
          <div style={{ position: "absolute", left: 240, top: 170 }}>
            <AppWindow active="Staffing">
              <div style={{ position: "absolute", left: 48, top: 26, display: "flex", alignItems: "baseline", gap: 16 }}>
                <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.8 }}>Schedule</span>
                <span style={{ fontSize: 17, color: C.muted }}>Week of Oct 12</span>
              </div>
              <div style={{ position: "absolute", right: 48, top: 24, display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, background: C.limeSoft, color: C.limeInk, fontSize: 15, fontWeight: 600 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 9, background: C.limeDeep, boxShadow: `0 0 0 ${4 + live * 4}px rgba(159,199,31,${0.25 * (1 - live)})` }} />
                  Live
                </span>
                <span style={{ padding: "8px 14px", borderRadius: 999, background: C.bg, fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {filled} of 148 shifts filled
                </span>
                <Ring pct={filled / 148} />
              </div>

              {DAYS.map((d, j) => (
                <div key={d} style={{ position: "absolute", left: GX + j * CW, top: 104, width: CW - 10, fontSize: 15, fontWeight: 600, color: j === 5 ? C.ink : C.muted }}>
                  {d}
                </div>
              ))}
              {VENUES.map((v, r) => (
                <div key={v.name} style={{ position: "absolute", left: 48, top: GY + r * RH, width: 200, height: RH - 14, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, borderTop: `1px solid ${C.line}` }}>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>{v.name}</span>
                  <span style={{ fontSize: 14, color: C.muted }}>{v.sub}</span>
                </div>
              ))}

              {Array.from({ length: 21 }).map((_, i) => {
                const r = Math.floor(i / 7)
                const j = i % 7
                const at = fillAt(i)
                const p = sp(frame, at - 0.02, POP)
                const on = s >= at - 0.02
                const count = COUNTS[i]
                const prog = clamp01(sp(frame, at - 0.25, SNAPPY))
                const hue = VENUES[r].hue
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: GX + j * CW,
                      top: GY + r * RH + 10,
                      width: CW - 12,
                      height: RH - 34,
                      borderRadius: 16,
                      border: on ? `1.5px solid hsl(${hue} 50% 82%)` : "1.5px dashed #D8D5CE",
                      background: on ? `hsl(${hue} 70% 96%)` : "transparent",
                      padding: "14px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      transform: `scale(${on ? 0.92 + 0.08 * p : 1})`,
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 600, color: on ? C.ink : C.faint }}>{ROLES[(i * 3) % ROLES.length]}</span>
                    <span style={{ fontSize: 13, color: C.muted }}>{j >= 4 ? "4 to 11 PM" : "10 AM to 4 PM"}</span>
                    <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 6, background: on ? "rgba(0,0,0,0.06)" : C.line }}>
                        <div style={{ height: 6, borderRadius: 6, width: `${(0.35 + 0.65 * prog) * 100}%`, background: on ? `hsl(${hue} 55% 55%)` : "#D8D5CE" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: on ? C.ink2 : C.faint, fontVariantNumeric: "tabular-nums" }}>
                        {on ? count : Math.round(count * 0.35)}/{count}
                      </span>
                    </div>
                  </div>
                )
              })}

              <div style={{ position: "absolute", left: 48, top: 660, display: "flex", alignItems: "center", gap: -8 }}>
                {["Nia Okafor", "Omar Hayes", "Camila Ortiz", "Elijah Foster", "Sofia Reyes"].map((n, i) => (
                  <Avatar key={n} name={n} size={40} style={{ marginLeft: i ? -10 : 0, border: "3px solid #fff" }} />
                ))}
                <span style={{ marginLeft: 14, fontSize: 16, color: C.muted }}>612 Pros working this week across 3 venues</span>
              </div>

              {TOASTS.map((toast, i) => {
                const at = t.toasts[i]
                const p = sp(frame, at - 0.05, { damping: 14, stiffness: 180, mass: 0.8 })
                const lift = t.toasts.slice(i + 1).reduce((acc, at2) => acc + sp(frame, at2 - 0.05, SNAPPY), 0)
                if (s < at - 0.05) return null
                return (
                  <div
                    key={toast.name}
                    style={{
                      position: "absolute",
                      right: 32,
                      top: 690 - lift * 86,
                      width: 420,
                      height: 74,
                      borderRadius: 18,
                      background: C.ink,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "0 16px",
                      transform: `translateX(${(1 - p) * 480}px) scale(${1 - lift * 0.04})`,
                      opacity: 1 - lift * 0.18,
                      boxShadow: "0 24px 50px -18px rgba(0,0,0,0.5)",
                    }}
                  >
                    <Avatar name={toast.name} size={44} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 17, fontWeight: 600 }}>
                        {toast.name} <span style={{ color: C.lime, fontWeight: 500 }}>{toast.text}</span>
                      </span>
                      <span style={{ fontSize: 14, color: "#A7A49C" }}>{toast.where}</span>
                    </div>
                  </div>
                )
              })}
            </AppWindow>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function Ring({ pct }: { pct: number }) {
  const r = 17
  const c = 2 * Math.PI * r
  return (
    <svg width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={r} stroke={C.line} strokeWidth="5" fill="none" />
      <circle cx="22" cy="22" r={r} stroke={C.limeDeep} strokeWidth="5" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" transform="rotate(-90 22 22)" />
    </svg>
  )
}
