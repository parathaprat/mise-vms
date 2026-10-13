import React from "react"
import { AbsoluteFill, Easing, interpolate } from "remotion"
import { AppWindow, Avatar, C, Check, Cursor, FPS, POP, SNAPPY, SOFT, TL, Words, camStyle, camera, clamp01, ease, press, sp, track } from "../lib"

const ROWS = [
  { name: "Maya Patel", role: "Bartender", in: "3:58 PM", out: "11:02 PM", hrs: "6.5" },
  { name: "Diego Alvarez", role: "Bartender", in: "3:55 PM", out: "11:00 PM", hrs: "6.6" },
  { name: "Imani Brooks", role: "Server", in: "4:01 PM", out: "10:58 PM", hrs: "6.5" },
  { name: "Jamal Carter", role: "Barback", in: "3:52 PM", out: "11:04 PM", hrs: "6.7" },
  { name: "Sofia Reyes", role: "Cashier", in: "3:59 PM", out: "11:01 PM", hrs: "6.5" },
  { name: "Kenji Nguyen", role: "Runner", in: "4:00 PM", out: "10:57 PM", hrs: "6.5" },
  { name: "Aaliyah Scott", role: "Bartender", in: "3:57 PM", out: "11:42 PM", hrs: "7.2" },
  { name: "Elijah Foster", role: "Server", in: "3:56 PM", out: "11:00 PM", hrs: "6.6" },
  { name: "Camila Ortiz", role: "Cook", in: "3:50 PM", out: "11:03 PM", hrs: "6.7" },
]

const TOP = 150
const RH = 62
const COLS = { pro: 48, role: 360, in: 620, out: 790, hrs: 960, status: 1110 }
const PANEL = 168

const rel = (cx: number, cy: number) => ({ x: cx - 720, y: cy - 302 })

export function Timesheets({ frame }: { frame: number }) {
  const t = TL.timesheets
  const s = frame / FPS
  const enterP = sp(frame, 29.75, { damping: 18, stiffness: 110, mass: 1 })
  const exitP = interpolate(frame, [35.6 * FPS, 36.0 * FPS], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.55, 0, 0.85, 0.3) })
  const rowAt = (i: number) => t.scanStart + i * t.checkStep * 2
  const scanY = TOP + RH * 9 * clamp01((s - t.scanStart) / (t.rows * t.checkStep * 2))
  const scanOn = s > t.scanStart - 0.1 && s < t.scanStart + t.rows * t.checkStep * 2 + 0.2
  const open = sp(frame, rowAt(t.flagRow) + 0.6, SNAPPY) - sp(frame, t.click + 0.35, SNAPPY)
  const panelH = PANEL * clamp01(open)
  const fixed = s >= t.click
  const flagY = TOP + t.flagRow * RH

  const cam = camera(frame, [
    [0, { ...rel(720, 300), s: 0.78 }],
    [29.75, { ...rel(720, 300), s: 0.86 }],
    [t.zoom, { ...rel(720, flagY + 110), s: 1.36 }],
    [t.release, { ...rel(720, 420), s: 0.95 }],
  ])

  const cursorIn = sp(frame, 33.2, SOFT)
  const curX = track(frame, [[0, 1150], [33.2, 1290]], { damping: 20, stiffness: 90 })
  const curY = track(frame, [[0, flagY + 300], [33.2, flagY + 150]], { damping: 20, stiffness: 90 })
  const pr = press(frame, t.click)
  const summary = sp(frame, 34.9, POP)
  const approvedCount = ROWS.filter((_, i) => i !== t.flagRow && s >= rowAt(i)).length + (fixed ? 1 : 0)

  return (
    <AbsoluteFill style={{ opacity: clamp01(enterP * 1.5) * (1 - exitP), transform: `scale(${(0.82 + 0.18 * enterP) * (1 - exitP * 0.25)})` }}>
      <AbsoluteFill style={{ background: C.bg }}>
        <AbsoluteFill style={{ background: "radial-gradient(circle at 85% 20%, rgba(205,239,76,0.22), transparent 40%)" }} />
        <div style={{ position: "absolute", top: 48, left: 0, right: 0, textAlign: "center", fontSize: 92, fontWeight: 600, letterSpacing: -4 }}>
          <Words text="Clean hours approve themselves." frame={frame} at={29.85} stagger={0.07} out={32.3} />
        </div>
        <AbsoluteFill style={camStyle(cam)}>
          <div style={{ position: "absolute", left: 240, top: 170 }}>
            <AppWindow active="Approvals">
              <div style={{ position: "absolute", left: 48, top: 26, display: "flex", alignItems: "baseline", gap: 16 }}>
                <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.8 }}>Timesheets</span>
                <span style={{ fontSize: 17, color: C.muted }}>Cubs vs. Cardinals · Wrigley Field · Sat, Oct 17</span>
              </div>
              <div style={{ position: "absolute", right: 48, top: 24, padding: "8px 14px", borderRadius: 999, background: C.limeSoft, color: C.limeInk, fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {approvedCount} of 9 approved
              </div>
              {Object.entries({ pro: "Pro", role: "Position", in: "Clock in", out: "Clock out", hrs: "Hours", status: "Status" }).map(([k, label]) => (
                <div key={k} style={{ position: "absolute", left: COLS[k as keyof typeof COLS], top: 108, fontSize: 14, fontWeight: 600, color: C.muted }}>
                  {label}
                </div>
              ))}

              {ROWS.map((r, i) => {
                const at = rowAt(i)
                const flagged = i === t.flagRow
                const below = i > t.flagRow ? panelH : 0
                const y = TOP + i * RH + below
                const p = sp(frame, at, POP)
                const done = s >= at
                const warn = flagged && done && !fixed
                return (
                  <div key={r.name} style={{ position: "absolute", left: 24, right: 24, top: y, height: RH, borderTop: `1px solid ${C.line}`, background: warn ? C.amberSoft : "transparent", borderRadius: warn ? 12 : 0 }}>
                    <div style={{ position: "absolute", left: COLS.pro - 24, top: 12, display: "flex", alignItems: "center", gap: 12 }}>
                      <Avatar name={r.name} size={38} />
                      <span style={{ fontSize: 18, fontWeight: 600 }}>{r.name}</span>
                    </div>
                    <Cell x={COLS.role}>{r.role}</Cell>
                    <Cell x={COLS.in} mono>
                      {r.in}
                    </Cell>
                    <Cell x={COLS.out} mono color={warn ? "#B7791F" : undefined} bold={warn}>
                      {fixed && flagged ? "11:00 PM" : r.out}
                    </Cell>
                    <Cell x={COLS.hrs} mono>
                      {fixed && flagged ? "7.0" : r.hrs}
                    </Cell>
                    <div style={{ position: "absolute", left: COLS.status - 24, top: 13 }}>
                      {!done ? (
                        <span style={{ fontSize: 15, color: C.faint, fontWeight: 600 }}>Pending</span>
                      ) : flagged && !fixed ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "#FBE3B4", color: "#8A5A0B", fontSize: 15, fontWeight: 600, transform: `scale(${p})` }}>
                          Clocked out 42 min late
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: C.limeInk }}>
                          <Check size={26} p={flagged ? sp(frame, t.click, POP) : p} />
                          {flagged ? "Adjusted and approved" : "Approved"}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Inline exception panel */}
              <div style={{ position: "absolute", left: 24, right: 24, top: flagY + RH, height: panelH, overflow: "hidden" }}>
                <div style={{ margin: "10px 0 0", height: PANEL - 20, borderRadius: 16, background: C.card, border: `1.5px solid #F1D49A`, padding: "18px 24px", display: "flex", alignItems: "center", gap: 36 }}>
                  <Detail label="Scheduled end" value="11:00 PM" />
                  <Detail label="Clocked out" value="11:42 PM" warn />
                  <Detail label="Left the geofence" value="11:05 PM" />
                  <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
                    <span style={{ height: 54, padding: "0 20px", borderRadius: 14, border: `1.5px solid ${C.border}`, display: "inline-flex", alignItems: "center", fontSize: 17, fontWeight: 600, color: C.ink2 }}>Keep 11:42 PM</span>
                    <span style={{ height: 54, padding: "0 22px", borderRadius: 14, background: fixed ? C.lime : C.ink, color: fixed ? C.limeInk : "#fff", display: "inline-flex", alignItems: "center", fontSize: 17, fontWeight: 600, transform: `scale(${1 - pr * 0.08})` }}>
                      Cap at 11:00 PM
                    </span>
                  </div>
                </div>
              </div>

              {scanOn ? (
                <div style={{ position: "absolute", left: 24, right: 24, top: scanY - 40, height: 44, background: "linear-gradient(180deg, rgba(205,239,76,0) 0%, rgba(205,239,76,0.45) 100%)", borderBottom: `2px solid ${C.limeDeep}`, pointerEvents: "none" }} />
              ) : null}

              <div style={{ position: "absolute", left: 48, bottom: 26, display: "flex", alignItems: "center", gap: 14, opacity: clamp01(summary * 2), transform: `translateY(${(1 - summary) * 20}px)` }}>
                <Check size={30} p={summary} />
                <span style={{ fontSize: 19, fontWeight: 600 }}>8 approved automatically</span>
                <span style={{ fontSize: 19, color: C.muted }}>· 1 adjusted by you · 0 emails sent</span>
              </div>

              <Cursor x={curX} y={curY} press={pr} opacity={clamp01(cursorIn * 2) * (1 - ease(frame, 34.4, 34.8))} />
            </AppWindow>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function Cell({ x, children, mono, color, bold }: { x: number; children: React.ReactNode; mono?: boolean; color?: string; bold?: boolean }) {
  return (
    <span style={{ position: "absolute", left: x - 24, top: 19, fontSize: 17, color: color ?? C.ink2, fontWeight: bold ? 700 : 500, fontVariantNumeric: mono ? "tabular-nums" : undefined }}>
      {children}
    </span>
  )
}

function Detail({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 14, color: C.muted, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 26, fontWeight: 600, color: warn ? "#B7791F" : C.ink, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  )
}
