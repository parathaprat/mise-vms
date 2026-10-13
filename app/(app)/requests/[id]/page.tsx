import type { Metadata } from "next"
import { Suspense } from "react"

import { RequestDetail } from "@/components/requests/request-detail"
import { Skeleton } from "@/components/ui/skeleton"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return { title: id }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-xl" />}>
      <RequestDetail id={decodeURIComponent(id)} />
    </Suspense>
  )
}
