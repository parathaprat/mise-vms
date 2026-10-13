import React from "react"
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion"
import { C, FPS, TL, fontFamily } from "./lib"
import { Intro } from "./scenes/Intro"
import { OldWay } from "./scenes/OldWay"
import { Request } from "./scenes/Request"
import { Schedule } from "./scenes/Schedule"
import { Approvals } from "./scenes/Approvals"
import { Timesheets } from "./scenes/Timesheets"
import { Tips } from "./scenes/Tips"
import { Compare } from "./scenes/Compare"
import { Montage } from "./scenes/Montage"
import { End } from "./scenes/End"

type SceneKey = keyof typeof TL.scenes

const SCENES: { key: SceneKey; C: React.FC<{ frame: number }>; pre?: number; post?: number }[] = [
  { key: "intro", C: Intro, post: 0.05 },
  { key: "oldway", C: OldWay, post: 0.6 },
  { key: "request", C: Request, post: 0.7 },
  { key: "schedule", C: Schedule, pre: 0.7, post: 0.7 },
  { key: "approvals", C: Approvals, pre: 0.7, post: 0.6 },
  { key: "timesheets", C: Timesheets, pre: 0.6, post: 0.6 },
  { key: "tips", C: Tips, pre: 0.6, post: 0.2 },
  { key: "compare", C: Compare, post: 0.5 },
  { key: "montage", C: Montage, pre: 0.3, post: 0.6 },
  { key: "end", C: End, pre: 0.6 },
]

export function Launch() {
  const frame = useCurrentFrame()
  const s = frame / FPS
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily, color: C.ink, WebkitFontSmoothing: "antialiased" }}>
      {SCENES.map(({ key, C: Scene, pre = 0, post = 0 }) => {
        const [a, b] = TL.scenes[key]
        if (s < a - pre || s >= b + post) return null
        return (
          <AbsoluteFill key={key}>
            <Scene frame={frame} />
          </AbsoluteFill>
        )
      })}
      <Audio src={staticFile("score.wav")} />
    </AbsoluteFill>
  )
}
