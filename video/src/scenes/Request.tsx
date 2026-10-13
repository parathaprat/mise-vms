import React from "react"
import { AbsoluteFill } from "remotion"
import {
  AppWindow,
  Avatar,
  C,
  Check,
  Cursor,
  FPS,
  POP,
  SNAPPY,
  SOFT,
  TL,
  Words,
  camStyle,
  camera,
  clamp01,
  ease,
  lerp,
  money,
  pan,
  press,
  sp,
  track,
} from "../lib"

const SENTENCE = "12 bartenders at Wrigley this Saturday, 4 to 11pm"
const CHAR = 14.6
const INPUT_X = 80
const INPUT_Y = 200

const FIELDS = [
  { label: "Position", value: "Bartender", x: 188, y: 335 },
  { label: "Headcount", value: "12 Pros", x: 488, y: 335 },
  { label: "Venue", value: "Wrigley Field", x: 788, y: 335 },
  { label: "Date", value: "Sat, Oct 17", x: 188, y: 465 },
  { label: "Shift", value: "4:00 to 11:00 PM", x: 488, y: 465 },
  { label: "Rate", value: "$24.50 / hr", x: 788, y: 465 },
]

// token in sentence -> field index, in the order chips fly
const TOKENS = [
  { text: "12", idx: 0, field: 1 },
  { text: "bartenders", idx: 3, field: 0 },
  { text: "Wrigley", idx: 17, field: 2 },
  { text: "this Saturday", idx: 25, field: 3 },
  { text: "4 to 11pm", idx: 40, field: 4 },
]

const PROS = ["Maya Patel", "Diego Alvarez", "Imani Brooks", "Jamal Carter", "Sofia Reyes", "Kenji Nguyen", "Aaliyah Scott", "Elijah Foster", "Camila Ortiz", "Omar Hayes", "Grace Kim", "Nia Okafor"]

const CHECKS = ["Rate matches the Wrigley rate card", "Within the weekly cost center budget", "Check-in, parking and attire attached"]

const rel = (wx: number, wy: number) => ({ x: wx - 720, y: wy - 302 })

export function Request({ frame }: { frame: number }) {
  const t = TL.request
  const s = frame / FPS
  const enter = sp(frame, t.window, { damping: 16, stiffness: 90, mass: 1 })
  const reveal = sp(frame, t.window - 0.02, { damping: 26, stiffness: 70, mass: 1 })
  const out = pan(frame, 17.3)

  const cam = camera(frame, [
    [0, { ...rel(720, 300), s: 0.78, rx: 10, ry: -10 }],
    [t.window, { ...rel(720, 300), s: 0.86, rx: 0, ry: 0 }],
    [10.85, { ...rel(470, 200), s: 1.72 }],
    [12.85, { ...rel(488, 400), s: 1.22 }],
    [14.15, { ...rel(690, 650), s: 1.36 }],
    [15.1, { ...rel(1040, 430), s: 1.3 }],
    [16.95, { ...rel(720, 420), s: 0.98 }],
  ])

  const typed = clamp01((s - t.typeStart) / (t.typeEnd - t.typeStart))
  const chars = Math.floor(SENTENCE.length * typed)
  const caretOn = Math.floor(s * 2.4) % 2 === 0 || (s > t.typeStart && s < t.typeEnd)
  const estimate = Math.round(2058 * ease(frame, 13.0, 14.35, 0, 1))
  const posted = s >= t.click
  const confirmed = t.pros.filter((at) => s >= at).length
  const pBtn = press(frame, t.click)
  const cursorIn = sp(frame, t.cursorMove, SOFT)
  const curX = track(frame, [[0, 520], [t.cursorMove, 792]], { damping: 20, stiffness: 90, mass: 1 })
  const curY = track(frame, [[0, 700], [t.cursorMove, 742]], { damping: 20, stiffness: 90, mass: 1 })
  const done = sp(frame, t.done, POP)

  return (
    <AbsoluteFill style={{ transform: `translateX(${-2100 * out.p}px) scale(${out.dip})` }}>
      <AbsoluteFill style={{ background: C.bg, clipPath: `circle(${reveal * 1300}px at 50% 50%)` }}>
        <AbsoluteFill style={{ background: "radial-gradient(circle at 70% 10%, rgba(205,239,76,0.28), transparent 40%)" }} />

        <div style={{ position: "absolute", top: 56, left: 0, right: 0, textAlign: "center", fontSize: 96, fontWeight: 600, letterSpacing: -4.2, color: C.ink }}>
          <Words text="One sentence. Fully staffed." frame={frame} at={10.08} stagger={0.07} out={10.95} />
        </div>

        <AbsoluteFill style={camStyle(cam)}>
          <div
            style={{
              position: "absolute",
              left: 240,
              top: 170,
              transform: `translateY(${(1 - enter) * 420}px) scale(${0.86 + 0.14 * enter})`,
              opacity: clamp01(enter * 2),
            }}
          >
            <AppWindow active="Staffing">
              <div style={{ position: "absolute", left: 48, top: 26, fontSize: 30, fontWeight: 600, letterSpacing: -0.8 }}>Request staff</div>
              <div style={{ position: "absolute", left: 48, top: 66, fontSize: 16, color: C.muted }}>Describe what you need. Mise fills in the rest.</div>

              {/* Natural language input */}
              <div
                style={{
                  position: "absolute",
                  left: 48,
                  top: INPUT_Y - 50,
                  width: 880,
                  height: 100,
                  borderRadius: 18,
                  border: `2px solid ${s > t.typeStart - 0.3 ? C.ink : C.border}`,
                  boxShadow: s > t.typeStart - 0.3 ? `0 0 0 6px ${C.limeSoft}` : "none",
                  background: C.card,
                }}
              />
              <div style={{ position: "absolute", left: INPUT_X, top: INPUT_Y - 18, fontSize: 26, fontWeight: 500, color: C.ink, whiteSpace: "pre", fontFamily: "inherit" }}>
                {chars === 0 && s < t.typeStart ? <span style={{ color: C.faint }}>e.g. 12 bartenders at Wrigley this Saturday</span> : null}
                {renderTyped(SENTENCE.slice(0, chars), frame)}
                {s < t.chips[0] ? <span style={{ display: "inline-block", width: 2.5, height: 30, background: C.ink, marginLeft: 2, verticalAlign: -5, opacity: caretOn ? 1 : 0 }} /> : null}
              </div>
              <div style={{ position: "absolute", left: 788, top: INPUT_Y - 20, opacity: clamp01(sp(frame, t.typeEnd, SNAPPY)) }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 13px", borderRadius: 999, background: C.limeSoft, color: C.limeInk, fontSize: 14, fontWeight: 600 }}>
                  <Sparkle /> Understood
                </span>
              </div>

              {/* Fields */}
              {FIELDS.map((f, i) => {
                const tokenIdx = TOKENS.findIndex((tk) => tk.field === i)
                const at = tokenIdx >= 0 ? t.chips[tokenIdx] : 14.25
                const pop = sp(frame, at, POP)
                const flash = Math.max(0, 1 - Math.max(0, s - at) / 0.7) * (s >= at ? 1 : 0)
                return (
                  <div
                    key={f.label}
                    style={{
                      position: "absolute",
                      left: f.x - 140,
                      top: f.y - 55,
                      width: 280,
                      height: 110,
                      borderRadius: 16,
                      border: `1.5px solid ${flash > 0.05 ? C.limeDeep : C.border}`,
                      background: lerpColor(flash),
                      padding: "18px 20px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 14, color: C.muted, fontWeight: 500 }}>{f.label}</span>
                    <span
                      style={{
                        fontSize: 23,
                        fontWeight: 600,
                        letterSpacing: -0.4,
                        color: C.ink,
                        transform: `scale(${0.7 + 0.3 * pop})`,
                        transformOrigin: "left center",
                        opacity: clamp01(pop * 2),
                        display: "inline-block",
                      }}
                    >
                      {f.value}
                    </span>
                    {i === 5 ? <span style={{ position: "absolute", right: 16, top: 16, fontSize: 12, color: C.limeInk, opacity: clamp01(pop) }}>From rate card</span> : null}
                  </div>
                )
              })}

              {/* Flying chips */}
              {TOKENS.map((tk, i) => {
                const at = t.chips[i]
                const p = sp(frame, at - 0.32, { damping: 20, stiffness: 190, mass: 0.8 })
                if (s < at - 0.32 || s > at + 0.25) return null
                const sx = INPUT_X + (tk.idx + tk.text.length / 2) * CHAR
                const sy = INPUT_Y
                const f = FIELDS[tk.field]
                const x = lerp(sx, f.x, p)
                const y = lerp(sy, f.y, p) - Math.sin(Math.PI * clamp01(p)) * 70
                const fade = s > at ? 1 - (s - at) / 0.25 : 1
                return (
                  <div
                    key={tk.text}
                    style={{
                      position: "absolute",
                      left: x,
                      top: y,
                      transform: `translate(-50%, -50%) scale(${1 + 0.15 * Math.sin(Math.PI * clamp01(p))})`,
                      padding: "8px 16px",
                      borderRadius: 999,
                      background: C.lime,
                      color: C.limeInk,
                      fontWeight: 600,
                      fontSize: 22,
                      whiteSpace: "nowrap",
                      opacity: fade,
                      boxShadow: "0 14px 30px -10px rgba(110,140,20,0.55)",
                      zIndex: 20,
                    }}
                  >
                    {tk.text}
                  </div>
                )
              })}

              {/* Checks and post */}
              <div style={{ position: "absolute", left: 48, top: 562, width: 880, height: 228, borderRadius: 18, border: `1.5px solid ${C.border}`, padding: "22px 24px" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.muted, marginBottom: 16 }}>Before it posts</div>
                {CHECKS.map((c, i) => {
                  const p = sp(frame, 14.3 + i * 0.14, POP)
                  return (
                    <div key={c} style={{ display: "flex", alignItems: "center", gap: 14, height: 46, opacity: 0.35 + 0.65 * clamp01(p * 2) }}>
                      <Check size={28} p={p} />
                      <span style={{ fontSize: 19, fontWeight: 500 }}>{c}</span>
                    </div>
                  )
                })}
                <div
                  style={{
                    position: "absolute",
                    right: 24,
                    bottom: 22,
                    height: 58,
                    padding: "0 26px",
                    borderRadius: 14,
                    background: posted ? C.lime : C.ink,
                    color: posted ? C.limeInk : "#fff",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 19,
                    fontWeight: 600,
                    transform: `scale(${1 - pBtn * 0.07 + (posted ? 0.04 * Math.sin(Math.PI * clamp01((s - t.click) / 0.3)) : 0)})`,
                  }}
                >
                  {posted ? <Check size={24} p={sp(frame, t.click, POP)} color={C.limeInk} ink={C.lime} /> : null}
                  {posted ? "Posted to 3 suppliers" : "Post request"}
                </div>
              </div>

              {/* Estimate */}
              <div style={{ position: "absolute", left: 968, top: 26, width: 424, height: 160, borderRadius: 18, background: C.bg, padding: "22px 26px" }}>
                <div style={{ fontSize: 15, color: C.muted, fontWeight: 500 }}>Estimated cost</div>
                <div style={{ fontSize: 54, fontWeight: 600, letterSpacing: -2, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{money(estimate)}</div>
                <div style={{ fontSize: 15, color: C.muted, marginTop: 2 }}>12 Pros · 7 hrs · $24.50 / hr</div>
              </div>

              {/* Roster */}
              <div style={{ position: "absolute", left: 968, top: 206, width: 424, height: 584, borderRadius: 18, border: `1.5px solid ${C.border}`, padding: "20px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 19, fontWeight: 600 }}>Pros</span>
                  <span style={{ fontSize: 15, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{confirmed} of 12 confirmed</span>
                </div>
                <div style={{ height: 8, borderRadius: 8, background: C.line, marginTop: 14, overflow: "hidden" }}>
                  <div style={{ height: 8, width: `${track(frame, [[0, 0], ...t.pros.map((at, i) => [at, ((i + 1) / 12) * 100] as [number, number])], SNAPPY)}%`, background: C.limeDeep, borderRadius: 8 }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
                  {PROS.map((name, i) => {
                    const p = sp(frame, t.pros[i] - 0.04, POP)
                    const has = s >= t.pros[i] - 0.04
                    return (
                      <div key={name} style={{ height: 64, borderRadius: 14, border: `1.5px ${has ? "solid" : "dashed"} ${has ? C.border : "#DAD7D0"}`, display: "flex", alignItems: "center", gap: 10, padding: "0 10px", background: has ? C.card : "transparent" }}>
                        {has ? (
                          <>
                            <Avatar name={name} size={38} style={{ transform: `scale(${p})` }} />
                            <div style={{ display: "flex", flexDirection: "column", opacity: clamp01(p * 2), transform: `translateX(${(1 - p) * 12}px)` }}>
                              <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap" }}>{name}</span>
                              <span style={{ fontSize: 12, color: C.limeInk, fontWeight: 600 }}>Confirmed</span>
                            </div>
                          </>
                        ) : (
                          <span style={{ fontSize: 13, color: C.faint, paddingLeft: 6 }}>{posted ? "Matching…" : "Open"}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div style={{ position: "absolute", left: 1180, top: 160, transform: `translate(-50%, 0) scale(${done})`, opacity: clamp01(done * 2), zIndex: 30 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 20px", borderRadius: 999, background: C.ink, color: "#fff", fontSize: 20, fontWeight: 600, boxShadow: "0 20px 40px -14px rgba(0,0,0,0.45)" }}>
                  <Check size={26} p={done} /> Fully staffed
                </span>
              </div>

              <Cursor x={curX} y={curY} press={pBtn} opacity={clamp01(cursorIn * 2) * (1 - ease(frame, 15.4, 15.8))} />
            </AppWindow>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

function renderTyped(text: string, frame: number) {
  const s = frame / FPS
  const out: React.ReactNode[] = []
  let cursor = 0
  const marks = TOKENS.map((tk, i) => ({ ...tk, at: TL.request.chips[i] })).sort((a, b) => a.idx - b.idx)
  for (const m of marks) {
    if (m.idx >= text.length) break
    if (m.idx > cursor) out.push(<span key={`p${cursor}`}>{text.slice(cursor, m.idx)}</span>)
    const seg = text.slice(m.idx, Math.min(text.length, m.idx + m.text.length))
    const hl = clamp01((s - (m.at - 0.4)) / 0.15)
    out.push(
      <span key={`m${m.idx}`} style={{ background: `rgba(205,239,76,${0.55 * hl})`, borderRadius: 6, boxShadow: hl > 0 ? `0 0 0 3px rgba(205,239,76,${0.55 * hl})` : undefined }}>
        {seg}
      </span>,
    )
    cursor = m.idx + seg.length
  }
  if (cursor < text.length) out.push(<span key="tail">{text.slice(cursor)}</span>)
  return out
}

function lerpColor(flash: number) {
  const a = [255, 255, 255]
  const b = [241, 249, 210]
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * flash))
  return `rgb(${c.join(",")})`
}

function Sparkle() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={C.limeInk}>
      <path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7z" />
    </svg>
  )
}

