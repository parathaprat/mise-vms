import React from "react"
import { AbsoluteFill, interpolate } from "remotion"
import { Avatar, C, Check, FAST_CAM, FPS, POP, SNAPPY, TL, Words, camera, clamp01, ease, money, sp } from "../lib"

const PW = 620
const PH = 420
const POS = [
  { x: -660, y: -230 },
  { x: 0, y: -230 },
  { x: 660, y: -230 },
  { x: -660, y: 230 },
  { x: 0, y: 230 },
  { x: 660, y: 230 },
]

const CAPTIONS = ["Spend.", "Fill rate.", "Supplier quality.", "All in one view."]

export function Montage({ frame }: { frame: number }) {
  const t = TL.montage
  const s = frame / FPS
  const cuts = t.cuts
  const cam = camera(
    frame,
    [
      [0, { x: 0, y: 0, s: 0.42, rx: 26, rz: -9 }],
      [45.5, { x: 0, y: 0, s: 0.5, rx: 24, rz: -8 }],
      [cuts[0] - 0.08, { x: POS[0].x, y: POS[0].y, s: 1.45, rx: 8, rz: -2 }],
      [cuts[1] - 0.08, { x: POS[1].x, y: POS[1].y, s: 1.45, rx: 8, rz: 2 }],
      [cuts[2] - 0.08, { x: POS[2].x, y: POS[2].y, s: 1.45, rx: 8, rz: -2 }],
      [cuts[3] - 0.08, { x: 0, y: 0, s: 0.74, rx: 16, rz: -5 }],
      [49.55, { x: 0, y: 20, s: 0.5, rx: 24, rz: -8 }],
    ],
    FAST_CAM,
  )
  const fade = interpolate(frame, [49.65 * FPS, 50.1 * FPS], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const enter = sp(frame, 45.5, { damping: 20, stiffness: 120 })
  const capIdx = cuts.filter((c) => s >= c - 0.05).length - 1

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade * ease(frame, 45.72, 46.0) }}>
      <AbsoluteFill style={{ perspective: 2600 }}>
        <AbsoluteFill
          style={{
            transform: `rotateX(${cam.rx}deg) rotateZ(${cam.rz}deg) scale(${cam.s}) translate(${-cam.x}px, ${-cam.y}px)`,
            transformOrigin: "50% 50%",
            opacity: clamp01(enter * 1.5),
          }}
        >
          {POS.map((p, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 960 + p.x - PW / 2,
                top: 540 + p.y - PH / 2,
                width: PW,
                height: PH,
                borderRadius: 30,
                background: C.card,
                boxShadow: "0 50px 100px -40px rgba(30,30,25,0.4), 0 0 0 1px rgba(0,0,0,0.05)",
                padding: 34,
                overflow: "hidden",
              }}
            >
              <Panel i={i} frame={frame} start={[cuts[0], cuts[1], cuts[2], 47.5, 48.4, 46.6][i] - 0.15} />
            </div>
          ))}
        </AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(244,243,239,0) 55%, rgba(244,243,239,0.92) 88%)", opacity: clamp01(enter * 1.5) }} />
      {capIdx >= 0 ? (
        <div key={capIdx} style={{ position: "absolute", left: 120, bottom: 90, fontSize: 120, fontWeight: 600, letterSpacing: -5.5, color: C.ink, textShadow: "0 0 40px rgba(244,243,239,0.9)" }}>
          <Words text={CAPTIONS[capIdx]} frame={frame} at={cuts[capIdx] - 0.02} stagger={0.06} cfg={SNAPPY} style={{ justifyContent: "flex-start" }} />
        </div>
      ) : null}
    </AbsoluteFill>
  )
}

function Panel({ i, frame, start }: { i: number; frame: number; start: number }) {
  const g = (d = 0) => sp(frame, start + d, POP)
  if (i === 0) {
    const bars = [0.62, 0.84, 0.48, 0.92, 0.7, 0.56]
    return (
      <Shell title="Spend this month" value={money(Math.round(412380 * ease(frame, start, start + 0.7)))}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 22, height: 200, marginTop: 30 }}>
          {bars.map((b, k) => (
            <div key={k} style={{ flex: 1, height: `${b * 100 * clamp01(g(k * 0.05))}%`, borderRadius: 12, background: k === 3 ? C.limeDeep : C.ink }} />
          ))}
        </div>
      </Shell>
    )
  }
  if (i === 1) {
    const pts = [0.55, 0.6, 0.58, 0.7, 0.74, 0.72, 0.84, 0.88, 0.93, 0.97]
    const draw = ease(frame, start, start + 0.8)
    const d = pts.map((v, k) => `${k === 0 ? "M" : "L"} ${(k / (pts.length - 1)) * 552} ${200 - v * 180}`).join(" ")
    return (
      <Shell title="Fill rate" value={`${(91 + 6.8 * draw).toFixed(1)}%`}>
        <svg width={552} height={210} style={{ marginTop: 26 }}>
          <path d={`${d} L 552 210 L 0 210 Z`} fill={C.limeSoft} opacity={draw} />
          <path d={d} stroke={C.limeDeep} strokeWidth={5} fill="none" strokeDasharray={900} strokeDashoffset={900 * (1 - draw)} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Shell>
    )
  }
  if (i === 2) {
    const rows = [
      ["Instawork", 98],
      ["Lakeshore", 94],
      ["Crescent", 91],
      ["Summit", 88],
    ] as const
    return (
      <Shell title="Supplier scorecard" value="4 suppliers">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 26 }}>
          {rows.map(([n, v], k) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ width: 130, fontSize: 20, fontWeight: 600 }}>{n}</span>
              <div style={{ flex: 1, height: 14, borderRadius: 14, background: C.line }}>
                <div style={{ width: `${v * clamp01(g(k * 0.07))}%`, height: 14, borderRadius: 14, background: k === 0 ? C.limeDeep : C.ink }} />
              </div>
              <span style={{ width: 40, fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{Math.round(v * clamp01(g(k * 0.07)))}</span>
            </div>
          ))}
        </div>
      </Shell>
    )
  }
  if (i === 3) {
    return (
      <div style={{ display: "flex", gap: 30, height: "100%", alignItems: "center" }}>
        <div style={{ width: 210, height: 360, borderRadius: 38, background: C.ink, padding: 10 }}>
          <div style={{ width: "100%", height: "100%", borderRadius: 30, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
            <Check size={70} p={g()} />
            <span style={{ fontSize: 20, fontWeight: 600 }}>Checked in</span>
            <span style={{ fontSize: 14, color: C.muted }}>Gate K · 3:58 PM</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 17, color: C.muted, fontWeight: 500 }}>For Pros</span>
          <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: -1 }}>Geofenced check-in</span>
          <span style={{ fontSize: 18, color: C.muted }}>Directions, parking and attire in one place.</span>
        </div>
      </div>
    )
  }
  if (i === 4) {
    return (
      <Shell title="INV-2291 · Wrigley Field" value="Matched">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
          {["148 timesheets", "12 tip batches", "3 rate exceptions"].map((l, k) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 21, fontWeight: 500 }}>
              <Check size={30} p={g(k * 0.1)} />
              {l}
            </div>
          ))}
        </div>
      </Shell>
    )
  }
  return (
    <Shell title="Right now" value="142 of 148 filled">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {["Maya Patel", "Diego Alvarez", "Imani Brooks", "Grace Kim"].map((n, k) => (
            <Avatar key={n} name={n} size={46} style={{ marginLeft: k ? -14 : 0, border: "3px solid #fff", transform: `scale(${g(k * 0.05)})` }} />
          ))}
          <span style={{ fontSize: 18, color: C.muted }}>checked in at Wrigley</span>
        </div>
        <span style={{ fontSize: 22, fontWeight: 600 }}>3 decisions waiting on you</span>
        <span style={{ fontSize: 18, color: C.muted }}>Tonight · Cubs vs. Cardinals · 4 PM</span>
      </div>
    </Shell>
  )
}

function Shell({ title, value, children }: { title: string; value: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 19, color: C.muted, fontWeight: 500 }}>{title}</span>
      <span style={{ fontSize: 52, fontWeight: 600, letterSpacing: -2, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      {children}
    </div>
  )
}
