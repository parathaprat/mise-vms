import type { Metadata } from "next"
import { Suspense } from "react"

import { InsightsView } from "@/components/insights/insights-view"

export const metadata: Metadata = { title: "Insights" }

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InsightsView />
    </Suspense>
  )
}
