"use client"

import * as React from "react"
import { InfoIcon } from "lucide-react"

import { SupplierMark } from "@/components/app/identity"
import { KeyValue } from "@/components/app/misc"
import { Card } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDate } from "@/lib/dates"
import { money, plural } from "@/lib/format"
import type { InvoiceTotals } from "@/lib/invoice"
import { PROGRAM_NAME } from "@/lib/reference"
import type { Lookups } from "@/lib/selectors"
import type { CostCenter, Invoice, InvoiceLine, Supplier, TimeEntry, TipBatch, Venue } from "@/lib/types"
import { cn } from "@/lib/utils"

import { InvoiceLineRow, LINE_GRID, type LineActions } from "./invoice-line-row"
import { formatPeriod, signedMoney } from "./invoice-utils"

interface InvoiceDocumentProps {
  invoice: Invoice
  supplier?: Supplier
  venue?: Venue
  totals: InvoiceTotals
  msaFeePct: number
  lookups: Lookups
  entryMap: Map<string, TimeEntry>
  tipMap: Map<string, TipBatch>
  actions: LineActions
}

interface LineGroup {
  costCenterId: string
  costCenter?: CostCenter
  lines: InvoiceLine[]
  subtotal: number
}

function groupLines(invoice: Invoice, lookups: Lookups): LineGroup[] {
  const order = new Map(invoice.lines.map((l, i) => [l.id, i]))
  const groups = new Map<string, LineGroup>()
  for (const line of invoice.lines) {
    const key = line.costCenterId || "unassigned"
    let group = groups.get(key)
    if (!group) {
      group = { costCenterId: key, costCenter: lookups.costCenters.get(line.costCenterId), lines: [], subtotal: 0 }
      groups.set(key, group)
    }
    group.lines.push(line)
    group.subtotal += line.amount
  }
  for (const group of groups.values()) {
    group.lines.sort(
      (a, b) =>
        Number(a.kind === "credit") - Number(b.kind === "credit") ||
        (a.date ?? "").localeCompare(b.date ?? "") ||
        (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    )
  }
  return [...groups.values()].sort((a, b) => (a.costCenter?.code ?? "~").localeCompare(b.costCenter?.code ?? "~"))
}

export function InvoiceDocument({ invoice, supplier, venue, totals, msaFeePct, lookups, entryMap, tipMap, actions }: InvoiceDocumentProps) {
  const groups = React.useMemo(() => groupLines(invoice, lookups), [invoice, lookups])
  const timesheetCount = React.useMemo(() => new Set(invoice.lines.flatMap((l) => l.timeEntryIds)).size, [invoice.lines])
  const tipBatchCount = React.useMemo(() => new Set(invoice.lines.map((l) => l.tipBatchId).filter(Boolean)).size, [invoice.lines])

  const latestDisputeByLine = React.useMemo(() => {
    const map = new Map<string, Invoice["disputes"][number]>()
    for (const d of invoice.disputes) {
      const prev = map.get(d.lineId)
      if (!prev || d.status === "Open" || prev.status !== "Open") map.set(d.lineId, d)
    }
    return map
  }, [invoice.disputes])

  return (
    <Card className="gap-0 py-0 print:shadow-none print:ring-0">
      <div className="flex flex-col gap-6 border-b bg-muted/30 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <SupplierMark supplier={supplier} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">From</span>
            <span className="font-heading text-base font-semibold">{supplier?.name ?? "Unknown supplier"}</span>
            {supplier ? (
              <>
                <span className="text-sm text-muted-foreground">{supplier.hq}</span>
                <span className="text-sm text-muted-foreground">
                  {supplier.contactName} · {supplier.contactEmail}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 sm:items-end sm:text-right">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Invoice</span>
          <span className="font-mono text-sm font-medium">{invoice.id}</span>
          <span className="mt-3 text-xs text-muted-foreground">Amount due</span>
          <span className="font-heading text-3xl font-semibold tracking-tight tabular">{money(totals.totalDue, true)}</span>
          <span className="text-xs text-muted-foreground">Due {formatDate(invoice.dueDate, "MMM d, yyyy")}</span>
        </div>
      </div>

      <div className="grid gap-6 border-b p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Bill to</span>
          <span className="text-sm font-medium">Compass Group USA · {PROGRAM_NAME} Program</span>
          <span className="text-sm text-muted-foreground">{venue?.name ?? "Unknown venue"}</span>
          {venue ? <span className="text-sm text-muted-foreground">{venue.address}</span> : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <KeyValue label="Invoice #">
            <span className="font-mono">{invoice.id}</span>
          </KeyValue>
          <KeyValue label="PO number">
            <span className="font-mono">{invoice.poNumber}</span>
          </KeyValue>
          <KeyValue label="Service period">{formatPeriod(invoice.periodStart, invoice.periodEnd)}</KeyValue>
          <KeyValue label="Issued">{formatDate(invoice.issuedAt, "MMM d, yyyy")}</KeyValue>
          <KeyValue label="Due">{formatDate(invoice.dueDate, "MMM d, yyyy")}</KeyValue>
          <KeyValue label="Terms">Net 30</KeyValue>
        </dl>
      </div>

      <div className="flex flex-col">
        <div className={cn(LINE_GRID, "hidden border-b px-6 py-2 text-xs font-medium text-muted-foreground sm:grid")}>
          <span className="pl-6">Description</span>
          <span>Date</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Amount</span>
          <span className="sr-only">Actions</span>
        </div>
        {invoice.lines.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">This invoice has no lines.</p>
        ) : (
          groups.map((group, gi) => (
            <section key={group.costCenterId} aria-label={group.costCenter ? `Cost center ${group.costCenter.code}` : "Unassigned cost center"}>
              <div className={cn("flex items-center justify-between gap-3 border-b bg-muted/40 px-6 py-2", gi > 0 && "border-t")}>
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-mono font-semibold">{group.costCenter?.code ?? "–"}</span>
                  <span className="font-medium">{group.costCenter?.name ?? "Unassigned cost center"}</span>
                  {group.costCenter ? <span className="text-muted-foreground">GL {group.costCenter.glCode}</span> : null}
                </div>
                <span className="text-xs font-medium tabular">{signedMoney(group.subtotal)}</span>
              </div>
              <div className="flex flex-col divide-y">
                {group.lines.map((line) => (
                  <InvoiceLineRow
                    key={line.id}
                    line={line}
                    entries={line.timeEntryIds.map((id) => entryMap.get(id)).filter((e): e is TimeEntry => !!e)}
                    tipBatch={line.tipBatchId ? tipMap.get(line.tipBatchId) : undefined}
                    dispute={latestDisputeByLine.get(line.id)}
                    lookups={lookups}
                    actions={actions}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <div className="flex flex-col items-end gap-4 border-t px-6 py-6">
        <dl className="flex w-full max-w-sm flex-col gap-2 text-sm">
          <TotalRow label="Labor" value={money(totals.labor, true)} />
          <TotalRow label="Overtime" value={money(totals.overtime, true)} />
          <TotalRow
            label={
              <>
                Tips <span className="text-xs text-muted-foreground">(pass-through, no fee)</span>
              </>
            }
            value={money(totals.tips, true)}
          />
          {totals.credits !== 0 ? <TotalRow label="Credits" value={signedMoney(totals.credits)} valueClassName="text-success" /> : null}
          <div className="mt-1 flex items-baseline justify-between gap-6 border-t pt-3">
            <dt className="font-medium">Total due</dt>
            <dd className="font-heading text-xl font-semibold tracking-tight tabular">{money(totals.totalDue, true)}</dd>
          </div>
        </dl>
        <dl className="flex w-full max-w-sm flex-col gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs">
          <div className="flex items-baseline justify-between gap-6">
            <dt className="flex items-center gap-1 text-muted-foreground">
              Program fee ({PROGRAM_NAME} MSA {msaFeePct}%, supplier-funded)
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex rounded-sm text-muted-foreground hover:text-foreground" aria-label="How the program fee works" data-print="hide">
                    <InfoIcon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 text-pretty">
                  Compass pays the total due, nothing more. The {msaFeePct}% {PROGRAM_NAME} MSA fee applies to labor only and is withheld
                  from the supplier&apos;s remittance. Tips pass through untouched, and bill rates never need a ÷ 0.98 gross-up.
                </TooltipContent>
              </Tooltip>
            </dt>
            <dd className="shrink-0 whitespace-nowrap text-muted-foreground tabular">−{money(totals.programFee, true)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-6">
            <dt className="font-medium">Net to supplier</dt>
            <dd className="shrink-0 whitespace-nowrap font-medium tabular">{money(totals.netToSupplier, true)}</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col gap-1 border-t bg-muted/30 px-6 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          Remit to {supplier?.name ?? "supplier"} · reference {invoice.id} · PO {invoice.poNumber}
        </span>
        <span>
          Built from {plural(timesheetCount, "approved timesheet")}
          {tipBatchCount > 0 ? ` and ${plural(tipBatchCount, "tip batch", "tip batches")}` : ""}
        </span>
      </div>
    </Card>
  )
}

function TotalRow({ label, value, valueClassName }: { label: React.ReactNode; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("shrink-0 whitespace-nowrap tabular", valueClassName)}>{value}</dd>
    </div>
  )
}
