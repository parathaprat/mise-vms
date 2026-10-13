import React from "react"
import { AbsoluteFill, interpolate } from "remotion"
import { C, FPS, POP, SOFT, TL, Words, clamp01, ease, lerp, sp } from "../lib"

const MARK = 200
const WORD_W = 470
const GAP = 44
const ROW_W = MARK + GAP + WORD_W
const MARK_CX = 960 - ROW_W / 2 + MARK / 2
const MARK_CY = 480

function mix(a: [number, number, number], b: [number, number, number], t: number) {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`
}

export function End({ frame }: { frame: number }) {
  const t = TL.end
  const s = frame / FPS
  // A montage panel collapses into the brand mark.
  const morph = sp(frame, 49.62, { damping: 15, stiffness: 95, mass: 1 })
  const m = clamp01(morph)
  const w = lerp(310, MARK, morph)
  const h = lerp(210, MARK, morph)
  const cx = lerp(960, MARK_CX, morph)
  const cy = lerp(540, MARK_CY, morph)
  const radius = lerp(15, (9 / 32) * MARK, m)
  const dots = [0, 1, 2].map((i) => sp(frame, t.mark + i * 0.07 - 0.05, POP))
  const lime = sp(frame, t.mark + 0.2, POP)
  const word = sp(frame, t.word, SOFT)
  const settle = sp(frame, t.tagline - 0.2, { damping: 22, stiffness: 70 })
  const fade = interpolate(frame, [t.fade * FPS, (TL.duration - 0.05) * FPS], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const bg = ease(frame, 49.95, 50.15)
  const glow = (0.6 + 0.4 * Math.sin(s * 1.6)) * clamp01((s - 50) * 2)
  const appear = clamp01((s - 49.62) / 0.12)

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: C.bg, opacity: bg }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 46%, rgba(205,239,76,${0.32 * glow}), transparent 42%)` }} />
      <AbsoluteFill style={{ opacity: fade, transform: `translateY(${-50 * settle}px) scale(${1 + 0.02 * clamp01((s - 50) / 5)})` }}>
        <div
          style={{
            position: "absolute",
            left: cx - w / 2,
            top: cy - h / 2,
            width: w,
            height: h,
            borderRadius: radius,
            background: mix([255, 255, 255], [30, 30, 28], clamp01(m * 1.25)),
            boxShadow: `0 ${40 * (1 - m) + 20}px ${80 * (1 - m) + 40}px -30px rgba(30,30,25,${0.35 - 0.15 * m})`,
            opacity: appear,
            transform: `rotate(${(1 - morph) * -6}deg)`,
          }}
        >
          <svg viewBox="0 0 32 32" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
            {[
              { x: 11.5, y: 11.5, o: 1 },
              { x: 20.5, y: 11.5, o: 0.45 },
              { x: 11.5, y: 20.5, o: 0.45 },
            ].map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={3.3 * dots[i]} fill={C.bg} fillOpacity={d.o} />
            ))}
            <g transform={`translate(20.5 20.5) rotate(${(1 - lime) * -90}) scale(${lime}) translate(-20.5 -20.5)`}>
              <rect x="17.2" y="17.2" width="6.6" height="6.6" rx="2" fill={C.lime} />
            </g>
          </svg>
        </div>
        <div style={{ position: "absolute", left: 960 - ROW_W / 2 + MARK + GAP, top: MARK_CY - 110, height: 220, display: "flex", alignItems: "center", overflow: "hidden", width: WORD_W * clamp01(word) }}>
          <span style={{ display: "inline-block", fontSize: 200, fontWeight: 600, letterSpacing: -10, lineHeight: 1, transform: `translateX(${(1 - word) * -80}px)` }}>Mise</span>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 650, textAlign: "center", fontSize: 54, fontWeight: 600, letterSpacing: -1.6 }}>
          <Words text="Built for FlexForce partners." frame={frame} at={t.tagline} stagger={0.06} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: 730, textAlign: "center", fontSize: 32, color: C.muted, fontWeight: 500 }}>
          <Words text="Request to payment, in one place." frame={frame} at={t.tagline + 0.5} stagger={0.04} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
