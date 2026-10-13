import { format, nextFriday, nextMonday, setHours, startOfDay } from "date-fns"

import type { Tone } from "@/components/app/status-badge"
import type { DemoData } from "@/lib/data"
import { formatDate, parseLocal } from "@/lib/dates"
import { money, round2 } from "@/lib/format"
import { lineTotals, type InvoiceTotals } from "@/lib/invoice"
import { accruingBySupplierVenue, invoiceInScope, venueInScope, type AccruingSummary, type Lookups } from "@/lib/selectors"
import type { Invoice, InvoiceLine, InvoiceStatus, Payment, Persona, Supplier, TimeEntry, TipBatch, Venue } from "@/lib/types"

export const DISPUTE_REASONS = ["Hours exceed schedule", "Rate incorrect", "Duplicate charge", "Pro not on site", "Other"] as const

export type InvoiceStatusFilter = "all" | "needs-approval" | "disputed" | "approved" | "paid"

export const STATUS_FILTERS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs-approval", label: "Needs approval" },
  { value: "disputed", label: "Disputed" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
]

export function isStatusFilter(value: string | null | undefined): value is InvoiceStatusFilter {
  return STATUS_FILTERS.some((f) => f.value === value)
}

export function matchesStatusFilter(status: InvoiceStatus, filter: InvoiceStatusFilter): boolean {
  switch (filter) {
    case "needs-approval":
      return status === "Pending approval"
    case "disputed":
      return status === "Disputed"
    case "approved":
      return status === "Approved"
    case "paid":
      return status === "Paid"
    default:
      return true
  }
}

export const PAYMENT_TONE: Record<Payment["status"], Tone> = {
  Settled: "success",
  Processing: "info",
  Scheduled: "primary",
}

/** "Sep 28 – Oct 4", "Oct 5 – 11" or "Oct 5" for a single day. */
export function formatPeriod(start: string, end: string): string {
  if (!end || start === end) return formatDate(start, "MMM d")
  const s = parseLocal(start)
  const e = parseLocal(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "–"
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) return `${format(s, "MMM d")} – ${format(e, "d")}`
  return `${format(s, "MMM d")} – ${format(e, "MMM d")}`
}

/** Mirrors the store: approved invoices are paid on the next Friday run. */
export function nextPaymentDate(now: Date): Date {
  return nextFriday(startOfDay(now))
}

/** Weekly invoices are issued Mondays at 6:00 AM venue time. */
export function nextInvoiceRun(now: Date): Date {
  const todayRun = setHours(startOfDay(now), 6)
  if (now.getDay() === 1 && now < todayRun) return todayRun
  return setHours(nextMonday(startOfDay(now)), 6)
}

/** Money with a typographic minus, e.g. "−$120.00" for credits. */
export function signedMoney(value: number): string {
  return value < 0 ? `−${money(Math.abs(value), true)}` : money(value, true)
}

export function isAutoApproval(approvedBy?: string): boolean {
  return !!approvedBy && approvedBy.startsWith("Policy")
}

export function lineHasOpenDispute(invoice: Invoice, lineId: string): boolean {
  return invoice.disputes.some((d) => d.lineId === lineId && d.status === "Open")
}

/** Payment that covers an invoice: the recorded payment first, otherwise a scheduled run that lists it. */
export function paymentForInvoice(invoice: Invoice, payments: Payment[]): Payment | undefined {
  if (invoice.paymentId) {
    const recorded = payments.find((p) => p.id === invoice.paymentId)
    if (recorded) return recorded
  }
  return payments.find((p) => p.invoiceIds.includes(invoice.id))
}

// Invoice rows ----------------------------------------------------------------

export interface InvoiceRow {
  id: string
  invoice: Invoice
  supplier?: Supplier
  venue?: Venue
  totals: InvoiceTotals
  openDisputes: number
  payment?: Payment
  overdue: boolean
  /** Total due for buyers, net-to-supplier for the supplier persona. */
  amount: number
}

export function buildInvoiceRows(
  invoices: Invoice[],
  payments: Payment[],
  lookups: Lookups,
  persona: Persona,
  msaFeePct: number,
  todayISO: string
): InvoiceRow[] {
  const paymentById = new Map(payments.map((p) => [p.id, p]))
  const paymentByInvoice = new Map<string, Payment>()
  for (const p of payments) {
    for (const id of p.invoiceIds) if (!paymentByInvoice.has(id)) paymentByInvoice.set(id, p)
  }
  const rows: InvoiceRow[] = []
  for (const invoice of invoices) {
    if (!invoiceInScope(invoice, persona)) continue
    const totals = lineTotals(invoice.lines, msaFeePct)
    rows.push({
      id: invoice.id,
      invoice,
      supplier: lookups.suppliers.get(invoice.supplierId),
      venue: lookups.venues.get(invoice.venueId),
      totals,
      openDisputes: invoice.disputes.filter((d) => d.status === "Open").length,
      payment: (invoice.paymentId ? paymentById.get(invoice.paymentId) : undefined) ?? paymentByInvoice.get(invoice.id),
      overdue: invoice.status !== "Paid" && invoice.dueDate < todayISO,
      amount: persona.id === "supplier" ? totals.netToSupplier : totals.totalDue,
    })
  }
  return rows.sort((a, b) => b.invoice.issuedAt.localeCompare(a.invoice.issuedAt) || b.id.localeCompare(a.id))
}

// Payment rows ----------------------------------------------------------------

export interface RemittanceLine {
  invoice: Invoice
  venue?: Venue
  net: number
}

export interface PaymentRow {
  id: string
  payment: Payment
  supplier?: Supplier
  lines: RemittanceLine[]
  /** Portion of the payment covering invoices in the persona's scope. */
  scopedAmount: number
  partial: boolean
}

export function buildPaymentRows(
  payments: Payment[],
  invoices: Invoice[],
  lookups: Lookups,
  persona: Persona,
  msaFeePct: number
): PaymentRow[] {
  const invoiceById = new Map(invoices.map((i) => [i.id, i]))
  const rows: PaymentRow[] = []
  for (const payment of payments) {
    if (persona.id === "supplier" && payment.supplierId !== persona.supplierId) continue
    const lines: RemittanceLine[] = []
    for (const id of payment.invoiceIds) {
      const invoice = invoiceById.get(id)
      if (!invoice || !invoiceInScope(invoice, persona)) continue
      lines.push({ invoice, venue: lookups.venues.get(invoice.venueId), net: lineTotals(invoice.lines, msaFeePct).netToSupplier })
    }
    if (persona.id === "venue" && lines.length === 0) continue
    const partial = lines.length < payment.invoiceIds.length
    rows.push({
      id: payment.id,
      payment,
      supplier: lookups.suppliers.get(payment.supplierId),
      lines,
      scopedAmount: partial ? round2(lines.reduce((s, l) => s + l.net, 0)) : payment.amount,
      partial,
    })
  }
  return rows.sort((a, b) => b.payment.date.localeCompare(a.payment.date) || b.id.localeCompare(a.id))
}

// Accruing (next invoice run) -------------------------------------------------

export interface AccrualTile extends AccruingSummary {
  supplier?: Supplier
  venue?: Venue
  labor: number
  tips: number
  /** Estimated remittance after the supplier-funded program fee. */
  estimatedNet: number
}

export function accruingInScope(
  timeEntries: TimeEntry[],
  tipBatches: TipBatch[],
  lookups: Lookups,
  persona: Persona,
  msaFeePct: number
): AccrualTile[] {
  const all = accruingBySupplierVenue({ timeEntries, tipBatches } as unknown as DemoData, lookups)
  return all
    .filter((a) => (persona.id === "supplier" ? a.supplierId === persona.supplierId : venueInScope(a.venueId, persona)))
    .map((a) => {
      const labor = round2(a.entries.reduce((s, e) => s + e.amount, 0))
      const tips = round2(Math.max(0, a.amount - labor))
      return {
        ...a,
        supplier: lookups.suppliers.get(a.supplierId),
        venue: lookups.venues.get(a.venueId),
        labor,
        tips,
        estimatedNet: round2(labor * (1 - msaFeePct / 100) + tips),
      }
    })
    .sort((a, b) => b.amount - a.amount)
}

// CSV -------------------------------------------------------------------------

type CsvValue = string | number | null | undefined

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: CsvValue[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n")
}

export function downloadFile(filename: string, contents: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export const LINE_KIND_LABEL: Record<InvoiceLine["kind"], string> = {
  labor: "Labor",
  overtime: "Overtime",
  tips: "Tips",
  credit: "Credit",
}

export function invoiceLinesCsv(invoice: Invoice, lookups: Lookups): string {
  const header = ["Invoice", "PO", "Line", "Kind", "Cost center", "GL code", "Description", "Date", "Quantity", "Unit", "Rate", "Amount", "Request", "Timesheets", "Tip batch"]
  const body = invoice.lines.map((l) => {
    const cc = lookups.costCenters.get(l.costCenterId)
    return [
      invoice.id,
      invoice.poNumber,
      l.id,
      LINE_KIND_LABEL[l.kind],
      cc?.code ?? "",
      cc?.glCode ?? "",
      l.description,
      l.date ?? "",
      l.quantity,
      l.kind === "tips" ? "Pros" : l.kind === "credit" ? "each" : "hours",
      l.kind === "tips" ? "" : l.rate.toFixed(2),
      l.amount.toFixed(2),
      l.requestId ?? "",
      l.timeEntryIds.join(" "),
      l.tipBatchId ?? "",
    ]
  })
  return toCsv([header, ...body])
}

export function invoiceSummaryCsv(rows: InvoiceRow[]): string {
  const header = ["Invoice", "PO", "Supplier", "Venue", "Period start", "Period end", "Status", "Lines", "Hours", "Total due", "Program fee", "Net to supplier", "Issued", "Due", "Payment"]
  const body = rows.map((r) => [
    r.id,
    r.invoice.poNumber,
    r.supplier?.name ?? r.invoice.supplierId,
    r.venue?.name ?? r.invoice.venueId,
    r.invoice.periodStart,
    r.invoice.periodEnd,
    r.invoice.status,
    r.invoice.lines.length,
    r.totals.hours,
    r.totals.totalDue.toFixed(2),
    r.totals.programFee.toFixed(2),
    r.totals.netToSupplier.toFixed(2),
    r.invoice.issuedAt.slice(0, 10),
    r.invoice.dueDate,
    r.payment?.id ?? "",
  ])
  return toCsv([header, ...body])
}

export function remittanceCsv(row: PaymentRow): string {
  const header = ["Payment", "Reference", "Method", "Date", "Invoice", "PO", "Venue", "Period start", "Period end", "Amount", "Match"]
  const body = row.lines.map((l) => [
    row.id,
    row.payment.reference,
    row.payment.method,
    row.payment.date,
    l.invoice.id,
    l.invoice.poNumber,
    l.venue?.name ?? l.invoice.venueId,
    l.invoice.periodStart,
    l.invoice.periodEnd,
    l.net.toFixed(2),
    "Exact · invoice ID",
  ])
  return toCsv([header, ...body])
}
