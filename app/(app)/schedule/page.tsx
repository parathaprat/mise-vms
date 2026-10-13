import type { Metadata } from "next"
import { Suspense } from "react"

import { ScheduleView } from "@/components/schedule/schedule-view"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = { title: "Schedule" }

function ScheduleFallback() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading schedule">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<ScheduleFallback />}>
      <ScheduleView />
    </Suspense>
  )
}
