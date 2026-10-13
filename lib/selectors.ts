import { addDays, differenceInHours } from "date-fns"

import type { DemoData } from "@/lib/data"
import { parseLocal, shiftWindow, toISODate } from "@/lib/dates"
import { lineTotals } from "@/lib/invoice"
import { hashString } from "@/lib/random"
import { certStatus, estimateRequestCost, payableShiftHours, requiredCertsFor } from "@/lib/rules"
import { backgroundCheckState } from "@/lib/safety"
import type {
  CostCenter,
  Invoice,
  ISODate,
  Persona,
  Position,
  RequestStatus,
  Shift,
  StaffingRequest,
  Supplier,
  TimeEntry,
  TipBatch,
  Venue,
  Worker,
} from "@/lib/types"

export interface FillStats {
  total: number
  filled: number
  open: number
  checkedIn: number
  completed: number
  noShows: number
  backfilled?: number
  cancelled: number
}

export function computeFill(req: StaffingRequest, shifts: Shift[]): FillStats {
  const stats: FillStats = { total: 0, filled: 0, open: 0, checkedIn: 0, completed: 0, noShows: 0, backfilled: 0, cancelled: 0 }
  for (const s of shifts) {
    if (s.status === "Cancelled") {
      if (!s.backfillFor) stats.cancelled++
      continue
    }
    if (s.backfillFor) stats.backfilled = (stats.backfilled ?? 0) + 1
    if (s.status === "Checked in") stats.checkedIn++
    if (s.status === "Completed") stats.completed++
    if (s.status === "No-show") {
      stats.noShows++
      if (!s.backfillFor) stats.total++
      continue
    }
    if (!s.backfillFor) stats.total++
    if (s.workerId) stats.filled++
    else stats.open++
  }
  if (req.state === "cancelled") stats.total = 0
  stats.filled = Math.min(stats.filled, stats.total)
  return stats
}

export function requestWindow(req: StaffingRequest): { start: Date; end: Date } {
  const dates = [...req.dates].sort()
  const first = shiftWindow(dates[0], req.startTime, req.endTime)
  const last = shiftWindow(dates[dates.length - 1], req.startTime, req.endTime)
  return { start: first.start, end: last.end }
}

export function requestStatus(req: StaffingRequest, fill: FillStats, now: Date): RequestStatus {
  if (req.state === "draft") return "Draft"
  if (req.state === "pending") return "Pending approval"
  if (req.state === "cancelled") return "Cancelled"
  const { start, end } = requestWindow(req)
  if (now >= end) return "Completed"
  if (now >= start) return "In progress"
  return fill.total > 0 && fill.filled >= fill.total ? "Filled" : "Open"
}

export function nextDate(req: StaffingRequest, now: Date): ISODate | undefined {
  const today = toISODate(now)
  return [...req.dates].sort().find((d) => d >= today)
}

export interface RequestView {
  req: StaffingRequest
  venue: Venue
  position: Position
  costCenter: CostCenter
  fill: FillStats
  status: RequestStatus
  estimate: number
  hoursPerShift: number
  start: Date
  end: Date
  nextDate?: ISODate
}

export interface Lookups {
  venues: Map<string, Venue>
  costCenters: Map<string, CostCenter>
  positions: Map<string, Position>
  workers: Map<string, Worker>
  suppliers: Map<string, Supplier>
  requests: Map<string, StaffingRequest>
  shiftsByRequest: Map<string, Shift[]>
  entriesByRequest: Map<string, TimeEntry[]>
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

export function buildLookups(data: DemoData): Lookups {
  return {
    venues: new Map(data.venues.map((v) => [v.id, v])),
    costCenters: new Map(data.costCenters.map((c) => [c.id, c])),
    positions: new Map(data.positions.map((p) => [p.id, p])),
    workers: new Map(data.workers.map((w) => [w.id, w])),
    suppliers: new Map(data.suppliers.map((s) => [s.id, s])),
    requests: new Map(data.requests.map((r) => [r.id, r])),
    shiftsByRequest: groupBy(data.shifts, (s) => s.requestId),
    entriesByRequest: groupBy(data.timeEntries, (e) => e.requestId),
  }
}

export function buildRequestView(req: StaffingRequest, lookups: Lookups, now: Date): RequestView | null {
  const venue = lookups.venues.get(req.venueId)
  const position = lookups.positions.get(req.positionId)
  const costCenter = lookups.costCenters.get(req.costCenterId)
  if (!venue || !position || !costCenter) return null
  const fill = computeFill(req, lookups.shiftsByRequest.get(req.id) ?? [])
  const { start, end } = requestWindow(req)
  return {
    req,
    venue,
    position,
    costCenter,
    fill,
    status: requestStatus(req, fill, now),
    estimate: estimateRequestCost(req),
    hoursPerShift: payableShiftHours(req),
    start,
    end,
    nextDate: nextDate(req, now),
  }
}

// Persona scoping -------------------------------------------------------------

export function venueInScope(venueId: string, persona: Persona): boolean {
  return persona.venueIds === "all" || persona.venueIds.includes(venueId)
}

export function requestInScope(req: StaffingRequest, persona: Persona): boolean {
  if (persona.id === "venue") {
    if (!venueInScope(req.venueId, persona)) return false
    return req.state !== "draft" || req.createdBy === persona.name
  }
  if (persona.id === "supplier") {
    return !!persona.supplierId && req.supplierIds.includes(persona.supplierId) && (req.state === "active" || req.state === "cancelled")
  }
  return req.state !== "draft" || req.createdBy === persona.name
}

export function entryInScope(entry: TimeEntry, lookups: Lookups, persona: Persona): boolean {
  const req = lookups.requests.get(entry.requestId)
  if (!req) return false
  if (persona.id === "supplier") return lookups.workers.get(entry.workerId)?.supplierId === persona.supplierId
  return venueInScope(req.venueId, persona)
}

export function invoiceInScope(inv: Invoice, persona: Persona): boolean {
  if (persona.id === "supplier") return inv.supplierId === persona.supplierId
  return venueInScope(inv.venueId, persona)
}

export function tipBatchInScope(batch: TipBatch, lookups: Lookups, persona: Persona): boolean {
  if (persona.id === "supplier") {
    return batch.status !== "Draft" && batch.lines.some((l) => lookups.workers.get(l.workerId)?.supplierId === persona.supplierId)
  }
  return venueInScope(batch.venueId, persona)
}

export function workerInScope(worker: Worker, data: DemoData, persona: Persona): boolean {
  if (persona.id === "supplier") return worker.supplierId === persona.supplierId
  if (persona.venueIds === "all") return true
  const metros = new Set(data.venues.filter((v) => persona.venueIds.includes(v.id)).map((v) => v.metro))
  return metros.has(worker.metro)
}

// Work orders (derived: one per Pro per request) --------------------------------

export interface WorkOrder {
  id: string
  requestId: string
  workerId: string
  dates: ISODate[]
  status: "Active" | "Completed" | "Closed" | "Cancelled"
  billRate: number
  createdAt?: string
  hoursBilled: number
}

export function workOrderId(requestId: string, workerId: string): string {
  return `WO-${17000 + (hashString(`${requestId}|${workerId}`) % 82000)}`
}

export function workOrdersFor(req: StaffingRequest, shifts: Shift[], entries: TimeEntry[]): WorkOrder[] {
  const byWorker = groupBy(
    shifts.filter((s) => s.workerId),
    (s) => s.workerId!
  )
  const out: WorkOrder[] = []
  for (const [workerId, list] of byWorker) {
    const statuses = list.map((s) => s.status)
    const hours = entries
      .filter((e) => e.workerId === workerId)
      .reduce((sum, e) => sum + e.regularHours + e.overtimeHours, 0)
    const status: WorkOrder["status"] = statuses.every((s) => s === "Cancelled")
      ? "Cancelled"
      : statuses.every((s) => s === "Completed" || s === "No-show" || s === "Cancelled")
        ? statuses.every((s) => s === "No-show" || s === "Cancelled")
          ? "Closed"
          : "Completed"
        : "Active"
    out.push({
      id: workOrderId(req.id, workerId),
      requestId: req.id,
      workerId,
      dates: list.map((s) => s.date).sort(),
      status,
      billRate: req.billRate,
      createdAt: list.map((s) => s.assignedAt).filter(Boolean).sort()[0],
      hoursBilled: Math.round(hours * 100) / 100,
    })
  }
  return out.sort((a, b) => a.dates[0].localeCompare(b.dates[0]))
}

// Invoices --------------------------------------------------------------------

export function invoiceAmount(inv: Invoice, msaFeePct: number): number {
  return lineTotals(inv.lines, msaFeePct).totalDue
}

export interface AccruingSummary {
  supplierId: string
  venueId: string
  entries: TimeEntry[]
  tipBatches: TipBatch[]
  amount: number
  hours: number
}

export function accruingBySupplierVenue(data: DemoData, lookups: Lookups): AccruingSummary[] {
  const map = new Map<string, AccruingSummary>()
  for (const e of data.timeEntries) {
    if (e.status !== "Approved" && e.status !== "Auto-approved") continue
    const req = lookups.requests.get(e.requestId)
    const worker = lookups.workers.get(e.workerId)
    if (!req || !worker) continue
    const key = `${worker.supplierId}|${req.venueId}`
    let item = map.get(key)
    if (!item) {
      item = { supplierId: worker.supplierId, venueId: req.venueId, entries: [], tipBatches: [], amount: 0, hours: 0 }
      map.set(key, item)
    }
    item.entries.push(e)
    item.amount += e.amount
    item.hours += e.regularHours + e.overtimeHours
  }
  for (const b of data.tipBatches) {
    if (b.status !== "Approved" || b.invoiceId) continue
    for (const l of b.lines) {
      const worker = lookups.workers.get(l.workerId)
      if (!worker) continue
      const key = `${worker.supplierId}|${b.venueId}`
      let item = map.get(key)
      if (!item) {
        item = { supplierId: worker.supplierId, venueId: b.venueId, entries: [], tipBatches: [], amount: 0, hours: 0 }
        map.set(key, item)
      }
      if (!item.tipBatches.includes(b)) item.tipBatches.push(b)
      item.amount += l.amount
    }
  }
  return [...map.values()].map((x) => ({ ...x, amount: Math.round(x.amount * 100) / 100, hours: Math.round(x.hours * 100) / 100 }))
}

// Compliance ------------------------------------------------------------------

export interface ComplianceFlag {
  workerId: string
  kind: "cert-expired" | "cert-expiring" | "hours-cap" | "hours-warn" | "onboarding"
  label: string
}

export function workerComplianceFlags(worker: Worker, data: DemoData, today: ISODate): ComplianceFlag[] {
  const flags: ComplianceFlag[] = []
  const background = backgroundCheckState(worker, today)
  if (background !== "ready") {
    flags.push({
      workerId: worker.id,
      kind: "onboarding",
      label:
        background === "expired"
          ? "Background check expired"
          : "Background check pending",
    })
  }
  for (const c of worker.certs) {
    const st = certStatus(worker, c.type, today)
    if (st === "expired") flags.push({ workerId: worker.id, kind: "cert-expired", label: `${c.type} expired` })
    else if (st === "expiring") flags.push({ workerId: worker.id, kind: "cert-expiring", label: `${c.type} expires soon` })
  }
  const cap = data.policies.contractualHoursCap
  if (worker.compassHours >= cap) flags.push({ workerId: worker.id, kind: "hours-cap", label: `At ${cap}-hour cap` })
  else if (worker.compassHours >= cap * (data.policies.contractualHoursWarnPct / 100)) {
    flags.push({ workerId: worker.id, kind: "hours-warn", label: `${worker.compassHours}/${cap} contractual hours` })
  }
  if (
    worker.onboarding.some((o) => o.status === "Pending") &&
    background === "ready"
  ) {
    flags.push({
      workerId: worker.id,
      kind: "onboarding",
      label: "Onboarding incomplete",
    })
  }
  return flags
}

export function missingCertsFor(worker: Worker, position: Position, venue: Venue, today: ISODate): string[] {
  return requiredCertsFor(position, venue).filter((c) => {
    const st = certStatus(worker, c, today)
    return st === "missing" || st === "expired"
  })
}

// Unified inbox -----------------------------------------------------------------

export type InboxKind =
  | "timesheets"
  | "dispute"
  | "tips"
  | "tips-draft"
  | "request-approval"
  | "change"
  | "invoice"
  | "invoice-dispute"
  | "staffing"
  | "compliance"
  | "supplier-coi"

export interface InboxItem {
  id: string
  kind: InboxKind
  title: string
  subtitle: string
  at: string
  priority: "high" | "normal" | "low"
  href: string
  amount?: number
  count?: number
  flagged?: number
  venueId?: string
  refIds: string[]
}

export function buildInbox(data: DemoData, lookups: Lookups, persona: Persona, now: Date): InboxItem[] {
  const items: InboxItem[] = []
  const today = toISODate(now)
  const fee = data.policies.msaFeePct

  if (persona.id === "venue") {
    const pending = data.timeEntries.filter((e) => e.status === "Pending" && entryInScope(e, lookups, persona))
    const byReq = groupBy(pending, (e) => e.requestId)
    for (const [requestId, list] of byReq) {
      const req = lookups.requests.get(requestId)
      if (!req) continue
      const pos = lookups.positions.get(req.positionId)
      const venue = lookups.venues.get(req.venueId)
      const flagged = list.filter((e) => e.anomalies.length > 0).length
      const amount = list.reduce((s, e) => s + e.amount, 0)
      const latest = list.map((e) => e.clockOut ?? e.clockIn).sort().pop() ?? req.createdAt
      items.push({
        id: `ts:${requestId}`,
        kind: "timesheets",
        title: `Review ${list.length} ${list.length === 1 ? "timesheet" : "timesheets"} · ${pos?.title ?? ""}`,
        subtitle: `${req.eventName ?? "Shift"} · ${venue?.shortName ?? ""}${flagged ? ` · ${flagged} flagged` : ""}`,
        at: latest,
        priority: flagged ? "high" : "normal",
        href: `/timesheets?request=${requestId}`,
        amount,
        count: list.length,
        flagged,
        venueId: req.venueId,
        refIds: list.map((e) => e.id),
      })
    }
  }

  if (persona.id === "venue") {
    for (const b of data.tipBatches) {
      if (!venueInScope(b.venueId, persona)) continue
      const total = b.lines.reduce((s, l) => s + l.amount, 0)
      if (b.status === "Pending approval") {
        items.push({ id: `tip:${b.id}`, kind: "tips", title: `Approve tips · ${b.eventName}`, subtitle: `${b.lines.length} Pros · submitted by ${b.createdBy}`, at: b.createdAt, priority: "normal", href: `/tips?batch=${b.id}`, amount: total, count: b.lines.length, venueId: b.venueId, refIds: [b.id] })
      }
      if (b.status === "Draft" && b.createdBy === persona.name) {
        items.push({ id: `tipd:${b.id}`, kind: "tips-draft", title: `Finish tip batch · ${b.eventName}`, subtitle: `Draft · ${b.lines.length} Pros`, at: b.createdAt, priority: "low", href: `/tips?batch=${b.id}`, amount: total, venueId: b.venueId, refIds: [b.id] })
      }
    }
  }

  if (persona.id === "venue" || persona.id === "program") {
    for (const inv of data.invoices) {
      if (!invoiceInScope(inv, persona)) continue
      if (persona.id === "program" && persona.venueIds === "all" && inv.status === "Pending approval") continue
      const supplier = lookups.suppliers.get(inv.supplierId)
      const venue = lookups.venues.get(inv.venueId)
      const amount = lineTotals(inv.lines, fee).totalDue
      if (inv.status === "Pending approval") {
        items.push({ id: `inv:${inv.id}`, kind: "invoice", title: `Approve invoice ${inv.id}`, subtitle: `${supplier?.shortName ?? ""} · ${venue?.shortName ?? ""} · ${inv.lines.length} lines`, at: inv.issuedAt, priority: "normal", href: `/invoices/${inv.id}`, amount, venueId: inv.venueId, refIds: [inv.id] })
      }
      if (inv.status === "Disputed") {
        items.push({ id: `invd:${inv.id}`, kind: "invoice-dispute", title: `Resolve dispute on ${inv.id}`, subtitle: `${supplier?.shortName ?? ""} · ${inv.disputes.find((d) => d.status === "Open")?.reason ?? "Open dispute"}`, at: inv.disputes[inv.disputes.length - 1]?.at ?? inv.issuedAt, priority: "high", href: `/invoices/${inv.id}`, amount, venueId: inv.venueId, refIds: [inv.id] })
      }
    }
  }

  if (persona.id === "program") {
    for (const r of data.requests) {
      if (r.state !== "pending") continue
      const pos = lookups.positions.get(r.positionId)
      const venue = lookups.venues.get(r.venueId)
      items.push({ id: `req:${r.id}`, kind: "request-approval", title: `Approve ${r.id} · ${r.headcount} × ${pos?.title ?? ""}`, subtitle: `${venue?.shortName ?? ""} · ${r.eventName ?? r.reason} · ${r.dates.length} ${r.dates.length === 1 ? "date" : "dates"}`, at: r.createdAt, priority: "high", href: `/requests/${r.id}`, amount: estimateRequestCost(r), venueId: r.venueId, refIds: [r.id] })
    }
    for (const c of data.changeRequests) {
      if (c.status !== "Pending") continue
      items.push({ id: `chg:${c.id}`, kind: "change", title: c.summary, subtitle: `${c.type} · requested by ${c.requestedBy}`, at: c.createdAt, priority: c.type === "Rate revision" ? "normal" : "high", href: c.requestId ? `/requests/${c.requestId}` : "/rates", venueId: c.venueId, refIds: [c.id] })
    }
    for (const s of data.suppliers) {
      const days = Math.round((parseLocal(s.coiExpires).getTime() - now.getTime()) / 86_400_000)
      if (days < 0 || days <= 30) {
        items.push({ id: `coi:${s.id}`, kind: "supplier-coi", title: days < 0 ? `${s.name} COI expired` : `${s.name} COI expires in ${days} days`, subtitle: days < 0 ? "Distribution paused until a renewed certificate is verified" : "Renewal reminder sent automatically", at: s.coiExpires, priority: days < 0 ? "high" : "low", href: "/suppliers", refIds: [s.id] })
      }
    }
  }

  if (persona.id === "venue" || persona.id === "supplier") {
    const horizon = toISODate(addDays(now, persona.id === "supplier" ? 7 : 2))
    for (const r of data.requests) {
      if (r.state !== "active" || !requestInScope(r, persona)) continue
      const upcoming = r.dates.filter((d) => d >= today && d <= horizon)
      if (upcoming.length === 0) continue
      const shifts = (lookups.shiftsByRequest.get(r.id) ?? []).filter((s) => upcoming.includes(s.date))
      const open = shifts.filter((s) => !s.workerId && s.status === "Open")
      if (open.length === 0) continue
      const { start } = shiftWindow(upcoming[0], r.startTime, r.endTime)
      if (start < now) continue
      const pos = lookups.positions.get(r.positionId)
      const venue = lookups.venues.get(r.venueId)
      const hoursOut = differenceInHours(start, now)
      items.push({
        id: `fill:${r.id}`,
        kind: "staffing",
        title: persona.id === "supplier" ? `Fill ${open.length} open ${pos?.title ?? ""} ${open.length === 1 ? "shift" : "shifts"}` : `${open.length} open ${pos?.title ?? ""} ${open.length === 1 ? "shift" : "shifts"}`,
        subtitle: `${r.id} · ${venue?.shortName ?? ""} · ${r.eventName ?? "Shift"} · starts in ${hoursOut < 24 ? `${hoursOut}h` : `${Math.round(hoursOut / 24)}d`}`,
        at: r.createdAt,
        priority: hoursOut <= 36 ? "high" : "normal",
        href: `/requests/${r.id}`,
        count: open.length,
        venueId: r.venueId,
        refIds: open.map((s) => s.id),
      })
    }
  }

  if (persona.id === "supplier") {
    for (const e of data.timeEntries) {
      if (e.status !== "Disputed" || !e.dispute || e.dispute.response) continue
      if (lookups.workers.get(e.workerId)?.supplierId !== persona.supplierId) continue
      const req = lookups.requests.get(e.requestId)
      const venue = req ? lookups.venues.get(req.venueId) : undefined
      items.push({ id: `dsp:${e.id}`, kind: "dispute", title: `Respond to dispute on ${e.id}`, subtitle: `${e.dispute.reason} · ${venue?.shortName ?? ""}`, at: e.dispute.at, priority: "high", href: "/timesheets?tab=disputed", amount: e.amount, venueId: req?.venueId, refIds: [e.id] })
    }
  }

  if (persona.id === "venue") {
    const venueReqIds = new Set(
      data.requests.filter((r) => venueInScope(r.venueId, persona) && r.state === "active").map((r) => r.id)
    )
    const upcomingWorkers = new Set(
      data.shifts
        .filter((s) => s.workerId && s.status === "Confirmed" && s.date >= today && s.date <= toISODate(addDays(now, 7)) && venueReqIds.has(s.requestId))
        .map((s) => s.workerId!)
    )
    for (const workerId of upcomingWorkers) {
      const w = lookups.workers.get(workerId)
      if (!w) continue
      const flags = workerComplianceFlags(w, data, today).filter((f) => f.kind === "cert-expiring" || f.kind === "hours-warn")
      if (flags.length === 0) continue
      items.push({ id: `cmp:${w.id}`, kind: "compliance", title: `${w.preferredName ?? w.firstName} ${w.lastName} · ${flags[0].label}`, subtitle: "Booked at your venues this week", at: toISODate(now), priority: "low", href: `/workforce/${w.id}`, refIds: [w.id] })
    }
  }

  const rank = { high: 0, normal: 1, low: 2 }
  return items.sort((a, b) => rank[a.priority] - rank[b.priority] || b.at.localeCompare(a.at))
}
