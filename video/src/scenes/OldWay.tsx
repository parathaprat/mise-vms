import React from "react"
import { AbsoluteFill, Easing, interpolate } from "remotion"
import { C, Eyebrow, FPS, POP, TL, Words, clamp01, sp } from "../lib"

type Card = { x: number; y: number; r: number; depth: number; kind: "mail" | "sheet" | "wait" | "error"; title: string; meta: string }

const CARDS: Card[] = [
  { x: 380, y: 210, r: -6, depth: 1, kind: "mail", title: "RE: RE: FW: Saturday staffing?", meta: "14 replies · Unread" },
  { x: 1550, y: 250, r: 5, depth: 1, kind: "sheet", title: "Tips_week41_FINAL_v3.xlsx", meta: "Edited by 4 people" },
  { x: 330, y: 840, r: 4, depth: 1, kind: "wait", title: "Approval pending", meta: "Waiting 4 days" },
  { x: 1590, y: 820, r: -5, depth: 1, kind: "error", title: "Timesheet rejected", meta: "Missing clock-out" },
  { x: 800, y: 150, r: 3, depth: 0.72, kind: "mail", title: "Reminder: please approve hours", meta: "Sent 3rd time" },
  { x: 1170, y: 930, r: -3, depth: 0.78, kind: "error", title: "Invoice adjustment #2291", meta: "Needs manual review" },
  { x: 1200, y: 140, r: -4, depth: 0.7, kind: "mail", title: "Who is covering Gate K?", meta: "No reply" },
  { x: 720, y: 950, r: 6, depth: 0.74, kind: "sheet", title: "Hours_retyped_148_lines.csv", meta: "Re-keyed by hand" },
]

function Icon({ kind }: { kind: Card["kind"] }) {
  const stroke = kind === "error" ? "#E5684F" : kind === "wait" ? C.amber : "#8E8B83"
  return (
    <div style={{ width: 48, height: 48, borderRadius: 13, background: "#2C2B28", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {kind === "mail" ? (
          <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </>
        ) : kind === "sheet" ? (
          <>
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M4 9h16M4 15h16M10 3v18" />
          </>
        ) : kind === "wait" ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5v.5" />
          </>
        )}
      </svg>
    </div>
  )
}

const LINES = ["Requests buried in email threads.", "Hours retyped from spreadsheets.", "Approvals that wait for days."]

export function OldWay({ frame }: { frame: number }) {
  const t = TL.oldway
  const s = frame / FPS
  const implode = interpolate(frame, [t.implode * FPS, 9.75 * FPS], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.6, 0, 0.9, 0.4),
  })
  const dot = sp(frame, 9.55, POP)
  const label = sp(frame, 4.1)

  return (
    <AbsoluteFill style={{ background: C.night, fontFamily: "inherit" }}>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 50%, #1D1C1A 0%, #0C0C0B 70%)" }} />
      {CARDS.map((c, i) => {
        const at = t.cards[i]
        const p = sp(frame, at - 0.06, { damping: 13, stiffness: 300, mass: 0.7 })
        const driftX = Math.sin(s * 0.9 + i) * 8 * c.depth
        const driftY = Math.cos(s * 0.7 + i * 1.7) * 6 * c.depth
        const x = c.x + driftX
        const y = c.y + driftY
        const ix = x + (960 - x) * implode
        const iy = y + (540 - y) * implode
        const scale = (1.35 - 0.35 * p) * c.depth * (1 - implode)
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: ix,
              top: iy,
              width: 460,
              transform: `translate(-50%, -50%) rotate(${c.r * (0.4 + 0.6 * p) + implode * 140 * (i % 2 ? 1 : -1)}deg) scale(${scale})`,
              opacity: clamp01(p * 2) * (0.55 + 0.45 * c.depth),
              filter: c.depth < 1 ? `blur(${(1 - c.depth) * 9}px)` : undefined,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 18,
                alignItems: "center",
                padding: "22px 24px",
                borderRadius: 22,
                background: "#1E1D1B",
                border: "1px solid #2E2D2A",
                boxShadow: "0 30px 60px -20px rgba(0,0,0,0.7)",
              }}
            >
              <Icon kind={c.kind} />
              <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                <span style={{ fontSize: 21, fontWeight: 600, color: "#D9D6CF", whiteSpace: "nowrap" }}>{c.title}</span>
                <span style={{ fontSize: 16, color: c.kind === "wait" ? C.amber : c.kind === "error" ? "#E98B77" : "#7E7B74" }}>{c.meta}</span>
              </div>
            </div>
          </div>
        )
      })}

      <div style={{ position: "absolute", left: 120, top: 90, opacity: clamp01(label) * (1 - implode), transform: `translateY(${(1 - label) * 20}px)` }}>
        <Eyebrow color="#8E8B83">FlexForce today</Eyebrow>
      </div>

      {LINES.map((line, i) => {
        const at = t.lines[i]
        const next = i < LINES.length - 1 ? t.lines[i + 1] - 0.18 : t.implode - 0.05
        if (frame < (at - 0.1) * FPS || frame > (next + 0.6) * FPS) return null
        return (
          <AbsoluteFill key={i} style={{ alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 100, fontWeight: 600, letterSpacing: -4, color: "#F2F1ED", textAlign: "center", width: 1500 }}>
              <Words text={line} frame={frame} at={at} stagger={0.07} out={next} />
            </div>
          </AbsoluteFill>
        )
      })}

      <div
        style={{
          position: "absolute",
          left: 960,
          top: 540,
          width: 90,
          height: 90,
          borderRadius: 90,
          background: C.lime,
          transform: `translate(-50%, -50%) scale(${dot})`,
          boxShadow: `0 0 ${120 * dot}px ${40 * dot}px rgba(205,239,76,0.35)`,
        }}
      />
    </AbsoluteFill>
  )
}
