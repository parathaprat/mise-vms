import type { Metadata } from "next"
import { Suspense } from "react"

import { InvoicesView } from "@/components/invoices/invoices-view"

export const metadata: Metadata = { title: "Invoices" }

export default function Page() {
  return (
    <Suspense fallback={null}>
      <InvoicesView />
    </Suspense>
  )
}
