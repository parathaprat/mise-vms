import type { Metadata } from "next"
import { Suspense } from "react"

import { RequestComposer } from "@/components/requests/composer"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = { title: "New request" }

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-xl" />}>
      <RequestComposer />
    </Suspense>
  )
}
