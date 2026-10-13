import { addDays, addMinutes } from "date-fns"

import type { DemoData } from "@/lib/data"
import { parseLocal, shiftWindow, toISODate, weekStartOf } from "@/lib/dates"
import { round2 } from "@/lib/format"
import { payableShiftHours } from "@/lib/rules"
import type {
  ChangeRequest,
  CostCenter,
  ISODate,
  Persona,
  PositionCategory,
  RateCardEntry,
  Shift,
  StaffingRequest,
  Supplier,
  Venue,
} from "@/lib/types"

export const CATEGORIES: PositionCategory[] = ["Culinary", "Concessions", "Bar", "Service", "Leadership", "Support"]

export function firstDateOf(req: Pick<StaffingRequest, "dates">): ISODate {
  let first = req.dates[0] ?? ""
  for (const d of req.dates) if (d < first) first = d
  return first
}

export function venueMetroMap(venues: Venue[]): Map<string, string> {
  return new Map(venues.map((v) => [v.id, v.metro]))
}

// Rates ------------------------------------------------------------------------

/** Requests a rate card publish reprices, mirrors the store: same position and market, not cancelled, first date today or later. */
export function repricedRequests(
  card: Pick<RateCardEntry, "positionId" | "metro">,
  requests: StaffingRequest[],
  venueMetro: Map<string, string>,
  today: ISODate
): StaffingRequest[] {
  return requests.filter(
    (r) =>
      r.positionId === card.positionId &&
      venueMetro.get(r.venueId) === card.metro &&
      r.state !== "cancelled" &&
      firstDateOf(r) >= today
  )
}

export interface RepriceImpact {
  count: number
  active: number
  pending: number
  drafts: number
  hours: number
  total: number
  next7: number
  through?: ISODate
}

export function repriceImpact(requests: StaffingRequest[], newBill: number, today: ISODate): RepriceImpact {
  const horizon = toISODate(addDays(parseLocal(today), 6))
  const impact: RepriceImpact = { count: requests.length, active: 0, pending: 0, drafts: 0, hours: 0, total: 0, next7: 0 }
  for (const r of requests) {
    if (r.state === "active") impact.active++
    else if (r.state === "pending") impact.pending++
    else if (r.state === "draft") impact.drafts++
    const perShift = payableShiftHours(r) * r.headcount
    const delta = newBill - r.billRate
    for (const d of r.dates) {
      impact.hours += perShift
      impact.total += perShift * delta
      if (d <= horizon) impact.next7 += perShift * delta
      if (!impact.through || d > impact.through) impact.through = d
    }
  }
  impact.hours = round2(impact.hours)
  impact.total = round2(impact.total)
  impact.next7 = round2(impact.next7)
  return impact
}

export function pendingRateRevisionFor(changes: ChangeRequest[], rateCardId: string, requestedBy?: string) {
  return changes.find(
    (c) => c.type === "Rate revision" && c.status === "Pending" && c.rateCardId === rateCardId && (!requestedBy || c.requestedBy === requestedBy)
  )
}

export function splitDecisionNote(detail: string): { detail: string; note?: string } {
  const marker = "\n\nDecision note: "
  const idx = detail.indexOf(marker)
  if (idx < 0) return { detail }
  return { detail: detail.slice(0, idx), note: detail.slice(idx + marker.length) }
}

// Locations --------------------------------------------------------------------

export interface WeekWindow {
  start: ISODate
  end: ISODate
}

export function weekWindow(now: Date): WeekWindow {
  const start = weekStartOf(now)
  return { start: toISODate(start), end: toISODate(addDays(start, 6)) }
}

export interface CostCenterSpend {
  committed: number
  pending: number
  requests: number
}

/** Estimated spend per cost center for dates inside the week: active requests are committed, pending ones are awaiting approval. */
export function weeklySpendByCostCenter(requests: StaffingRequest[], week: WeekWindow): Map<string, CostCenterSpend> {
  const out = new Map<string, CostCenterSpend>()
  for (const r of requests) {
    if (r.state !== "active" && r.state !== "pending") continue
    let days = 0
    for (const d of r.dates) if (d >= week.start && d <= week.end) days++
    if (days === 0) continue
    const amount = days * r.headcount * payableShiftHours(r) * r.billRate
    const row = out.get(r.costCenterId) ?? { committed: 0, pending: 0, requests: 0 }
    if (r.state === "active") row.committed += amount
    else row.pending += amount
    row.requests++
    out.set(r.costCenterId, row)
  }
  for (const row of out.values()) {
    row.committed = round2(row.committed)
    row.pending = round2(row.pending)
  }
  return out
}

export type BudgetTone = "ok" | "warning" | "over"

export function budgetTone(ratio: number): BudgetTone {
  if (ratio > 1) return "over"
  if (ratio > 0.9) return "warning"
  return "ok"
}

export function upcomingByVenue(requests: StaffingRequest[], today: ISODate): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of requests) {
    if (r.state !== "active") continue
    if (!r.dates.some((d) => d >= today)) continue
    out.set(r.venueId, (out.get(r.venueId) ?? 0) + 1)
  }
  return out
}

export function costCenterEditable(cc: CostCenter, persona: Persona): "all" | "operational" | "none" {
  if (persona.id === "program") return "all"
  if (persona.id === "venue" && (persona.venueIds === "all" || persona.venueIds.includes(cc.venueId))) return "operational"
  return "none"
}

// Suppliers --------------------------------------------------------------------

export type CoiState = "valid" | "expiring" | "expired"

export function coiStatus(supplier: Pick<Supplier, "coiExpires">, today: ISODate): { state: CoiState; days: number } {
  const days = Math.round((parseLocal(supplier.coiExpires).getTime() - parseLocal(today).getTime()) / 86_400_000)
  if (days < 0) return { state: "expired", days }
  if (days <= 30) return { state: "expiring", days }
  return { state: "valid", days }
}

export function receivesRequests(supplier: Supplier, today: ISODate): boolean {
  return supplier.active && supplier.coiExpires >= today
}

export type Grade = "A" | "B" | "C"

export interface SupplierScore {
  supplierId: string
  activePros: number
  totalPros: number
  filled: number
  fillShare: number
  assignedPast: number
  noShows: number
  noShowRate: number
  entries: number
  onTime: number
  onTimeRate: number
  disputes: number
  disputeRate: number
  spend: number
  hours: number
  /** Filled shifts per week, oldest first; the current week includes confirmed upcoming shifts. */
  weekly: number[]
  weeklySpend: number[]
  weeklyNoShowRate: number[]
  weeklyOnTimeRate: number[]
  weekLabels: ISODate[]
  score: number
  grade: Grade
}

export const SCORE_WINDOW_DAYS = 30
const FILLED: Shift["status"][] = ["Confirmed", "Checked in", "Completed"]

export function gradeFor(score: number): Grade {
  if (score >= 90) return "A"
  if (score >= 75) return "B"
  return "C"
}

export interface ScoreFactor {
  key: "noShows" | "lateness" | "disputes" | "volume"
  label: string
  points: number
}

/** Weighted scorecard: reliability (no-shows) dominates, then punctuality, then timesheet disputes; fill share adds a small volume bonus. */
export function scoreFactors(s: Pick<SupplierScore, "noShowRate" | "onTimeRate" | "disputeRate" | "fillShare">): ScoreFactor[] {
  return [
    { key: "noShows", label: "no-shows", points: -Math.max(0, s.noShowRate - 0.01) * 450 },
    { key: "lateness", label: "late arrivals", points: -Math.max(0, 0.97 - s.onTimeRate) * 250 },
    { key: "disputes", label: "disputes", points: -s.disputeRate * 400 },
    { key: "volume", label: "volume", points: Math.min(5, s.fillShare * 10) },
  ]
}

export function supplierScoreValue(s: Pick<SupplierScore, "noShowRate" | "onTimeRate" | "disputeRate" | "fillShare" | "assignedPast">): number {
  if (s.assignedPast === 0) return 0
  const score = scoreFactors(s).reduce((sum, f) => sum + f.points, 100)
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function supplierScorecards(
  data: Pick<DemoData, "suppliers" | "workers" | "shifts" | "timeEntries" | "requests">,
  today: ISODate
): Map<string, SupplierScore> {
  const todayDate = parseLocal(today)
  const windowStart = toISODate(addDays(todayDate, -(SCORE_WINDOW_DAYS - 1)))
  const thisWeek = weekStartOf(todayDate)
  const weekLabels = Array.from({ length: 6 }, (_, i) => toISODate(addDays(thisWeek, (i - 5) * 7)))
  const firstWeek = weekLabels[0]
  const weekEnd = toISODate(addDays(thisWeek, 6))

  const workerSupplier = new Map(data.workers.map((w) => [w.id, w.supplierId]))
  const reqMap = new Map(data.requests.map((r) => [r.id, r]))
  const shiftMap = new Map(data.shifts.map((s) => [s.id, s]))

  const zeros = () => weekLabels.map(() => 0)
  const weekIndex = (date: ISODate) =>
    date < firstWeek || date > weekEnd ? -1 : Math.floor((parseLocal(date).getTime() - parseLocal(firstWeek).getTime()) / (7 * 86_400_000))
  const blank = (supplierId: string): SupplierScore => ({
    supplierId,
    activePros: 0,
    totalPros: 0,
    filled: 0,
    fillShare: 0,
    assignedPast: 0,
    noShows: 0,
    noShowRate: 0,
    entries: 0,
    onTime: 0,
    onTimeRate: 0,
    disputes: 0,
    disputeRate: 0,
    spend: 0,
    hours: 0,
    weekly: zeros(),
    weeklySpend: zeros(),
    weeklyNoShowRate: zeros(),
    weeklyOnTimeRate: zeros(),
    weekLabels,
    score: 0,
    grade: "C",
  })
  const out = new Map<string, SupplierScore>(data.suppliers.map((s) => [s.id, blank(s.id)]))
  const weekAssigned = new Map(data.suppliers.map((s) => [s.id, zeros()]))
  const weekNoShows = new Map(data.suppliers.map((s) => [s.id, zeros()]))
  const weekEntries = new Map(data.suppliers.map((s) => [s.id, zeros()]))
  const weekOnTime = new Map(data.suppliers.map((s) => [s.id, zeros()]))

  for (const w of data.workers) {
    const row = out.get(w.supplierId)
    if (!row) continue
    row.totalPros++
    if (w.status === "Active") row.activePros++
  }

  let totalFilled = 0
  for (const s of data.shifts) {
    if (!s.workerId) continue
    const supplierId = workerSupplier.get(s.workerId) ?? ""
    const row = out.get(supplierId)
    if (!row) continue
    const filled = FILLED.includes(s.status)
    const idx = weekIndex(s.date)
    const worked = s.status === "Completed" || s.status === "Checked in" || s.status === "No-show"
    if (idx >= 0) {
      if (filled) row.weekly[idx]++
      if (worked && s.date <= today) {
        weekAssigned.get(supplierId)![idx]++
        if (s.status === "No-show") weekNoShows.get(supplierId)![idx]++
      }
    }
    if (s.date < windowStart || s.date > today) continue
    if (filled) {
      row.filled++
      totalFilled++
    }
    if (worked) {
      row.assignedPast++
      if (s.status === "No-show") row.noShows++
    }
  }

  for (const e of data.timeEntries) {
    if (e.date > today) continue
    const supplierId = workerSupplier.get(e.workerId) ?? ""
    const row = out.get(supplierId)
    if (!row) continue
    const req = reqMap.get(e.requestId)
    const backfill = !!shiftMap.get(e.shiftId)?.backfillFor
    let late = e.anomalies.includes("late_arrival")
    if (!late && req && !backfill) {
      const { start } = shiftWindow(e.date, req.startTime, req.endTime)
      late = parseLocal(e.clockIn) > addMinutes(start, 15)
    }
    const onTime = !late || backfill
    const idx = weekIndex(e.date)
    if (idx >= 0) {
      row.weeklySpend[idx] += e.amount
      weekEntries.get(supplierId)![idx]++
      if (onTime) weekOnTime.get(supplierId)![idx]++
    }
    if (e.date < windowStart) continue
    row.entries++
    row.spend += e.amount
    row.hours += e.regularHours + e.overtimeHours
    if (e.dispute || e.status === "Disputed") row.disputes++
    if (onTime) row.onTime++
  }

  for (const row of out.values()) {
    row.fillShare = totalFilled ? row.filled / totalFilled : 0
    row.noShowRate = row.assignedPast ? row.noShows / row.assignedPast : 0
    row.onTimeRate = row.entries ? row.onTime / row.entries : 0
    row.disputeRate = row.entries ? row.disputes / row.entries : 0
    row.spend = round2(row.spend)
    row.hours = round2(row.hours)
    row.weeklySpend = row.weeklySpend.map(round2)
    const assigned = weekAssigned.get(row.supplierId) ?? zeros()
    const noShows = weekNoShows.get(row.supplierId) ?? zeros()
    const entries = weekEntries.get(row.supplierId) ?? zeros()
    const onTime = weekOnTime.get(row.supplierId) ?? zeros()
    row.weeklyNoShowRate = assigned.map((n, i) => (n ? noShows[i] / n : row.noShowRate))
    row.weeklyOnTimeRate = entries.map((n, i) => (n ? onTime[i] / n : row.onTimeRate))
    row.score = supplierScoreValue(row)
    row.grade = gradeFor(row.score)
  }
  return out
}
