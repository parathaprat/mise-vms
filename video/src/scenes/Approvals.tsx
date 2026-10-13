import React from "react"
import { AbsoluteFill, Easing, interpolate } from "remotion"
import { Avatar, C, Check, Cursor, FPS, POP, SNAPPY, SOFT, TL, Words, clamp01, pan, press, sp, track } from "../lib"

const CARDS = [
  { type: "Headcount change", where: "Wrigley Field", title: "+4 bartenders for Saturday", detail: "+$686 · Within weekly budget", by: "Tasha Greene" },
  { type: "Timesheet", where: "Soldier Field", title: "Diego Alvarez · 7.5 hours", detail: "Clock-out matches the geofence", by: "Ray Mendoza" },
  { type: "New request", where: "United Center", title: "8 servers · Sun, Oct 18", detail: "$1,372 · All checks passed", by: "Alicia Park" },
  { type: "Tip batch", where: "Wrigley Field", title: "$1,840 across 12 Pros", detail: "Split by hours worked", by: "Tasha Greene" },
  { type: "Rate exception", where: "Soldier Field", title: "Lead bartender at $27.00 / hr", detail: "Within program policy", by: "Jordan Ellis" },
]

const CARD_W = 900
const CARD_H = 300
const DECK_X = 960
const DECK_Y = 610
const APPROVE = { x: DECK_X + CARD_W / 2 - 110, y: DECK_Y + CARD_H / 2 - 62 }

export function Approvals({ frame }: { frame: number }) {
  const t = TL.approvals
  const s = frame / FPS
  const enterPan = pan(frame, 23.3)
  const enter = enterPan.p
  const exitP = interpolate(frame, [29.55 * FPS, 30.05 * FPS], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.55, 0, 0.85, 0.3),
  })
  const advanced = t.clicks.reduce((acc, at) => acc + sp(frame, at + 0.05, { damping: 15, stiffness: 170, mass: 0.9 }), 0)
  const remaining = 5 - t.clicks.filter((at) => s >= at).length
  const clear = sp(frame, t.clear, POP)
  const cursorIn = sp(frame, 24.55, SOFT)
  const pr = t.clicks.reduce((acc, at) => Math.max(acc, press(frame, at)), 0)
  // After each click the hand drifts off the button, then travels back as the next card arrives.
  const away = (dx: number, dy: number) => t.clicks.flatMap((at, i) => (i < t.clicks.length - 1 ? [[at + 0.08, i % 2 ? -dx : dx], [t.clicks[i + 1] - 0.32, 0]] : [[at + 0.1, dx * 1.6]])) as [number, number][]
  const cursorDX = track(frame, [[0, 0], ...away(70, 0)], { damping: 15, stiffness: 140 })
  const cursorDY = track(frame, [[0, 120], [24.55, 0], ...t.clicks.flatMap((at, i) => (i < t.clicks.length - 1 ? [[at + 0.08, 64], [t.clicks[i + 1] - 0.32, 0]] : [[at + 0.1, 140]])) as [number, number][]], { damping: 15, stiffness: 140 })
  const camS = 1 + 0.06 * clamp01((s - 24) / 6)

  return (
    <AbsoluteFill
      style={{
        transform: `translateY(${1250 * (1 - enter)}px) scale(${enterPan.dip * (1 + exitP * 0.7)})`,
        opacity: 1 - exitP,
        filter: exitP > 0 ? `blur(${exitP * 16}px)` : undefined,
      }}
    >
      <AbsoluteFill style={{ background: C.bg }}>
        <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 75%, rgba(205,239,76,0.26), transparent 45%)" }} />
        <div style={{ position: "absolute", top: 70, left: 0, right: 0, textAlign: "center", fontSize: 104, fontWeight: 600, letterSpacing: -4.6 }}>
          <Words text="Approve in one click." frame={frame} at={23.95} stagger={0.08} />
        </div>
        <div style={{ position: "absolute", top: 210, left: 0, right: 0, textAlign: "center", fontSize: 34, color: C.muted, fontWeight: 500, letterSpacing: -0.4 }}>
          <Words text="Every decision arrives with the context to make it." frame={frame} at={24.3} stagger={0.035} />
        </div>

        <AbsoluteFill style={{ transform: `scale(${camS})`, transformOrigin: `${DECK_X}px ${DECK_Y}px` }}>
          <div style={{ position: "absolute", left: DECK_X - CARD_W / 2, top: DECK_Y - CARD_H / 2 - 74, display: "flex", alignItems: "center", gap: 12, opacity: clamp01(enter * 2) * (1 - clear) }}>
            <span style={{ fontSize: 22, fontWeight: 600 }}>To do</span>
            <span style={{ minWidth: 34, height: 30, padding: "0 10px", borderRadius: 30, background: C.ink, color: "#fff", fontSize: 16, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", transform: `scale(${1 + 0.25 * t.clicks.reduce((a, at) => a + Math.max(0, press(frame, at + 0.1)), 0)})` }}>
              {remaining}
            </span>
          </div>

          {CARDS.map((c, i) => {
            const depth = i - advanced
            const at = t.clicks[i]
            const fly = sp(frame, at + 0.04, { damping: 16, stiffness: 90, mass: 0.9 })
            const approved = s >= at
            if (depth < -1.2 && fly > 0.99) return null
            const d = Math.max(0, depth)
            const y = DECK_Y - d * 30
            const scale = 1 - d * 0.055
            const op = clamp01(1 - (d - 2.6))
            const stamp = sp(frame, at, POP)
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: DECK_X,
                  top: y,
                  width: CARD_W,
                  height: CARD_H,
                  zIndex: 10 - i,
                  transform: `translate(-50%, -50%) translate(${fly * 1500}px, ${-fly * 160 + fly * fly * 220}px) rotate(${fly * 24}deg) scale(${scale})`,
                  opacity: op,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: 30,
                    background: C.card,
                    boxShadow: `0 ${40 - d * 8}px ${90 - d * 20}px -30px rgba(30,30,25,${0.38 - d * 0.08}), 0 0 0 1px rgba(0,0,0,0.05)`,
                    padding: "34px 38px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 17, fontWeight: 600, color: C.muted }}>
                    <span style={{ padding: "6px 12px", borderRadius: 999, background: C.bg, color: C.ink2 }}>{c.type}</span>
                    {c.where}
                  </div>
                  <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1.2 }}>{c.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 20, color: C.ink2 }}>
                    <Check size={26} p={1} />
                    {c.detail}
                  </div>
                  <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                    <Avatar name={c.by} size={36} />
                    <span style={{ fontSize: 16, color: C.muted }}>Requested by {c.by}</span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
                      <span style={{ height: 54, padding: "0 22px", borderRadius: 14, border: `1.5px solid ${C.border}`, display: "inline-flex", alignItems: "center", fontSize: 18, fontWeight: 600, color: C.ink2 }}>Decline</span>
                      <span
                        style={{
                          height: 54,
                          padding: "0 26px",
                          borderRadius: 14,
                          background: approved ? C.lime : C.ink,
                          color: approved ? C.limeInk : "#fff",
                          display: "inline-flex",
                          alignItems: "center",
                          fontSize: 18,
                          fontWeight: 600,
                          transform: `scale(${1 - press(frame, at) * 0.08})`,
                        }}
                      >
                        {approved ? "Approved" : "Approve"}
                      </span>
                    </div>
                  </div>
                  {approved ? (
                    <div style={{ position: "absolute", right: 34, top: 30, transform: `scale(${stamp}) rotate(${(1 - stamp) * -30}deg)` }}>
                      <Check size={58} p={stamp} />
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}

          <div
            style={{
              position: "absolute",
              left: DECK_X,
              top: DECK_Y,
              transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * clear})`,
              opacity: clamp01(clear * 2),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 22,
            }}
          >
            <Check size={150} p={clear} />
            <div style={{ fontSize: 52, fontWeight: 600, letterSpacing: -1.6 }}>All caught up</div>
            <div style={{ fontSize: 24, color: C.muted, opacity: clamp01(sp(frame, t.clear + 0.25, SNAPPY)) }}>Every decision is logged with who, when and why.</div>
          </div>

          <Cursor x={APPROVE.x + cursorDX} y={APPROVE.y + 4 + cursorDY} press={pr} opacity={clamp01(cursorIn * 2) * (1 - clamp01((s - 27.7) / 0.3))} />
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
