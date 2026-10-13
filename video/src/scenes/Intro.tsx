import React from "react"
import { AbsoluteFill, Easing, interpolate } from "remotion"
import { C, FPS, POP, SOFT, TL, Words, clamp01, sp } from "../lib"

const MARK = 260
const MOVE = 185

export function Intro({ frame }: { frame: number }) {
  const t = TL.intro
  const plate = sp(frame, 0.05, { damping: 14, stiffness: 150, mass: 0.9 })
  const dots = t.dots.map((at) => sp(frame, at - 0.2, { damping: 9, stiffness: 210, mass: 0.75 }))
  const lime = sp(frame, t.brand - 0.12, POP)
  const move = sp(frame, t.word - 0.1, SOFT)
  const word = sp(frame, t.word, SOFT)

  const cx = 960 - MOVE * move
  const cy = 500
  // Zoom through the dark top-left circle of the mark into the next scene.
  const zoom = interpolate(frame, [3.5 * FPS, 4.02 * FPS], [1, 70], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.7, 0, 0.84, 0),
  })
  const ox = cx + ((11.5 - 16) / 32) * MARK
  const oy = cy + ((11.5 - 16) / 32) * MARK
  const glow = clamp01(lime) * 0.5

  const dotPos = [
    { x: 11.5, y: 11.5, o: 1 },
    { x: 20.5, y: 11.5, o: 0.45 },
    { x: 11.5, y: 20.5, o: 0.45 },
  ]

  return (
    <AbsoluteFill style={{ background: C.night }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 46%, rgba(205,239,76,${0.16 * glow}), transparent 45%)`,
        }}
      />
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: `${ox}px ${oy}px` }}>
        <div
          style={{
            position: "absolute",
            left: cx - MARK / 2,
            top: cy - MARK / 2,
            width: MARK,
            height: MARK,
            transform: `scale(${0.4 + 0.6 * plate}) rotate(${(1 - plate) * -14}deg)`,
            opacity: clamp01(plate * 2),
          }}
        >
          <svg viewBox="0 0 32 32" width={MARK} height={MARK} style={{ overflow: "visible" }}>
            <rect width="32" height="32" rx="9" fill="#F2F1ED" />
            {dotPos.map((d, i) => (
              <circle
                key={i}
                cx={d.x}
                cy={d.y - (1 - dots[i]) * 26}
                r={3.3 * (0.6 + 0.4 * clamp01(dots[i] * 1.5))}
                fill={C.night}
                fillOpacity={d.o * clamp01(dots[i] * 3)}
              />
            ))}
            <g transform={`translate(20.5 20.5) rotate(${(1 - lime) * -120}) scale(${lime}) translate(-20.5 -20.5)`}>
              <rect x="17.2" y="17.2" width="6.6" height="6.6" rx="2" fill={C.lime} />
            </g>
          </svg>
        </div>
        <div
          style={{
            position: "absolute",
            left: cx + MARK / 2 + 40,
            top: cy - 100,
            height: 200,
            display: "flex",
            alignItems: "center",
            clipPath: `inset(0 ${(1 - clamp01(word)) * 100}% 0 0)`,
          }}
        >
          <span
            style={{
              fontSize: 190,
              fontWeight: 600,
              letterSpacing: -9,
              color: "#F2F1ED",
              transform: `translateX(${(1 - word) * -60}px)`,
              display: "inline-block",
            }}
          >
            Mise
          </span>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: cy + MARK / 2 + 60, textAlign: "center", fontSize: 44, fontWeight: 500, color: "#A7A49C", letterSpacing: -0.6 }}>
          <Words text="The new way to run FlexForce staffing." frame={frame} at={t.tagline} stagger={0.045} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

