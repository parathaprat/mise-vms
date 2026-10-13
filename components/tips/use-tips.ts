"use client"

import { useMemo } from "react"
import { addDays, differenceInMinutes } from "date-fns"
import { useShallow } from "zustand/react/shallow"

import { useNow, usePersona } from "@/hooks/use-demo"
import { parseLocal, toISODate } from "@/lib/dates"
import { workerName } from "@/lib/format"
import { invoiceInScope, tipBatchInScope, venueInScope, type Lookups } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type {
  CostCenter,
  Invoice,
  Persona,
  Policies,
  Supplier,
  TipBatch,
  TipBatchStatus,
  TipLine,
  Venue,
  Worker,
} from "@/lib/types"

import { isPolicyApproval, linesHours, linesTotal } from "./tip-utils"

export type TipTab = "all" | "pending" | "drafts" | "approved" | "paid" | "returned"

export const TAB_STATUS: Record<Exclude<TipTab, "all">, TipBatchStatus> = {
  pending: "Pending approval",
  drafts: "Draft",
  approved: "Approved",
  paid: "Paid",
  returned: "Rejected",
}

export interface SupplierShare {
  supplierId: string
  supplier?: Supplier
  pros: number
  hours: number
  total: number
}

export interface TipRow {
  id: string
  batch: TipBatch
  venue?: Venue
  costCenter?: CostCenter
  /** Lines the persona may see: a supplier only sees its own Pros. */
  lines: TipLine[]
  total: number
  hours: number
  /** Every Pro on the batch, including Pros from other suppliers. */
  allPros: number
  shares: SupplierShare[]
  /** Supplier invoices (in scope) that bill this batch. */
  invoices: Invoice[]
  haystack: string
}

export interface TipsModel {
  persona: Persona
  today: string
  rows: TipRow[]
  rowsById: Map<string, TipRow>
  workersById: Map<string, Worker>
  suppliersById: Map<string, Supplier>
  venuesById: Map<string, Venue>
  costCentersById: Map<string, CostCenter>
  scopeVenues: Venue[]
  policies: Policies
  canCreate: boolean
  canApprove: boolean
}

interface BuildInput {
  persona: Persona
  today: string
  tipBatches: TipBatch[]
  workers: Worker[]
  venues: Venue[]
  costCenters: CostCenter[]
  suppliers: Supplier[]
  invoices: Invoice[]
  policies: Policies
}

function sharesFor(lines: TipLine[], workersById: Map<string, Worker>, suppliersById: Map<string, Supplier>): SupplierShare[] {
  const map = new Map<string, SupplierShare>()
  for (const line of lines) {
    const supplierId = workersById.get(line.workerId)?.supplierId ?? "unknown"
    let share = map.get(supplierId)
    if (!share) {
      share = { supplierId, supplier: suppliersById.get(supplierId), pros: 0, hours: 0, total: 0 }
      map.set(supplierId, share)
    }
    share.pros++
    share.hours += line.hours
    share.total += line.amount
  }
  return [...map.values()]
    .map((s) => ({ ...s, hours: Math.round(s.hours * 100) / 100, total: Math.round(s.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total)
}

function buildTips(input: BuildInput): TipsModel {
  const { persona, today, tipBatches, workers, venues, costCenters, suppliers, invoices, policies } = input
  const workersById = new Map(workers.map((w) => [w.id, w]))
  const suppliersById = new Map(suppliers.map((s) => [s.id, s]))
  const venuesById = new Map(venues.map((v) => [v.id, v]))
  const costCentersById = new Map(costCenters.map((c) => [c.id, c]))
  // tipBatchInScope only reads worker → supplier, so a narrow lookup is enough.
  const lookups = { workers: workersById } as unknown as Lookups

  const invoicesByBatch = new Map<string, Invoice[]>()
  for (const invoice of invoices) {
    if (!invoiceInScope(invoice, persona)) continue
    for (const line of invoice.lines) {
      if (line.kind !== "tips" || !line.tipBatchId) continue
      const list = invoicesByBatch.get(line.tipBatchId)
      if (!list) invoicesByBatch.set(line.tipBatchId, [invoice])
      else if (!list.includes(invoice)) list.push(invoice)
    }
  }

  const rows: TipRow[] = []
  for (const batch of tipBatches) {
    if (!tipBatchInScope(batch, lookups, persona)) continue
    // Drafts are a venue's work in progress.
    if (persona.id === "program" && batch.status === "Draft" && batch.createdBy !== persona.name) continue
    const lines =
      persona.id === "supplier"
        ? batch.lines.filter((l) => workersById.get(l.workerId)?.supplierId === persona.supplierId)
        : batch.lines
    const venue = venuesById.get(batch.venueId)
    const costCenter = costCentersById.get(batch.costCenterId)
    rows.push({
      id: batch.id,
      batch,
      venue,
      costCenter,
      lines,
      total: linesTotal(lines),
      hours: linesHours(lines),
      allPros: batch.lines.length,
      shares: sharesFor(lines, workersById, suppliersById),
      invoices: invoicesByBatch.get(batch.id) ?? [],
      haystack: [
        batch.id,
        batch.eventName,
        venue?.name,
        venue?.shortName,
        costCenter?.name,
        costCenter?.code,
        batch.createdBy,
        batch.method,
        ...lines.map((l) => workerName(workersById.get(l.workerId))),
      ]
        .join(" ")
        .toLowerCase(),
    })
  }
  rows.sort((a, b) => b.batch.date.localeCompare(a.batch.date) || b.batch.createdAt.localeCompare(a.batch.createdAt))

  return {
    persona,
    today,
    rows,
    rowsById: new Map(rows.map((r) => [r.id, r])),
    workersById,
    suppliersById,
    venuesById,
    costCentersById,
    scopeVenues: venues.filter((v) => venueInScope(v.id, persona)),
    policies,
    canCreate: persona.id === "venue",
    canApprove: persona.id === "venue",
  }
}

export function useTips(): TipsModel {
  const persona = usePersona()
  const today = toISODate(useNow())
  const { tipBatches, workers, venues, costCenters, suppliers, invoices, policies } = useStore(
    useShallow((s) => ({
      tipBatches: s.data.tipBatches,
      workers: s.data.workers,
      venues: s.data.venues,
      costCenters: s.data.costCenters,
      suppliers: s.data.suppliers,
      invoices: s.data.invoices,
      policies: s.data.policies,
    }))
  )
  return useMemo(
    () => buildTips({ persona, today, tipBatches, workers, venues, costCenters, suppliers, invoices, policies }),
    [persona, today, tipBatches, workers, venues, costCenters, suppliers, invoices, policies]
  )
}

// KPIs ---------------------------------------------------------------------------

export const KPI_WINDOW_DAYS = 30

export interface TipKpis {
  pending: { count: number; amount: number; oldest?: string }
  drafts: number
  returned: number
  recent: { total: number; hours: number; pros: number; events: number }
  awaiting: { count: number; amount: number; invoiced: number }
  /** Median hours from entry to a person's approval (policy approvals excluded). */
  turnaroundHours?: number
}

export function tipKpis(rows: TipRow[], today: string): TipKpis {
  const from = toISODate(addDays(parseLocal(today), -KPI_WINDOW_DAYS))
  const kpis: TipKpis = {
    pending: { count: 0, amount: 0 },
    drafts: 0,
    returned: 0,
    recent: { total: 0, hours: 0, pros: 0, events: 0 },
    awaiting: { count: 0, amount: 0, invoiced: 0 },
  }
  const pros = new Set<string>()
  const turnarounds: number[] = []
  for (const row of rows) {
    const { batch } = row
    if (batch.status === "Pending approval") {
      kpis.pending.count++
      kpis.pending.amount += row.total
      if (!kpis.pending.oldest || batch.createdAt < kpis.pending.oldest) kpis.pending.oldest = batch.createdAt
    }
    if (batch.status === "Draft") kpis.drafts++
    if (batch.status === "Rejected") kpis.returned++
    if (batch.status === "Approved") {
      kpis.awaiting.count++
      kpis.awaiting.amount += row.total
      if (row.invoices.length) kpis.awaiting.invoiced++
    }
    if ((batch.status === "Approved" || batch.status === "Paid") && batch.date >= from) {
      kpis.recent.total += row.total
      kpis.recent.hours += row.hours
      kpis.recent.events++
      for (const line of row.lines) pros.add(line.workerId)
      if (batch.approvedAt && !isPolicyApproval(batch.approvedBy)) {
        const minutes = differenceInMinutes(parseLocal(batch.approvedAt), parseLocal(batch.createdAt))
        if (Number.isFinite(minutes) && minutes >= 0) turnarounds.push(minutes / 60)
      }
    }
  }
  kpis.recent.pros = pros.size
  if (turnarounds.length) {
    const sorted = [...turnarounds].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    kpis.turnaroundHours = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }
  return kpis
}
