"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRightIcon, CheckCheckIcon, CheckIcon, FlagIcon, PauseIcon, ShieldCheckIcon } from "lucide-react"

import { CopyId, KeyValue, TimeAgo } from "@/components/app/misc"
import { StatusBadge } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatDate, formatDateTime } from "@/lib/dates"
import { money, num, pct, plural } from "@/lib/format"
import type { InvoiceTotals } from "@/lib/invoice"
import type { Invoice, InvoiceDispute, Payment, TimeEntry, TipBatch } from "@/lib/types"
import { cn } from "@/lib/utils"

import { isAutoApproval, PAYMENT_TONE } from "./invoice-utils"

// Status timeline -------------------------------------------------------------

type StepState = "done" | "current" | "blocked" | "upcoming"

interface Step {
  label: string
  detail: React.ReactNode
  state: StepState
}

function buildSteps(invoice: Invoice, payment: Payment | undefined, payDate: Date): Step[] {
  const openDisputes = invoice.disputes.filter((d) => d.status === "Open").length
  const approved = invoice.status === "Approved" || invoice.status === "Paid"
  const paid = invoice.status === "Paid"
  const steps: Step[] = [{ label: "Issued", detail: `${formatDateTime(invoice.issuedAt)} · weekly run`, state: "done" }]

  if (approved) {
    steps.push({
      label: "Approved",
      detail: invoice.approvedAt ? `${invoice.approvedBy ?? "Approver"} · ${formatDateTime(invoice.approvedAt)}` : (invoice.approvedBy ?? "Approved"),
      state: "done",
    })
  } else if (invoice.status === "Disputed" || openDisputes > 0) {
    steps.push({ label: "Approval on hold", detail: `${plural(openDisputes, "open dispute")} to resolve first`, state: "blocked" })
  } else {
    steps.push({ label: "Approval", detail: "Waiting on venue approval", state: "current" })
  }

  if (paid) {
    steps.push({ label: "Payment released", detail: payment ? `${formatDate(payment.date, "EEE, MMM d")} · ${payment.method}` : "Released", state: "done" })
    steps.push({
      label: "Paid",
      detail: (
        <span className="flex flex-col gap-0.5">
          <span>{formatDateTime(invoice.paidAt)}</span>
          {payment ? (
            <span className="font-mono text-[11px]">
              {payment.id} · {payment.reference}
            </span>
          ) : null}
        </span>
      ),
      state: "done",
    })
  } else if (approved && payment) {
    const inFlight = payment.status === "Processing"
    steps.push({
      label: "Payment scheduled",
      detail: `${formatDate(payment.date, "EEE, MMM d")} · ${payment.method} · ${payment.id}`,
      state: inFlight ? "done" : "current",
    })
    steps.push({ label: "Paid", detail: inFlight ? `${payment.method} in flight · auto-matches on receipt` : "Auto-matches on receipt", state: inFlight ? "current" : "upcoming" })
  } else {
    steps.push({ label: "Payment scheduled", detail: `Next Friday run after approval · ${formatDate(payDate, "MMM d")}`, state: "upcoming" })
    steps.push({ label: "Paid", detail: "Auto-matches on receipt", state: "upcoming" })
  }
  return steps
}

const DOT_CLASS: Record<StepState, string> = {
  done: "bg-success text-success-foreground",
  current: "bg-primary/15 text-primary ring-2 ring-primary/40",
  blocked: "bg-destructive/10 text-destructive ring-2 ring-destructive/30",
  upcoming: "bg-muted text-muted-foreground",
}

export function StatusTimelineCard({ invoice, payment, payDate }: { invoice: Invoice; payment?: Payment; payDate: Date }) {
  const steps = buildSteps(invoice, payment, payDate)
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col">
          {steps.map((step, i) => {
            const last = i === steps.length - 1
            return (
              <li key={step.label} className="relative flex gap-3 pb-4 last:pb-0">
                {!last ? (
                  <span
                    aria-hidden
                    className={cn("absolute top-6 bottom-0 left-[11px] w-px", step.state === "done" ? "bg-success/40" : "bg-border")}
                  />
                ) : null}
                <span className={cn("relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full", DOT_CLASS[step.state])}>
                  {step.state === "done" ? (
                    <CheckIcon className="size-3.5" aria-hidden />
                  ) : step.state === "blocked" ? (
                    <PauseIcon className="size-3" aria-hidden />
                  ) : (
                    <span className={cn("size-1.5 rounded-full", step.state === "current" ? "bg-primary" : "bg-muted-foreground/40")} />
                  )}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                  <span className={cn("text-sm font-medium", step.state === "upcoming" && "text-muted-foreground", step.state === "blocked" && "text-destructive")}>
                    {step.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{step.detail}</span>
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

// Payment ---------------------------------------------------------------------

export function PaymentCard({
  invoice,
  payment,
  totals,
  payDate,
}: {
  invoice: Invoice
  payment?: Payment
  totals: InvoiceTotals
  payDate: Date
}) {
  const settled = payment?.status === "Settled"
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Payment</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-heading text-xl font-semibold tracking-tight tabular">{money(totals.netToSupplier, true)}</span>
          {payment ? (
            <StatusBadge tone={PAYMENT_TONE[payment.status]} pulse={payment.status === "Processing"}>
              {payment.status}
            </StatusBadge>
          ) : null}
        </div>
        {payment ? (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <KeyValue label="Payment">
                <CopyId value={payment.id} />
              </KeyValue>
              <KeyValue label={settled ? "Settled" : "Pay date"}>{formatDate(payment.date, "EEE, MMM d")}</KeyValue>
              <KeyValue label="Method">{payment.method}</KeyValue>
              <KeyValue label="Reference">
                <span className="font-mono text-xs">{payment.reference}</span>
              </KeyValue>
            </dl>
            <div className="flex items-start gap-2 rounded-lg bg-success/12 px-3 py-2 text-xs dark:bg-success/18">
              <CheckCheckIcon className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
              <span>
                <span className="font-medium text-success">{settled ? "Auto-matched · 100%" : "Pre-matched · 100%"}</span>
                <span className="text-foreground/80">, the remittance line references {invoice.id} directly.</span>
              </span>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/invoices?tab=payments&payment=${payment.id}`}>
                View remittance
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {invoice.status === "Disputed"
              ? "Payment is on hold until every open dispute is resolved."
              : invoice.status === "Pending approval"
                ? `Once approved, payment is scheduled for ${formatDate(payDate, "EEEE, MMM d")} via ACH.`
                : "No payment recorded yet."}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// Disputes --------------------------------------------------------------------

export function DisputesCard({
  invoice,
  canResolve,
  onResolve,
}: {
  invoice: Invoice
  canResolve: boolean
  onResolve: (dispute: InvoiceDispute) => void
}) {
  const disputes = React.useMemo(
    () => [...invoice.disputes].sort((a, b) => Number(b.status === "Open") - Number(a.status === "Open") || b.at.localeCompare(a.at)),
    [invoice.disputes]
  )
  const open = disputes.filter((d) => d.status === "Open").length
  const lineById = React.useMemo(() => new Map(invoice.lines.map((l) => [l.id, l])), [invoice.lines])

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Disputes
          {open > 0 ? <StatusBadge tone="danger">{num(open)} open</StatusBadge> : null}
        </CardTitle>
      </CardHeader>
      {disputes.length > 0 ? (
        <CardContent>
          <ul className="flex flex-col divide-y">
            {disputes.map((d) => {
              const line = lineById.get(d.lineId)
              return (
                <li key={d.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <FlagIcon className={cn("size-3.5 shrink-0", d.status === "Open" ? "text-destructive" : "text-muted-foreground")} aria-hidden />
                      {d.reason}
                    </span>
                    <StatusBadge tone={d.status === "Open" ? "danger" : "muted"}>{d.status}</StatusBadge>
                  </div>
                  {line ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {line.description} · {money(line.amount, true)}
                    </span>
                  ) : null}
                  {d.note ? <p className="text-sm text-pretty">“{d.note}”</p> : null}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {d.by} · <TimeAgo value={d.at} />
                    </span>
                    {canResolve && d.status === "Open" ? (
                      <Button size="xs" variant="outline" onClick={() => onResolve(d)} data-print="hide">
                        Resolve
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  )
}

// Traceability ----------------------------------------------------------------

export function TraceabilityCard({
  invoice,
  entryMap,
  tipMap,
  workerSupplier,
}: {
  invoice: Invoice
  entryMap: Map<string, TimeEntry>
  tipMap: Map<string, TipBatch>
  workerSupplier: (workerId: string) => string | undefined
}) {
  const stats = React.useMemo(() => {
    const timesheets = new Set<string>()
    const pros = new Set<string>()
    const approvals = new Set<string>()
    let autoApproved = 0
    let traceable = 0
    let traced = 0
    for (const line of invoice.lines) {
      if (line.kind === "labor" || line.kind === "overtime") {
        traceable++
        let ok = line.timeEntryIds.length > 0
        for (const id of line.timeEntryIds) {
          const e = entryMap.get(id)
          if (!e || !e.approvedAt) {
            ok = false
            continue
          }
          if (!timesheets.has(id)) {
            timesheets.add(id)
            if (isAutoApproval(e.approvedBy)) autoApproved++
          }
          pros.add(e.workerId)
          approvals.add(`${e.approvedBy ?? ""}|${e.approvedAt}`)
        }
        if (ok) traced++
      } else if (line.kind === "tips") {
        traceable++
        const batch = line.tipBatchId ? tipMap.get(line.tipBatchId) : undefined
        if (batch?.approvedAt) {
          traced++
          approvals.add(`${batch.approvedBy ?? ""}|${batch.approvedAt}|${batch.id}`)
          for (const l of batch.lines) if (workerSupplier(l.workerId) === invoice.supplierId) pros.add(l.workerId)
        }
      }
    }
    return {
      timesheets: timesheets.size,
      pros: pros.size,
      approvals: approvals.size,
      autoApproved,
      tracedShare: traceable > 0 ? traced / traceable : 1,
    }
  }, [invoice.lines, invoice.supplierId, entryMap, tipMap, workerSupplier])

  const fullyTraced = stats.tracedShare >= 1
  const autoCopy =
    stats.timesheets === 0
      ? null
      : stats.autoApproved === 0
        ? "Every timesheet was approved by a venue manager."
        : stats.autoApproved === stats.timesheets
          ? "Every timesheet cleared the 72-hour auto-approve policy."
          : `${pct(stats.autoApproved / stats.timesheets)} of timesheets cleared the 72-hour auto-approve policy; venue managers approved the rest.`

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon className={cn("size-4", fullyTraced ? "text-success" : "text-warning")} aria-hidden />
          Traceability
        </CardTitle>
        <CardAction>
          <StatusBadge tone={fullyTraced ? "success" : "warning"}>{pct(stats.tracedShare)} traced</StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium tabular">
          {plural(stats.timesheets, "timesheet")} · {plural(stats.pros, "Pro")} · {plural(stats.approvals, "approval")} ·{" "}
          {pct(stats.tracedShare)} traced
        </p>
        <Progress value={Math.round(stats.tracedShare * 100)} aria-label="Lines traced to source records" />
        {autoCopy ? <p className="text-xs text-muted-foreground">{autoCopy}</p> : null}
        <p className="text-xs text-muted-foreground">
          No fuzzy matching: every line carries its timesheet or tip-batch IDs, and every payment carries invoice IDs.
        </p>
      </CardContent>
    </Card>
  )
}
