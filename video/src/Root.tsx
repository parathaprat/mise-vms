import React from "react"
import { Composition } from "remotion"
import { Launch } from "./Launch"
import { FPS, H, TL, W } from "./lib"

export function Root() {
  return <Composition id="Launch" component={Launch} durationInFrames={Math.round(TL.duration * FPS)} fps={FPS} width={W} height={H} />
}
