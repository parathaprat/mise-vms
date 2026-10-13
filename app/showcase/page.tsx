import type { Metadata } from "next"
import { Suspense } from "react"

import { ShowcaseReel } from "@/components/showcase/showcase-reel"

export const metadata: Metadata = {
  title: "Mise product reel",
  description: "A short cinematic tour of Mise.",
}

export default function ShowcasePage() {
  return (
    <Suspense fallback={null}>
      <ShowcaseReel />
    </Suspense>
  )
}
