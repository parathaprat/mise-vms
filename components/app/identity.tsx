import Link from "next/link"
import type * as React from "react"
import { StarIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { initials, workerName } from "@/lib/format"
import type { Supplier, Venue, Worker } from "@/lib/types"
import { cn } from "@/lib/utils"

type HueStyle = React.CSSProperties & { "--hue": number }

export function hueStyle(hue: number): HueStyle {
  return { "--hue": hue }
}

interface WorkerAvatarProps {
  worker?: Pick<Worker, "firstName" | "lastName" | "preferredName" | "hue">
  size?: "sm" | "default" | "lg"
  className?: string
}

export function WorkerAvatar({ worker, size = "default", className }: WorkerAvatarProps) {
  const name = workerName(worker)
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback className="bg-transparent p-0">
        <span className="hue-chip flex size-full items-center justify-center rounded-full font-medium" style={hueStyle(worker?.hue ?? 260)}>
          {worker ? initials(name) : "?"}
        </span>
      </AvatarFallback>
    </Avatar>
  )
}

interface WorkerCellProps {
  worker?: Worker
  subtitle?: React.ReactNode
  href?: string
  size?: "sm" | "default" | "lg"
  className?: string
  favorite?: boolean
}

export function WorkerCell({ worker, subtitle, href, size = "default", className, favorite }: WorkerCellProps) {
  const name = worker ? workerName(worker) : "Unassigned"
  const content = (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <WorkerAvatar worker={worker} size={size} />
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1 truncate text-sm font-medium">
          <span className="truncate">{name}</span>
          {favorite ? <StarIcon className="size-3 shrink-0 fill-warning text-warning" aria-label="Favorite" /> : null}
        </span>
        {subtitle ? <span className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
      </div>
    </div>
  )
  if (href && worker) {
    return (
      <Link href={href} className="min-w-0 rounded-md outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50">
        {content}
      </Link>
    )
  }
  return content
}

interface MarkProps {
  label: string
  hue: number
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
}

const MARK_SIZE = {
  xs: "size-5 rounded-[5px] text-[9px]",
  sm: "size-6 rounded-md text-[10px]",
  md: "size-8 rounded-lg text-xs",
  lg: "size-10 rounded-xl text-sm",
}

export function Mark({ label, hue, size = "md", className }: MarkProps) {
  return (
    <span
      aria-hidden
      className={cn("hue-chip inline-flex shrink-0 items-center justify-center font-semibold tracking-tight", MARK_SIZE[size], className)}
      style={hueStyle(hue)}
    >
      {initials(label)}
    </span>
  )
}

export function VenueMark({ venue, size = "md", className }: { venue?: Venue; size?: MarkProps["size"]; className?: string }) {
  return <Mark label={venue?.name ?? "?"} hue={venue?.hue ?? 260} size={size} className={className} />
}

export function SupplierMark({ supplier, size = "sm", className }: { supplier?: Supplier; size?: MarkProps["size"]; className?: string }) {
  return <Mark label={supplier?.name ?? "?"} hue={supplier?.hue ?? 200} size={size} className={className} />
}

export function VenueCell({ venue, subtitle, className }: { venue?: Venue; subtitle?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <VenueMark venue={venue} size="sm" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{venue?.name ?? "Unknown venue"}</span>
        {subtitle ? <span className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
      </div>
    </div>
  )
}

export function SupplierCell({ supplier, subtitle, className }: { supplier?: Supplier; subtitle?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <SupplierMark supplier={supplier} size="xs" />
      <span className="truncate text-sm">{supplier?.shortName ?? "–"}</span>
      {subtitle ? <span className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
    </div>
  )
}
