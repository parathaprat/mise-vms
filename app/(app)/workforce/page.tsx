import type { Metadata } from "next"
import { Suspense } from "react"

import { WorkforcePage } from "@/components/workforce/workforce-page"
import { WorkforceSkeleton } from "@/components/workforce/workforce-skeleton"

export const metadata: Metadata = { title: "Workforce" }

export default function Page() {
  return (
    <Suspense fallback={<WorkforceSkeleton />}>
      <WorkforcePage />
    </Suspense>
  )
}
