"use client"

import * as React from "react"
import Link from "next/link"
import {
  BotIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  FlagIcon,
  HandCoinsIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  SquareArrowOutUpRightIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { WorkerCell } from "@/components/app/identity"
import { StatusBadge } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatClock, formatDate, formatDateTime } from "@/lib/dates"
import { hours, plural, rate } from "@/lib/format"
import { ANOMALY_LABELS } from "@/lib/rules"
import type { Lookups } from "@/lib/selectors"
import type { InvoiceDispute, InvoiceLine, TimeEntry, TipBatch } from "@/lib/types"
import { cn } from "@/lib/utils"

import { isAutoApproval, signedMoney } from "./invoice-utils"

/** Shared column template for the line header and every line row. */
export const LINE_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto_28px] items-start gap-x-3 sm:grid-cols-[minmax(0,1fr)_64px_72px_88px_104px_28px]"

export interface LineActions {
  /** Venue and program personas can raise disputes. */
  canDispute: boolean
  /** Why disputing is unavailable right now (e.g. locked after approval). */
  disputeLockedReason?: string
  onDispute: (line: InvoiceLine) => void
}

interface InvoiceLineRowProps {
  line: InvoiceLine
  entries: TimeEntry[]
  tipBatch?: TipBatch
  dispute?: InvoiceDispute
  lookups: Lookups
  actions: LineActions
}

function qtyLabel(line: InvoiceLine): string {
  if (line.kind === "tips") return plural(line.quantity, "Pro")
  if (line.kind === "credit") return "–"
  return hours(line.quantity)
}

function rateLabel(line: InvoiceLine): string {
  if (line.kind === "tips") return "Pass-through"
  if (line.kind === "credit") return "–"
  return rate(line.rate)
}

export function InvoiceLineRow({ line, entries, tipBatch, dispute, lookups, actions }: InvoiceLineRowProps) {
  const [open, setOpen] = React.useState(false)
  const isTime = line.kind === "labor" || line.kind === "overtime"
  const expandable = isTime && entries.length > 0
  const isCredit = line.kind === "credit"
  const dateLabel = line.date ? formatDate(line.date, "MMM d") : "–"

  const description = (
    <span className="flex min-w-0 flex-col gap-1">
      <span className={cn("text-sm font-medium text-pretty", isCredit && "text-success")}>{line.description}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {line.kind === "overtime" ? (
          <StatusBadge tone="warning" dot={false} className="h-4 px-1.5 text-[10px]">
            Overtime
          </StatusBadge>
        ) : null}
        {isTime ? <span>{plural(line.timeEntryIds.length, "timesheet")}</span> : null}
        {isTime && line.requestId ? <span className="font-mono">{line.requestId}</span> : null}
        {line.kind === "tips" && line.tipBatchId ? (
          <Link href={`/tips?batch=${line.tipBatchId}`} className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
            <HandCoinsIcon className="size-3" aria-hidden />
            {line.tipBatchId}
          </Link>
        ) : null}
        {line.kind === "tips" ? <span>{tipBatch?.eventName ? `${tipBatch.eventName} · ` : ""}no program fee</span> : null}
        {isCredit ? <span>Credit memo · dispute resolution</span> : null}
        {dispute ? (
          <StatusBadge tone={dispute.status === "Open" ? "danger" : "muted"} className="h-4 px-1.5 text-[10px]">
            {dispute.status === "Open" ? "Disputed" : "Dispute resolved"}
          </StatusBadge>
        ) : null}
        <span className="tabular sm:hidden">
          {dateLabel} · {qtyLabel(line)}
          {isTime ? ` × ${rateLabel(line)}` : ""}
        </span>
      </span>
    </span>
  )

  return (
    <Collapsible open={expandable && open} onOpenChange={setOpen} disabled={!expandable}>
      <div className={cn(LINE_GRID, "px-6 py-3 transition-colors", expandable && "hover:bg-muted/30")}>
        {expandable ? (
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="group/line -my-1 -ml-1 flex min-w-0 items-start gap-2 rounded-md py-1 pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              aria-label={`${open ? "Hide" : "Show"} ${plural(entries.length, "timesheet")} for ${line.description}`}
            >
              <ChevronRightIcon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/line:rotate-90 print:hidden"
                aria-hidden
              />
              {description}
            </button>
          </CollapsibleTrigger>
        ) : (
          <div className="flex min-w-0 items-start gap-2">
            <span className="size-4 shrink-0 print:hidden" aria-hidden />
            {description}
          </div>
        )}
        <span className="hidden text-sm text-muted-foreground tabular sm:block">{dateLabel}</span>
        <span className="hidden text-right text-sm tabular sm:block">{qtyLabel(line)}</span>
        <span className="hidden text-right text-sm text-muted-foreground tabular sm:block">{rateLabel(line)}</span>
        <span className={cn("text-right text-sm font-medium tabular", isCredit && "text-success")}>{signedMoney(line.amount)}</span>
        <div className="-my-0.5 flex justify-end" data-print="hide">
          <LineMenu line={line} actions={actions} hasOpenDispute={dispute?.status === "Open"} />
        </div>
      </div>
      {expandable ? (
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <TracedEntries line={line} entries={entries} lookups={lookups} />
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
}

function LineMenu({ line, actions, hasOpenDispute }: { line: InvoiceLine; actions: LineActions; hasOpenDispute: boolean }) {
  const showDispute = actions.canDispute && line.kind !== "credit"
  const hasLinks = !!line.requestId || !!line.tipBatchId
  if (!showDispute && !hasLinks) return null
  const lockedReason = hasOpenDispute ? "A dispute is already open on this line" : actions.disputeLockedReason

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${line.description}`}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          {showDispute ? (
            <DropdownMenuItem disabled={!!lockedReason} onSelect={() => actions.onDispute(line)} className="items-start">
              <FlagIcon className="mt-0.5" />
              <span className="flex flex-col">
                <span>Dispute line…</span>
                {lockedReason ? <span className="text-xs text-muted-foreground">{lockedReason}</span> : null}
              </span>
            </DropdownMenuItem>
          ) : null}
          {line.requestId ? (
            <DropdownMenuItem asChild>
              <Link href={`/requests/${line.requestId}`}>
                <SquareArrowOutUpRightIcon />
                View request
              </Link>
            </DropdownMenuItem>
          ) : null}
          {line.requestId && line.timeEntryIds.length > 0 ? (
            <DropdownMenuItem asChild>
              <Link href={`/timesheets?request=${line.requestId}`}>
                <ClipboardListIcon />
                View timesheets
              </Link>
            </DropdownMenuItem>
          ) : null}
          {line.tipBatchId ? (
            <DropdownMenuItem asChild>
              <Link href={`/tips?batch=${line.tipBatchId}`}>
                <HandCoinsIcon />
                View tip batch
              </Link>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TracedEntries({ line, entries, lookups }: { line: InvoiceLine; entries: TimeEntry[]; lookups: Lookups }) {
  const isOvertime = line.kind === "overtime"
  const total = entries.reduce((s, e) => s + (isOvertime ? e.overtimeHours : e.regularHours), 0)
  const ties = Math.abs(total - line.quantity) < 0.01

  return (
    <div className="border-t border-dashed bg-muted/30 px-6 py-3 sm:pl-12">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pr-3 pb-2 font-medium">Pro</th>
              <th className="pr-3 pb-2 font-medium">Clock in → out</th>
              <th className="pr-3 pb-2 font-medium">Break</th>
              <th className="pb-2 text-right font-medium">{isOvertime ? "OT hours" : "Hours"}</th>
              <th className="pb-2 pl-4 font-medium">Approved</th>
            </tr>
          </thead>
          {entries.map((entry) => (
            <TracedEntry key={entry.id} entry={entry} isOvertime={isOvertime} lookups={lookups} />
          ))}
          <tfoot>
            <tr className="border-t">
              <td colSpan={3} className="pt-2 text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  {ties ? <CheckIcon className="size-3 text-success" aria-hidden /> : null}
                  {plural(entries.length, "timesheet")} · {ties ? "ties to line quantity" : `line bills ${hours(line.quantity)}`}
                </span>
              </td>
              <td className="pt-2 text-right font-medium tabular">{hours(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function TracedEntry({ entry, isOvertime, lookups }: { entry: TimeEntry; isOvertime: boolean; lookups: Lookups }) {
  const worker = lookups.workers.get(entry.workerId)
  const auto = isAutoApproval(entry.approvedBy)
  const hasNotes = entry.adjustments.length > 0 || entry.anomalies.length > 0

  return (
    <tbody className="border-t">
      <tr className="align-top">
        <td className="py-2 pr-3">
          <WorkerCell
            worker={worker}
            size="sm"
            href={worker ? `/workforce/${worker.id}` : undefined}
            subtitle={<span className="font-mono">{entry.id}</span>}
          />
        </td>
        <td className="py-2 pr-3 whitespace-nowrap">
          <div className="flex flex-col gap-0.5">
            <span className="tabular">
              {formatClock(entry.clockIn)} → {formatClock(entry.clockOut)}
            </span>
            <span className="text-muted-foreground">
              {formatDate(entry.date, "EEE, MMM d")} · {entry.source}
            </span>
          </div>
        </td>
        <td className="py-2 pr-3 tabular">{entry.breakMinutes > 0 ? `${entry.breakMinutes}m` : "–"}</td>
        <td className="py-2 text-right font-medium tabular">{hours(isOvertime ? entry.overtimeHours : entry.regularHours)}</td>
        <td className="py-2 pl-4">
          {entry.approvedAt ? (
            <div className="flex flex-col gap-0.5">
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                {auto ? (
                  <BotIcon className="size-3 text-muted-foreground" aria-hidden />
                ) : (
                  <CheckIcon className="size-3 text-success" aria-hidden />
                )}
                {auto ? "Auto-approved by policy" : (entry.approvedBy ?? "Approved")}
              </span>
              <span className="text-muted-foreground tabular">{formatDateTime(entry.approvedAt)}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Not approved</span>
          )}
        </td>
      </tr>
      {hasNotes ? (
        <tr>
          <td colSpan={5} className="pb-2">
            <div className="flex flex-col gap-1 rounded-md bg-background/70 px-2.5 py-1.5 ring-1 ring-foreground/5">
              {entry.anomalies.length > 0 ? (
                <span className="flex items-center gap-1.5">
                  <TriangleAlertIcon className="size-3 shrink-0 text-warning" aria-hidden />
                  Flagged at clock-out: {entry.anomalies.map((a) => ANOMALY_LABELS[a]).join(", ")}
                </span>
              ) : null}
              {entry.adjustments.map((a, i) => (
                <span key={`${a.at}-${i}`} className="flex items-start gap-1.5">
                  <PencilLineIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    {a.summary} · {a.reason}
                    {a.note ? `, ${a.note}` : ""}{" "}
                    <span className="text-muted-foreground">
                      ({a.by}, {formatDateTime(a.at)})
                    </span>
                  </span>
                </span>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </tbody>
  )
}
