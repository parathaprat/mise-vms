import React from "react"
import { interpolate, spring, Easing } from "remotion"
import { loadFont } from "@remotion/google-fonts/Geist"
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono"
import TL from "./timeline.json"

export const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] })
export const { fontFamily: monoFamily } = loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] })

export { TL }
export const FPS = TL.fps
export const W = 1920
export const H = 1080
export const sec = (s: number) => Math.round(s * FPS)

export const C = {
  bg: "#F4F3EF",
  bg2: "#ECEAE4",
  card: "#FFFFFF",
  ink: "#1E1E1C",
  ink2: "#3A3936",
  muted: "#7A776F",
  faint: "#A9A69E",
  border: "#E4E2DC",
  line: "#EFEDE8",
  lime: "#CDEF4C",
  limeDeep: "#9FC71F",
  limeInk: "#2E4510",
  limeSoft: "#F1F9D2",
  amber: "#F2B544",
  amberSoft: "#FDF1D8",
  red: "#E5684F",
  night: "#0C0C0B",
  night2: "#171715",
  nightLine: "#2A2926",
}

export type SpringCfg = { damping?: number; stiffness?: number; mass?: number; overshootClamping?: boolean }

export const BOUNCY: SpringCfg = { damping: 11, stiffness: 170, mass: 0.85 }
export const POP: SpringCfg = { damping: 9, stiffness: 260, mass: 0.6 }
export const SNAPPY: SpringCfg = { damping: 18, stiffness: 240, mass: 0.8 }
export const SOFT: SpringCfg = { damping: 16, stiffness: 110, mass: 1 }
export const CAMERA: SpringCfg = { damping: 22, stiffness: 62, mass: 1.1 }
export const FAST_CAM: SpringCfg = { damping: 24, stiffness: 150, mass: 0.9 }
export const PAN: SpringCfg = { damping: 19, stiffness: 58, mass: 1 }

/** Shared camera pan between two scenes: progress plus a pull-back dip so the move reads as one continuous shot. */
export function pan(frame: number, at: number) {
  const p = sp(frame, at, PAN)
  const dip = 1 - 0.14 * Math.sin(Math.PI * Math.min(1, Math.max(0, p)))
  return { p, dip }
}

/** Spring progress for an event at absolute time `at` (seconds). Zero before the event. */
export function sp(frame: number, at: number, cfg: SpringCfg = BOUNCY): number {
  const f = frame - at * FPS
  if (f <= 0) return 0
  return spring({ frame: f, fps: FPS, config: cfg })
}

/** Keyframed value where each change is carried by its own spring, so moves blend physically. */
export function track(frame: number, kfs: [number, number][], cfg: SpringCfg = CAMERA): number {
  let v = kfs[0][1]
  for (let i = 1; i < kfs.length; i++) v += (kfs[i][1] - kfs[i - 1][1]) * sp(frame, kfs[i][0], cfg)
  return v
}

export type Cam = { x: number; y: number; s: number; rx?: number; ry?: number; rz?: number }

export function camera(frame: number, kfs: [number, Cam][], cfg: SpringCfg = CAMERA): Required<Cam> {
  const pick = (k: keyof Cam) => track(frame, kfs.map(([t, c]) => [t, (c[k] as number | undefined) ?? 0]), cfg)
  return { x: pick("x"), y: pick("y"), s: track(frame, kfs.map(([t, c]) => [t, c.s]), cfg), rx: pick("rx"), ry: pick("ry"), rz: pick("rz") }
}

export function camStyle(c: Required<Cam>): React.CSSProperties {
  return {
    transform: `perspective(2600px) rotateX(${c.rx}deg) rotateY(${c.ry}deg) rotateZ(${c.rz}deg) scale(${c.s}) translate(${-c.x}px, ${-c.y}px)`,
    transformOrigin: "50% 50%",
  }
}

export function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

export function ease(frame: number, a: number, b: number, from = 0, to = 1, fn = Easing.bezier(0.22, 1, 0.36, 1)) {
  return interpolate(frame, [a * FPS, b * FPS], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: fn })
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function money(v: number, cents = false) {
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
}

/** Headline that rises word by word with a spring and a blur that resolves. */
export function Words({
  text,
  frame,
  at,
  stagger = 0.06,
  style,
  cfg = SOFT,
  out,
}: {
  text: string
  frame: number
  at: number
  stagger?: number
  style?: React.CSSProperties
  cfg?: SpringCfg
  out?: number
}) {
  const words = text.split(" ")
  const exit = out !== undefined ? sp(frame, out, SNAPPY) : 0
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "center", columnGap: "0.26em", ...style }}>
      {words.map((w, i) => {
        const p = sp(frame, at + i * stagger, cfg)
        const blur = (1 - clamp01(p)) * 14 + exit * 10
        return (
          <span key={i} style={{ display: "inline-block", paddingBottom: "0.08em" }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - p) * 60 - exit * 40}px) scale(${0.96 + 0.04 * p})`,
                opacity: clamp01(p * 1.4) * (1 - exit),
                filter: `blur(${blur}px)`,
              }}
            >
              {w}
            </span>
          </span>
        )
      })}
    </span>
  )
}

export function BrandMark({ size = 64, dark = false, style }: { size?: number; dark?: boolean; style?: React.CSSProperties }) {
  const fg = dark ? "#F2F1ED" : C.ink
  const bg = dark ? C.night : C.bg
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} style={style}>
      <rect width="32" height="32" rx="9" fill={fg} />
      <circle cx="11.5" cy="11.5" r="3.3" fill={bg} />
      <circle cx="20.5" cy="11.5" r="3.3" fill={bg} fillOpacity="0.45" />
      <circle cx="11.5" cy="20.5" r="3.3" fill={bg} fillOpacity="0.45" />
      <rect x="17.2" y="17.2" width="6.6" height="6.6" rx="2" fill={C.lime} />
    </svg>
  )
}

const HUES = [222, 30, 352, 280, 145, 200, 52, 330, 18, 160, 268, 100]
export function Avatar({ name, size = 40, style }: { name: string; size?: number; style?: React.CSSProperties }) {
  const parts = name.split(" ")
  const initials = (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase()
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997
  const hue = HUES[h % HUES.length]
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        background: `hsl(${hue} 55% 88%)`,
        color: `hsl(${hue} 45% 28%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: size * 0.38,
        flexShrink: 0,
        ...style,
      }}
    >
      {initials}
    </div>
  )
}

export function Check({ size = 22, p = 1, color = C.lime, ink = C.limeInk }: { size?: number; p?: number; color?: string; ink?: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${p})`,
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62}>
        <path
          d="M5 12.5l4.2 4.2L19 7"
          fill="none"
          stroke={ink}
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={24}
          strokeDashoffset={24 * (1 - clamp01(p))}
        />
      </svg>
    </div>
  )
}

export function Cursor({ x, y, press = 0, opacity = 1 }: { x: number; y: number; press?: number; opacity?: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity, transform: `scale(${1 - press * 0.18})`, transformOrigin: "4px 4px", zIndex: 50 }}>
      <div
        style={{
          position: "absolute",
          left: -22,
          top: -22,
          width: 52,
          height: 52,
          borderRadius: 52,
          background: "rgba(30,30,28,0.12)",
          transform: `scale(${press * 1.4})`,
          opacity: press,
        }}
      />
      <svg width="34" height="40" viewBox="0 0 24 28" style={{ filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.25))" }}>
        <path d="M2 2l18 11.2-8.2 1.6L7.6 23z" fill={C.ink} stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** Press amount for a click at `at`: dips in, springs back. */
export function press(frame: number, at: number) {
  const down = ease(frame, at - 0.08, at, 0, 1)
  const up = sp(frame, at + 0.02, SNAPPY)
  return Math.max(0, down - up)
}

export const NAV = ["Home", "Staffing", "Approvals", "Spend", "Team"]

/** A Mise app window with the real top navigation. */
export function AppWindow({
  active,
  width = 1440,
  height = 860,
  children,
  style,
}: {
  active: string
  width?: number
  height?: number
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 26,
        background: C.card,
        boxShadow: "0 60px 140px -40px rgba(30,30,25,0.42), 0 0 0 1px rgba(0,0,0,0.06)",
        overflow: "hidden",
        position: "relative",
        ...style,
      }}
    >
      <div style={{ height: 68, display: "flex", alignItems: "center", gap: 26, padding: "0 28px", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandMark size={30} />
          <span style={{ fontWeight: 600, fontSize: 19, letterSpacing: -0.4 }}>Mise</span>
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: 18 }}>
          {NAV.map((n) => (
            <div
              key={n}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 500,
                color: n === active ? C.ink : C.muted,
                background: n === active ? C.bg : "transparent",
              }}
            >
              {n}
            </div>
          ))}
        </div>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 38,
            width: 300,
            padding: "0 14px",
            borderRadius: 11,
            background: C.bg,
            color: C.faint,
            fontSize: 14,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" stroke={C.faint} strokeWidth="2.4" fill="none" />
            <path d="M16.5 16.5L21 21" stroke={C.faint} strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          Search or ask Mise
          <span style={{ marginLeft: "auto", fontSize: 12, fontFamily: monoFamily }}>⌘K</span>
        </div>
        <Avatar name="Jordan Ellis" size={36} />
      </div>
      <div style={{ position: "relative", height: height - 68 }}>{children}</div>
    </div>
  )
}

export function Pill({ children, bg = C.bg, color = C.ink2, style }: { children: React.ReactNode; bg?: string; color?: string; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  )
}

export function Eyebrow({ children, color = C.muted, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: 3.2, textTransform: "uppercase", color, ...style }}>{children}</div>
  )
}
