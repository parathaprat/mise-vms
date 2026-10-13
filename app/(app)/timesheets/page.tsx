import type { Metadata } from "next"
import { Suspense } from "react"

import { TimesheetsSkeleton } from "@/components/timesheets/timesheets-skeleton"
import { TimesheetsPage } from "@/components/timesheets/timesheets-view"

export const metadata: Metadata = { title: "Timesheets" }

export default function Page() {
  return (
    <Suspense fallback={<TimesheetsSkeleton />}>
      <TimesheetsPage />
    </Suspense>
  )
}
