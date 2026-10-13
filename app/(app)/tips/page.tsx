import type { Metadata } from "next"
import { Suspense } from "react"

import { TipsPage } from "@/components/tips/tips-page"
import { TipsSkeleton } from "@/components/tips/tips-skeleton"

export const metadata: Metadata = { title: "Tips" }

export default function Page() {
  return (
    <Suspense fallback={<TipsSkeleton />}>
      <TipsPage />
    </Suspense>
  )
}
