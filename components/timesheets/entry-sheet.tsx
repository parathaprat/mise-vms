"use client"

import Link from "next/link"
import type * as React from "react"
import {
  ArrowLeftRightIcon,
  CheckCircle2Icon,
  CheckIcon,
  FlagIcon,
  HourglassIcon,
  MessageSquareReplyIcon,
  PencilIcon,
  ReceiptTextIcon,
  SparklesIcon,
} from "lucide-react"

import { WorkerAvatar } from "@/components/app/identity"
import { CopyId, KeyValue, TimeAgo } from "@/components/app/misc"
import { EntryStatusBadge, StatusBadge } from "@/components/app/status-badge"
import { useUi } from "@/components/shell/ui-store"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useNow, usePolicies } from "@/hooks/use-demo"
import { formatClock, formatDate, formatDateTime, formatTime, formatTimeRange, minutesBetween } from "@/lib/dates"
import { hours, money, rate, workerLegalName, workerName } from "@/lib/format"
import { ANOMALY_HINTS, ANOMALY_LABELS } from "@/lib/rules"
import type { AnomalyType, PersonaId } from "@/lib/types"
import { cn } from "@/lib/utils"

import { ANOMALY_ICON, ANOMALY_TONE, SourceIndicator } from "./entry-parts"
import {
  autoApproveAt,
  entryCapabilities,
  formatCountdown,
  formatDuration,
  hasAnyAction,
  isPolicyApproval,
  type EntryAction,
  type EntryRow,
} from "./model"
import { ShiftTimeline } from "./shift-timeline"

interface EntrySheetProps {
  row: EntryRow | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  persona: PersonaId
  onAction: (action: EntryAction, row: EntryRow) => void
}

export function EntrySheet({ row, open, onOpenChange, persona, onAction }: EntrySheetProps) {
  return (
    <Sheet open={open && !!row} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {row ? <EntryDetail row={row} persona={persona} onAction={onAction} onClose={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}

const TONE_RING: Record<string, string> = {
  danger: "border-destructive/30 bg-destructive/5 text-destructive",
  warning: "border-warning/40 bg-warning/8 text-warning-foreground dark:text-warning",
}

function anomalyDetail(a: AnomalyType, row: EntryRow): string | null {
  const { entry, request } = row
  const worked = entry.clockOut ? minutesBetween(entry.clockIn, entry.clockOut) : 0
  switch (a) {
    case "missing_clockout":
      return `Clocked in at ${formatClock(entry.clockIn)}; no clock-out was recorded.`
    case "short_shift":
      return `Only ${formatDuration(worked)} on the clock.`
    case "long_break":
      return `A ${formatDuration(entry.breakMinutes)} break against ${formatDuration(worked)} on the clock.`
    case "late_arrival":
      return request ? `Clocked in ${formatDuration(row.lateMinutes)} after the ${formatTime(request.startTime)} start.` : null
    case "early_departure":
      return request ? `Clocked out ${formatDuration(row.earlyMinutes)} before the ${formatTime(request.endTime)} end.` : null
    case "over_schedule":
      return request ? `Clocked out ${formatDuration(row.overMinutes)} after the ${formatTime(request.endTime)} end.` : null
  }
}

function copilotPrompt(row: EntryRow, name: string): string {
  const { entry } = row
  if (entry.status === "Disputed") return `Summarize the dispute on timesheet ${entry.id} for ${name} and suggest how to resolve it.`
  if (entry.anomalies.length) return `Explain the flags on timesheet ${entry.id} for ${name} and what I should do before approving.`
  return `Summarize timesheet ${entry.id} for ${name}.`
}

function EntryDetail({
  row,
  persona,
  onAction,
  onClose,
}: {
  row: EntryRow
  persona: PersonaId
  onAction: EntrySheetProps["onAction"]
  onClose: () => void
}) {
  const now = useNow()
  const policies = usePolicies()
  const askCopilot = useUi((s) => s.askCopilot)
  const { entry, worker, supplier, request, venue, position } = row
  const name = worker ? workerName(worker) : "Unknown Pro"
  const legal = worker ? workerLegalName(worker) : null
  const caps = entryCapabilities(entry, persona)
  const due = autoApproveAt(entry, policies)
  const adjustments = [...entry.adjustments].reverse()

  return (
    <>
      <SheetHeader className="gap-3 border-b pr-12">
        <div className="flex items-start gap-3">
          <WorkerAvatar worker={worker} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <SheetTitle className="truncate text-lg">{name}</SheetTitle>
            <SheetDescription className="truncate">
              {legal && legal !== name ? `Legal name ${legal} · ` : ""}
              {supplier?.name ?? "Unknown supplier"}
              {worker ? ` · ★ ${worker.rating.toFixed(1)} · ${worker.lifetimeShifts} shifts` : ""}
            </SheetDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EntryStatusBadge status={entry.status} />
          {entry.status === "Pending" ? (
            <StatusBadge tone={due ? "muted" : "warning"} dot={false}>
              <HourglassIcon aria-hidden />
              {due ? `Auto-approves ${formatCountdown(due, now)}` : "Waits for your decision"}
            </StatusBadge>
          ) : null}
          <CopyId value={entry.id} className="ml-auto" />
        </div>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        <Section title="Shift">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <KeyValue label="Position">{position?.title ?? "–"}</KeyValue>
            <KeyValue label="Event">{request?.eventName ?? request?.reason ?? "–"}</KeyValue>
            <KeyValue label="Venue">{venue?.name ?? "–"}</KeyValue>
            <KeyValue label="Date">{formatDate(entry.date, "EEEE, MMM d")}</KeyValue>
            <KeyValue label="Scheduled">
              {request ? (
                <span className="tabular">
                  {formatTimeRange(request.startTime, request.endTime)}
                  {request.breakMinutes ? <span className="font-normal text-muted-foreground"> · {request.breakMinutes}m break</span> : null}
                </span>
              ) : (
                "–"
              )}
            </KeyValue>
            <KeyValue label="Request">
              <Link href={`/requests/${entry.requestId}`} className="font-mono text-sm text-primary underline-offset-4 hover:underline">
                {entry.requestId}
              </Link>
            </KeyValue>
          </dl>
        </Section>

        <Separator />

        <Section title="Scheduled vs. clocked">
          <ShiftTimeline row={row} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <KeyValue label="Clock in">
              <span className="tabular">{formatClock(entry.clockIn)}</span>
            </KeyValue>
            <KeyValue label="Clock out">
              <span className={cn("tabular", !entry.clockOut && "text-destructive")}>{entry.clockOut ? formatClock(entry.clockOut) : "Missing"}</span>
            </KeyValue>
            <KeyValue label="Break">
              <span className="tabular">{entry.breakMinutes ? formatDuration(entry.breakMinutes) : "None"}</span>
            </KeyValue>
            <KeyValue label="Payable">
              <span className="tabular">{hours(row.hours)}</span>
              {entry.overtimeHours > 0 ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground tabular">incl. {hours(entry.overtimeHours)} OT</span>
              ) : null}
            </KeyValue>
          </dl>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Billed at <span className="text-foreground tabular">{rate(entry.billRate)}</span>
              {entry.overtimeHours > 0 ? ` · OT at ${policies.overtimeMultiplier}×` : ""}
            </span>
            <span className="font-heading text-base font-semibold tabular">{money(entry.amount, true)}</span>
          </div>
        </Section>

        <Separator />

        <Section title={entry.anomalies.length ? `Exceptions (${entry.anomalies.length})` : "Exceptions"}>
          {entry.anomalies.length ? (
            <ul className="flex flex-col gap-2">
              {entry.anomalies.map((a) => {
                const Icon = ANOMALY_ICON[a]
                const detail = anomalyDetail(a, row)
                return (
                  <li key={a} className={cn("flex gap-3 rounded-lg border p-3", TONE_RING[ANOMALY_TONE[a]])}>
                    <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium">{ANOMALY_LABELS[a]}</span>
                      {detail ? <span className="text-sm text-foreground/80">{detail}</span> : null}
                      <span className="text-xs text-muted-foreground">{ANOMALY_HINTS[a]}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              {entry.status === "Pending"
                ? `Clean: matches the schedule. It auto-approves ${due ? formatCountdown(due, now) : "soon"} if nobody gets to it first.`
                : "No exceptions on this entry."}
            </p>
          )}
        </Section>

        {entry.dispute ? (
          <>
            <Separator />
            <Section title="Dispute">
              <ol className="flex flex-col gap-2">
                <li className="flex flex-col gap-1.5 rounded-lg border border-destructive/25 bg-destructive/5 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">{entry.dispute.by}</span> · {venue?.shortName ?? "Venue"}
                    </span>
                    <TimeAgo value={entry.dispute.at} />
                  </div>
                  <StatusBadge tone="danger" dot={false} className="w-fit">
                    <FlagIcon aria-hidden />
                    {entry.dispute.reason}
                  </StatusBadge>
                  <p className="text-sm text-pretty">{entry.dispute.note}</p>
                </li>
                {entry.dispute.response ? (
                  <li className="ml-6 flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        <span className="font-medium text-foreground">{entry.dispute.response.by}</span> · {supplier?.shortName ?? "Supplier"}
                      </span>
                      <TimeAgo value={entry.dispute.response.at} />
                    </div>
                    <p className="text-sm text-pretty">{entry.dispute.response.note}</p>
                  </li>
                ) : (
                  <li className="ml-6 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    {persona === "supplier"
                      ? "The venue is waiting on your reply. These hours stay off the invoice until it's resolved."
                      : `Waiting on ${supplier?.shortName ?? "the supplier"}: they were notified when the dispute was opened. These hours stay off the invoice until it's resolved.`}
                  </li>
                )}
              </ol>
            </Section>
          </>
        ) : null}

        {adjustments.length ? (
          <>
            <Separator />
            <Section title="Adjustment history">
              <ol className="flex flex-col gap-3 border-l pl-4">
                {adjustments.map((adj, i) => (
                  <li key={`${adj.at}-${i}`} className="relative flex flex-col gap-0.5">
                    <span className="absolute top-1.5 -left-[calc(1rem+4.5px)] size-2 rounded-full bg-primary ring-2 ring-popover" aria-hidden />
                    <span className="text-sm font-medium">{adj.summary}</span>
                    <span className="text-xs text-muted-foreground">
                      {adj.reason} · {adj.by} · {formatDateTime(adj.at)}
                    </span>
                    {adj.note ? <span className="text-sm text-foreground/80">“{adj.note}”</span> : null}
                  </li>
                ))}
              </ol>
            </Section>
          </>
        ) : null}

        <Separator />

        <Section title="Source & approval">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <KeyValue label="Captured by">
              <span className="flex flex-col gap-0.5">
                <SourceIndicator source={entry.source} />
                <span className="text-xs font-normal text-muted-foreground">
                  {entry.source === "Manual"
                    ? "Typed in by an admin, no geofence check."
                    : `${entry.source === "Kiosk" ? "Venue kiosk" : "Geofenced clock-in"} at ${venue?.shortName ?? "the venue"}`}
                </span>
              </span>
            </KeyValue>
            <KeyValue label="Approval">
              {entry.approvedAt ? (
                <span className="flex flex-col gap-0.5">
                  <span>{isPolicyApproval(entry.approvedBy) ? `Auto-approved after ${policies.timesheetAutoApproveHours}h` : entry.approvedBy}</span>
                  <span className="text-xs font-normal text-muted-foreground">{formatDateTime(entry.approvedAt)}</span>
                </span>
              ) : (
                <span className="font-normal text-muted-foreground">{entry.status === "Disputed" ? "On hold: disputed" : "Not yet approved"}</span>
              )}
            </KeyValue>
            {entry.invoiceId ? (
              <KeyValue label="Invoice">
                <Link href={`/invoices/${entry.invoiceId}`} className="inline-flex items-center gap-1 font-mono text-sm text-primary underline-offset-4 hover:underline">
                  <ReceiptTextIcon className="size-3.5" aria-hidden />
                  {entry.invoiceId}
                </Link>
              </KeyValue>
            ) : null}
          </dl>
        </Section>
      </div>

      <SheetFooter className="mt-0 flex-row flex-wrap items-center gap-2 border-t">
        {caps.approve ? (
          <Button onClick={() => onAction("approve", row)}>
            <CheckIcon data-icon="inline-start" />
            {entry.status === "Disputed" ? "Resolve & approve" : "Approve"}
          </Button>
        ) : null}
        {caps.respond ? (
          <Button onClick={() => onAction("respond", row)}>
            <MessageSquareReplyIcon data-icon="inline-start" />
            {entry.dispute?.response ? "Update response" : "Respond to dispute"}
          </Button>
        ) : null}
        {caps.adjust ? (
          <Button variant="outline" onClick={() => onAction("adjust", row)}>
            <PencilIcon data-icon="inline-start" />
            Adjust hours
          </Button>
        ) : null}
        {caps.reassign ? (
          <Button variant="outline" onClick={() => onAction("reassign", row)}>
            <ArrowLeftRightIcon data-icon="inline-start" />
            Reassign
          </Button>
        ) : null}
        {caps.dispute ? (
          <Button variant="destructive" onClick={() => onAction("dispute", row)}>
            <FlagIcon data-icon="inline-start" />
            Dispute
          </Button>
        ) : null}
        {!hasAnyAction(caps) ? (
          <p className="flex-1 text-xs text-muted-foreground">
            {entry.status === "Invoiced"
              ? `Invoiced on ${entry.invoiceId ?? "a weekly invoice"}: corrections now go through an invoice credit.`
              : persona === "program"
                ? "Read-only for the program team. Venues approve hours and suppliers answer disputes."
                : "Venues approve hours. You're notified the moment anything is disputed."}
          </p>
        ) : null}
        <Button
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            onClose()
            askCopilot(copilotPrompt(row, name))
          }}
        >
          <SparklesIcon data-icon="inline-start" />
          Ask Copilot
        </Button>
      </SheetFooter>
    </>
  )
}
