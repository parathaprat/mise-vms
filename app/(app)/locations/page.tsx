import { Suspense } from "react"
import type { Metadata } from "next"

import { LocationsPage } from "@/components/program/locations/locations-page"

export const metadata: Metadata = { title: "Locations" }

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LocationsPage />
    </Suspense>
  )
}
