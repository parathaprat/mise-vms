import type * as React from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  ChangeStatus,
  InvoiceStatus,
  RequestStatus,
  ShiftStatus,
  TimeEntryStatus,
  TipBatchStatus,
} from "@/lib/types"

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "muted"

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-background text-foreground",
  muted: "bg-muted text-muted-foreground",
  primary: "bg-brand/45 text-brand-foreground dark:bg-brand/15 dark:text-brand",
  success: "bg-success/12 text-success dark:bg-success/18",
  warning: "bg-warning/18 text-warning-foreground dark:bg-warning/20 dark:text-warning",
  danger: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  info: "bg-info/12 text-info dark:bg-info/18",
}

const DOT_CLASS: Record<Tone, string> = {
  neutral: "bg-foreground/40",
  muted: "bg-muted-foreground/60",
  primary: "bg-brand-foreground dark:bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
}

interface StatusBadgeProps {
  tone?: Tone
  dot?: boolean
  pulse?: boolean
  className?: string
  children: React.ReactNode
}

export function StatusBadge({ tone = "neutral", dot = true, pulse = false, className, children }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 border-transparent font-medium", TONE_CLASS[tone], className)}>
      {dot ? (
        <span className="relative flex size-1.5">
          {pulse ? <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", DOT_CLASS[tone])} /> : null}
          <span className={cn("relative inline-flex size-1.5 rounded-full", DOT_CLASS[tone])} />
        </span>
      ) : null}
      {children}
    </Badge>
  )
}

export const REQUEST_TONE: Record<RequestStatus, Tone> = {
  Draft: "muted",
  "Pending approval": "warning",
  Open: "primary",
  Filled: "success",
  "In progress": "info",
  Completed: "neutral",
  Cancelled: "danger",
}

export const SHIFT_TONE: Record<ShiftStatus, Tone> = {
  Open: "warning",
  Confirmed: "primary",
  "Checked in": "success",
  Completed: "neutral",
  "No-show": "danger",
  Cancelled: "muted",
}

export const ENTRY_TONE: Record<TimeEntryStatus, Tone> = {
  Pending: "warning",
  Approved: "success",
  "Auto-approved": "success",
  Disputed: "danger",
  Invoiced: "info",
}

export const INVOICE_TONE: Record<InvoiceStatus, Tone> = {
  Accruing: "muted",
  "Pending approval": "warning",
  Approved: "primary",
  Paid: "success",
  Disputed: "danger",
}

export const TIP_TONE: Record<TipBatchStatus, Tone> = {
  Draft: "muted",
  "Pending approval": "warning",
  Approved: "primary",
  Paid: "success",
  Rejected: "danger",
}

export const CHANGE_TONE: Record<ChangeStatus, Tone> = {
  Pending: "warning",
  Approved: "success",
  "Auto-approved": "success",
  Declined: "danger",
}

export function RequestStatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <StatusBadge tone={REQUEST_TONE[status]} pulse={status === "In progress"} className={className}>
      {status}
    </StatusBadge>
  )
}

export function ShiftStatusBadge({ status, className }: { status: ShiftStatus; className?: string }) {
  return (
    <StatusBadge tone={SHIFT_TONE[status]} pulse={status === "Checked in"} className={className}>
      {status}
    </StatusBadge>
  )
}

export function EntryStatusBadge({ status, className }: { status: TimeEntryStatus; className?: string }) {
  return (
    <StatusBadge tone={ENTRY_TONE[status]} className={className}>
      {status}
    </StatusBadge>
  )
}

export function InvoiceStatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  return (
    <StatusBadge tone={INVOICE_TONE[status]} className={className}>
      {status}
    </StatusBadge>
  )
}

export function TipStatusBadge({ status, className }: { status: TipBatchStatus; className?: string }) {
  return (
    <StatusBadge tone={TIP_TONE[status]} className={className}>
      {status}
    </StatusBadge>
  )
}

export function ChangeStatusBadge({ status, className }: { status: ChangeStatus; className?: string }) {
  return (
    <StatusBadge tone={CHANGE_TONE[status]} className={className}>
      {status}
    </StatusBadge>
  )
}
