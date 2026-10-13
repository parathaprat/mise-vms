import type { Metadata } from "next"
import { Suspense } from "react"

import { InboxSkeleton } from "@/components/inbox/inbox-skeleton"
import { InboxPage } from "@/components/inbox/inbox-view"

export const metadata: Metadata = { title: "Inbox" }

export default function Page() {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <InboxPage />
    </Suspense>
  )
}
