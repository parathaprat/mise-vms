import React from "react"
import { AbsoluteFill, Easing, interpolate } from "remotion"
import { C, FPS, POP, SOFT, TL, Words, clamp01, sp } from "../lib"

const ROWS = [
  { label: "Timesheet approvals", old: "3 to 8 days", next: "Same day", oldW: 1, newW: 0.12 },
  { label: "Tip payouts to Pros", old: "2+ weeks", next: "Next business day", oldW: 1, newW: 0.08 },
  { label: "Systems to run a shift", old: "2", next: "1", oldW: 1, newW: 0.5 },
]

const LABEL_X = 150
const OLD_X = 760
const NEW_X = 1300
const BAR_W = 440

export function Compare({ frame }: { frame: number }) {
  const t = TL.compare
  const s = frame / FPS
  const flash = interpolate(frame, [40 * FPS, 40.45 * FPS], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const head = sp(frame, 40.15, SOFT)
  const push = 1 + 0.05 * clamp01((s - 40) / 6)
  const out = interpolate(frame, [45.55 * FPS, 46 * FPS], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.6, 0, 0.9, 0.3) })

  return (
    <AbsoluteFill style={{ background: C.night }}>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 75% 55%, rgba(205,239,76,0.12), transparent 45%)" }} />
      <AbsoluteFill style={{ transform: `scale(${push * (1 + out * 0.5)})`, opacity: 1 - out, filter: out > 0 ? `blur(${out * 14}px)` : undefined }}>
        <div style={{ position: "absolute", left: LABEL_X, top: 110, fontSize: 92, fontWeight: 600, letterSpacing: -4, color: "#F2F1ED" }}>
          <Words text="What changes for partners." frame={frame} at={40.05} stagger={0.07} style={{ justifyContent: "flex-start" }} />
        </div>
        <div style={{ position: "absolute", left: OLD_X, top: 290, fontSize: 22, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", color: "#7E7B74", opacity: head, transform: `translateY(${(1 - head) * 20}px)` }}>
          FlexForce today
        </div>
        <div style={{ position: "absolute", left: NEW_X, top: 290, fontSize: 22, fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", color: C.lime, opacity: head, transform: `translateY(${(1 - head) * 20}px)` }}>
          With Mise
        </div>

        {ROWS.map((r, i) => {
          const at = t.rows[i]
          const y = 370 + i * 200
          const rowIn = sp(frame, at - 0.25, SOFT)
          const oldBar = sp(frame, at - 0.1, { damping: 20, stiffness: 120 })
          const nb = sp(frame, at + 0.5, POP)
          return (
            <div key={r.label} style={{ position: "absolute", left: 0, right: 0, top: y, height: 170, opacity: clamp01(rowIn * 1.5), transform: `translateY(${(1 - rowIn) * 40}px)` }}>
              <div style={{ position: "absolute", left: LABEL_X, right: 150, top: 0, height: 1, background: C.nightLine }} />
              <div style={{ position: "absolute", left: LABEL_X, top: 46, fontSize: 34, fontWeight: 600, color: "#D9D6CF", letterSpacing: -0.6 }}>{r.label}</div>
              <div style={{ position: "absolute", left: OLD_X, top: 34, fontSize: 52, fontWeight: 600, color: "#7E7B74", letterSpacing: -1.6 }}>{r.old}</div>
              <div style={{ position: "absolute", left: OLD_X, top: 116, width: BAR_W * r.oldW * oldBar, height: 10, borderRadius: 10, background: "#3A3936" }} />
              <div
                style={{
                  position: "absolute",
                  left: NEW_X,
                  top: 30,
                  fontSize: 60,
                  fontWeight: 600,
                  color: "#F7F6F2",
                  letterSpacing: -2,
                  transform: `scale(${0.7 + 0.3 * nb})`,
                  transformOrigin: "left center",
                  opacity: clamp01(nb * 2),
                  whiteSpace: "nowrap",
                }}
              >
                {r.next}
              </div>
              <div style={{ position: "absolute", left: NEW_X, top: 116, width: Math.max(14, BAR_W * r.newW * nb), height: 10, borderRadius: 10, background: C.lime, boxShadow: `0 0 ${24 * nb}px rgba(205,239,76,0.6)` }} />
            </div>
          )
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: flash, pointerEvents: "none" }} />
    </AbsoluteFill>
  )
}
