"use client"

import type * as React from "react"
import {
  ClockAlertIcon,
  ClockArrowUpIcon,
  CoffeeIcon,
  DoorOpenIcon,
  MapPinCheckInsideIcon,
  MousePointerClickIcon,
  PencilLineIcon,
  TimerOffIcon,
  type LucideIcon,
} from "lucide-react"

import { StatusBadge, type Tone } from "@/components/app/status-badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow, usePolicies } from "@/hooks/use-demo"
import { formatClock } from "@/lib/dates"
import { ANOMALY_HINTS, ANOMALY_LABELS } from "@/lib/rules"
import type { AnomalyType, TimeEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

import { autoApproveAt, formatCountdown, formatDuration, isPolicyApproval, type EntryRow } from "./model"

export const ANOMALY_TONE: Record<AnomalyType, Tone> = {
  missing_clockout: "danger",
  short_shift: "danger",
  long_break: "warning",
  late_arrival: "warning",
  early_departure: "warning",
  over_schedule: "warning",
}

export const ANOMALY_ICON: Record<AnomalyType, LucideIcon> = {
  missing_clockout: TimerOffIcon,
  short_shift: MousePointerClickIcon,
  long_break: CoffeeIcon,
  late_arrival: ClockAlertIcon,
  early_departure: DoorOpenIcon,
  over_schedule: ClockArrowUpIcon,
}

export function AnomalyBadges({
  anomalies,
  className,
  empty = null,
}: {
  anomalies: AnomalyType[]
  className?: string
  empty?: React.ReactNode
}) {
  if (anomalies.length === 0) return <>{empty}</>
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {anomalies.map((a) => {
        const Icon = ANOMALY_ICON[a]
        return (
          <Tooltip key={a}>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex rounded-4xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                <StatusBadge tone={ANOMALY_TONE[a]} dot={false}>
                  <Icon aria-hidden />
                  {ANOMALY_LABELS[a]}
                </StatusBadge>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-pretty">{ANOMALY_HINTS[a]}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

export function ClockedTimes({ entry, className }: { entry: TimeEntry; className?: string }) {
  const nextDay = !!entry.clockOut && entry.clockOut.slice(0, 10) > entry.clockIn.slice(0, 10)
  return (
    <span className={cn("whitespace-nowrap tabular", className)}>
      {formatClock(entry.clockIn)}
      <span className="px-1 text-muted-foreground" aria-hidden>
        →
      </span>
      <span className="sr-only">to</span>
      {entry.clockOut ? (
        <>
          {formatClock(entry.clockOut)}
          {nextDay ? (
            <sup className="ml-0.5 text-[10px] text-muted-foreground" title="Next day">
              +1
            </sup>
          ) : null}
        </>
      ) : (
        <span className="text-destructive">–</span>
      )}
    </span>
  )
}

interface Chip {
  key: string
  tone: Tone
  label: string
}

export function varianceChips(row: EntryRow): Chip[] {
  const chips: Chip[] = []
  if (row.backfill) chips.push({ key: "backfill", tone: "info", label: "Backfill" })
  else if (row.lateMinutes >= 5) {
    chips.push({ key: "late", tone: row.lateMinutes > 15 ? "warning" : "muted", label: `+${formatDuration(row.lateMinutes)} late` })
  }
  if (!row.entry.clockOut) chips.push({ key: "missing", tone: "danger", label: "No clock-out" })
  else if (row.earlyMinutes >= 15) {
    chips.push({ key: "early", tone: row.earlyMinutes >= 60 ? "danger" : "warning", label: `left ${formatDuration(row.earlyMinutes)} early` })
  } else if (row.overMinutes >= 15) {
    chips.push({ key: "over", tone: row.overMinutes > 60 ? "warning" : "muted", label: `+${formatDuration(row.overMinutes)} over` })
  }
  return chips
}

export function VarianceChips({ row, className }: { row: EntryRow; className?: string }) {
  const chips = varianceChips(row)
  if (chips.length === 0) return null
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {chips.map((c) => (
        <StatusBadge key={c.key} tone={c.tone} dot={false} className="h-4.5 px-1.5 text-[11px]">
          {c.label}
        </StatusBadge>
      ))}
    </div>
  )
}

export function EntryStatusNote({ entry, className }: { entry: TimeEntry; className?: string }) {
  const now = useNow()
  const policies = usePolicies()
  let note: React.ReactNode = null
  if (entry.status === "Pending") {
    const due = autoApproveAt(entry, policies)
    note = due ? `Auto-approves ${formatCountdown(due, now)}` : "Needs a decision"
  } else if (entry.status === "Disputed") {
    note = entry.dispute?.response ? "Supplier replied" : "Awaiting supplier"
  } else if (entry.status === "Auto-approved") {
    note = `After ${policies.timesheetAutoApproveHours}h, by policy`
  } else if (entry.status === "Approved") {
    note = isPolicyApproval(entry.approvedBy) ? "By policy" : entry.approvedBy ? `by ${entry.approvedBy}` : null
  } else if (entry.status === "Invoiced") {
    note = entry.invoiceId ? <span className="font-mono">{entry.invoiceId}</span> : null
  }
  if (!note) return null
  return <span className={cn("block truncate text-[11px] text-muted-foreground", className)}>{note}</span>
}

export function SourceIndicator({ source, className }: { source: TimeEntry["source"]; className?: string }) {
  if (source === "Manual") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <PencilLineIcon className="size-3.5" aria-hidden />
        Entered manually
      </span>
    )
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium text-success", className)}>
      <MapPinCheckInsideIcon className="size-3.5" aria-hidden />
      Verified on site
    </span>
  )
}
