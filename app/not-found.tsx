import Link from "next/link"
import { CompassIcon } from "lucide-react"

import { BrandMark } from "@/components/app/brand"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-sidebar p-6 text-center">
      <BrandMark className="size-10" />
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight">This page isn&apos;t on the schedule</h1>
        <p className="text-sm text-muted-foreground">The link may be from an old demo session, or the record no longer exists.</p>
      </div>
      <Button asChild>
        <Link href="/">
          <CompassIcon data-icon="inline-start" />
          Back to home
        </Link>
      </Button>
    </div>
  )
}
