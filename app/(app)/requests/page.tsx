import type { Metadata } from "next"
import { Suspense } from "react"

import { RequestsPage } from "@/components/requests/requests-page"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = { title: "Requests" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-xl" />}>
      <RequestsPage />
    </Suspense>
  )
}
