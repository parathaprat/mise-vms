import { addDays } from "date-fns"

import { formatDate, parseLocal, toISODate, weekKey } from "@/lib/dates"
import { round2 } from "@/lib/format"
import { entryInScope, invoiceInScope, requestInScope, tipBatchInScope, type Lookups } from "@/lib/selectors"
import type {
  Activity,
  Invoice,
  ISODate,
  Persona,
  RateCardEntry,
  Shift,
  ShiftStatus,
  TimeEntry,
  TimeEntryStatus,
  TipBatch,
  Venue,
} from "@/lib/types"

export type RangeKey = "4w" | "8w"

export const RANGE_OPTIONS: { value: RangeKey; label: string; weeks: number }[] = [
  { value: "4w", label: "4w", weeks: 4 },
  { value: "8w", label: "8w", weeks: 8 },
]

export function isRangeKey(value: string | null): value is RangeKey {
  return value === "4w" || value === "8w"
}

export const FILL_TARGET = 0.95

/** Minutes of manual Fieldglass handling assumed per item. Planning assumptions, not measurements. */
export const OPS_MINUTES = {
  workOrders: 6,
  timesheets: 1.5,
  tipLines: 4,
  paymentLines: 2,
  rateChanges: 20,
} as const

export type OpsKey = keyof typeof OPS_MINUTES

export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
export const OTHER_COLOR = "color-mix(in oklch, var(--muted-foreground) 40%, transparent)"

const APPROVED_STATUSES = new Set<TimeEntryStatus>(["Approved", "Auto-approved", "Invoiced"])
const STARTED_STATUSES = new Set<ShiftStatus>(["Checked in", "Completed", "No-show"])
const MAX_SERIES = 5

export interface Trend {
  label: string
  direction: "up" | "down" | "flat"
  good: boolean
}

export interface WeekStat {
  week: ISODate
  label: string
  current: boolean
  labor: number
  tips: number
  spend: number
  hours: number
  shifts: number
  slots: number
  filled: number
  fillRate: number | null
  worked: number
  noShows: number
  noShowRate: number | null
  backfilled: number
  late: number
  disputes: number
}

export interface SeriesDef {
  key: string
  label: string
  color: string
}

export type SpendRow = { week: ISODate; label: string; total: number; tips: number } & Record<string, number | string>

export interface CyclePoint {
  week: ISODate
  label: string
  hours: number
  count: number
  phase: "pre" | "post"
  fill: string
}

export interface CycleStats {
  points: CyclePoint[]
  preMedian: number | null
  postMedian: number | null
  reduction: number | null
  preCount: number
  postCount: number
  within24: number | null
  autoShare: number | null
  cutoverDate: ISODate
  markerWeek?: ISODate
}

export interface FillPoint {
  week: ISODate
  label: string
  rate: number | null
  filled: number
  slots: number
  current: boolean
}

export interface FillLaggard {
  id: string
  label: string
  rate: number
  open: number
}

export interface PositionPoint {
  id: string
  label: string
  hours: number
  share: number
}

export interface MixSlice {
  key: string
  label: string
  hours: number
  share: number
  color: string
  fill: string
}

export interface QualityPoint {
  week: ISODate
  label: string
  noShows: number
  late: number
  disputes: number
}

export interface OpsItem {
  key: OpsKey
  label: string
  detail: string
  count: number
  minutesEach: number
  hours: number
}

export interface OpsSaved {
  since: ISODate
  items: OpsItem[]
  totalHours: number
}

export interface TopRow {
  id: string
  label: string
  venue?: Venue
  spend: number
  labor: number
  tips: number
  hours: number
  slots: number
  filled: number
  fillRate: number | null
  avgBill: number | null
}

export type PrimaryDimension = "venue" | "costCenter"
export type MixDimension = "supplier" | "venue" | "costCenter"

export interface Kpis {
  spend: number
  labor: number
  tips: number
  hours: number
  shifts: number
  pros: number
  slots: number
  filled: number
  fillRate: number | null
  worked: number
  noShows: number
  backfilled: number
  noShowRate: number | null
  trends: { spend?: Trend; hours?: Trend; fill?: Trend; noShow?: Trend }
}

export interface Insights {
  range: { key: RangeKey; weeks: number; start: ISODate; end: ISODate; historyStart: ISODate; clipped: boolean }
  weeks: WeekStat[]
  kpis: Kpis
  spend: { dimension: PrimaryDimension; series: SeriesDef[]; rows: SpendRow[]; total: number; tips: number }
  cycle: CycleStats
  fill: { points: FillPoint[]; markerWeek?: ISODate; rate: number | null; laggard?: FillLaggard }
  positions: PositionPoint[]
  mix: { dimension: MixDimension; slices: MixSlice[]; total: number }
  quality: { points: QualityPoint[]; totals: { noShows: number; late: number; disputes: number } }
  ops: OpsSaved
  top: { primaryDimension: PrimaryDimension; primary: TopRow[]; positions: TopRow[] }
}

export interface InsightsInput {
  persona: Persona
  lookups: Lookups
  shifts: Shift[]
  timeEntries: TimeEntry[]
  tipBatches: TipBatch[]
  invoices: Invoice[]
  activities: Activity[]
  rateCards: RateCardEntry[]
  cutoverDate: ISODate
  today: ISODate
  range: RangeKey
  venueId: string
}

interface WeekAcc {
  labor: number
  tips: number
  hours: number
  shifts: number
  slots: number
  filled: number
  worked: number
  noShows: number
  backfilled: number
  late: number
  disputes: number
}

interface TopAcc {
  labor: number
  tips: number
  hours: number
  slots: number
  filled: number
}

const emptyWeek = (): WeekAcc => ({
  labor: 0,
  tips: 0,
  hours: 0,
  shifts: 0,
  slots: 0,
  filled: 0,
  worked: 0,
  noShows: 0,
  backfilled: 0,
  late: 0,
  disputes: 0,
})

const emptyTop = (): TopAcc => ({ labor: 0, tips: 0, hours: 0, slots: 0, filled: 0 })

function getOr<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key)
  if (value === undefined) {
    value = create()
    map.set(key, value)
  }
  return value
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function average(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0
}

function volumeTrend(current: number[], previous: number[], goodWhenUp: boolean): Trend | undefined {
  if (current.length === 0 || previous.length === 0) return undefined
  const prev = average(previous)
  if (prev <= 0) return undefined
  const change = average(current) / prev - 1
  const direction = Math.abs(change) < 0.005 ? "flat" : change > 0 ? "up" : "down"
  return {
    label: `${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(1)}%`,
    direction,
    good: direction === "flat" || (direction === "up") === goodWhenUp,
  }
}

function rateTrend(current: number | null, previous: number | null, goodWhenUp: boolean): Trend | undefined {
  if (current === null || previous === null) return undefined
  const diff = (current - previous) * 100
  const direction = Math.abs(diff) < 0.05 ? "flat" : diff > 0 ? "up" : "down"
  return {
    label: `${diff >= 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pts`,
    direction,
    good: direction === "flat" || (direction === "up") === goodWhenUp,
  }
}

/** "14h", "45m", "5.5d", compact durations for approval cycle times. */
export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "–"
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`
  if (hours < 10) return `${(Math.round(hours * 10) / 10).toString()}h`
  if (hours < 48) return `${Math.round(hours)}h`
  return `${(Math.round((hours / 24) * 10) / 10).toString()}d`
}

export function formatDurationLong(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "–"
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes`
  if (hours < 48) {
    const h = hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours)
    return `${h} ${h === 1 ? "hour" : "hours"}`
  }
  const d = Math.round((hours / 24) * 10) / 10
  return `${d} days`
}

export function computeInsights(input: InsightsInput): Insights {
  const { persona, lookups, cutoverDate, today, range, venueId } = input
  const supplierId = persona.id === "supplier" ? persona.supplierId : undefined
  const weeksN = range === "8w" ? 8 : 4

  const weekCache = new Map<string, ISODate>()
  const weekOf = (value: string): ISODate => {
    const date = value.slice(0, 10)
    let week = weekCache.get(date)
    if (!week) {
      week = weekKey(date)
      weekCache.set(date, week)
    }
    return week
  }

  const currentWeek = weekOf(today)
  const currentWeekDate = parseLocal(currentWeek)
  const rangeWeekKeys = Array.from({ length: weeksN }, (_, i) => toISODate(addDays(currentWeekDate, (i - weeksN + 1) * 7)))
  const prevWeekKeys = Array.from({ length: weeksN }, (_, i) => toISODate(addDays(currentWeekDate, (i - 2 * weeksN + 1) * 7)))
  const rangeSet = new Set(rangeWeekKeys)
  const opsSince = rangeWeekKeys[0] > cutoverDate ? rangeWeekKeys[0] : cutoverDate
  const inOpsWindow = (at?: string) => {
    if (!at) return false
    const date = at.slice(0, 10)
    return date >= opsSince && date <= today
  }
  const venueMatches = (id: string) => venueId === "all" || id === venueId
  const primaryDimension: PrimaryDimension = venueId === "all" ? "venue" : "costCenter"
  const primaryKey = (vId: string, ccId: string) => (primaryDimension === "venue" ? vId : ccId)
  const mixDimension: MixDimension = supplierId ? (venueId === "all" ? "venue" : "costCenter") : "supplier"

  const weeks = new Map<ISODate, WeekAcc>()
  const seriesByWeek = new Map<ISODate, Map<string, number>>()
  const seriesTotals = new Map<string, number>()
  const primaryTop = new Map<string, TopAcc>()
  const positionTop = new Map<string, TopAcc>()
  const mix = new Map<string, number>()
  const pros = new Set<string>()
  const cycleByWeek = new Map<ISODate, number[]>()
  const pre: number[] = []
  const post: number[] = []
  let postWithin24 = 0
  let postAuto = 0
  const workerDayRequest = new Map<string, string>()
  const workOrders = new Set<string>()
  let opsTimesheets = 0
  let opsTipLines = 0
  let opsPaymentLines = 0

  const addSeries = (week: ISODate, key: string, amount: number) => {
    const byKey = getOr(seriesByWeek, week, () => new Map<string, number>())
    byKey.set(key, (byKey.get(key) ?? 0) + amount)
    seriesTotals.set(key, (seriesTotals.get(key) ?? 0) + amount)
  }

  // Time entries: spend, hours, lateness, timesheet disputes, approval cycle time.
  for (const e of input.timeEntries) {
    const req = lookups.requests.get(e.requestId)
    if (!req || !venueMatches(req.venueId) || !entryInScope(e, lookups, persona)) continue
    const week = weekOf(e.date)
    const acc = getOr(weeks, week, emptyWeek)
    const hrs = e.regularHours + e.overtimeHours
    acc.labor += e.amount
    acc.hours += hrs
    if (hrs > 0) acc.shifts++
    if (e.anomalies.includes("late_arrival")) acc.late++
    if (e.dispute) getOr(weeks, weekOf(e.dispute.at), emptyWeek).disputes++
    workerDayRequest.set(`${e.workerId}|${e.date}`, req.id)

    if (rangeSet.has(week)) {
      if (hrs > 0) pros.add(e.workerId)
      const key = primaryKey(req.venueId, req.costCenterId)
      addSeries(week, key, e.amount)
      const p = getOr(primaryTop, key, emptyTop)
      p.labor += e.amount
      p.hours += hrs
      const q = getOr(positionTop, req.positionId, emptyTop)
      q.labor += e.amount
      q.hours += hrs
      const mixKey =
        mixDimension === "supplier"
          ? (lookups.workers.get(e.workerId)?.supplierId ?? "unknown")
          : mixDimension === "venue"
            ? req.venueId
            : req.costCenterId
      mix.set(mixKey, (mix.get(mixKey) ?? 0) + hrs)
    }

    if (e.approvedAt && e.clockOut && APPROVED_STATUSES.has(e.status)) {
      const elapsed = (parseLocal(e.approvedAt).getTime() - parseLocal(e.clockOut).getTime()) / 3_600_000
      if (Number.isFinite(elapsed) && elapsed >= 0) {
        getOr(cycleByWeek, week, () => []).push(elapsed)
        if (e.date < cutoverDate) pre.push(elapsed)
        else {
          post.push(elapsed)
          if (elapsed <= 24) postWithin24++
          if (e.approvedBy?.startsWith("Policy")) postAuto++
        }
      }
    }
    if (e.status !== "Pending" && inOpsWindow(e.approvedAt)) opsTimesheets++
  }

  // Shifts: fill, no-shows, backfills, work orders.
  let historyStart = ""
  for (const s of input.shifts) {
    if (!historyStart || s.date < historyStart) historyStart = s.date
    const req = lookups.requests.get(s.requestId)
    if (!req || req.state !== "active" || !venueMatches(req.venueId) || !requestInScope(req, persona)) continue
    const own = !supplierId || (!!s.workerId && lookups.workers.get(s.workerId)?.supplierId === supplierId)
    if (s.workerId && own && inOpsWindow(s.assignedAt)) workOrders.add(`${s.requestId}|${s.workerId}`)
    if (s.date > today || s.status === "Cancelled") continue
    const week = weekOf(s.date)
    const acc = getOr(weeks, week, emptyWeek)
    const counted = !s.backfillFor
    const filled = s.status !== "No-show" && !!s.workerId
    if (counted) acc.slots++
    if (filled) acc.filled++
    if (own && s.workerId && STARTED_STATUSES.has(s.status)) acc.worked++
    if (own && s.status === "No-show") acc.noShows++
    if (own && s.backfillFor && s.workerId) acc.backfilled++
    if (rangeSet.has(week)) {
      const p = getOr(primaryTop, primaryKey(req.venueId, req.costCenterId), emptyTop)
      const q = getOr(positionTop, req.positionId, emptyTop)
      if (counted) {
        p.slots++
        q.slots++
      }
      if (filled) {
        p.filled++
        q.filled++
      }
    }
  }
  historyStart = historyStart ? weekOf(historyStart) : currentWeek

  // Approved tips count toward spend; lines are attributed to the Pro's position that day.
  for (const b of input.tipBatches) {
    if (b.status !== "Approved" && b.status !== "Paid") continue
    if (!venueMatches(b.venueId) || !tipBatchInScope(b, lookups, persona)) continue
    const lines = supplierId ? b.lines.filter((l) => lookups.workers.get(l.workerId)?.supplierId === supplierId) : b.lines
    if (lines.length === 0) continue
    const amount = lines.reduce((s, l) => s + l.amount, 0)
    const week = weekOf(b.date)
    getOr(weeks, week, emptyWeek).tips += amount
    if (rangeSet.has(week)) {
      const key = primaryKey(b.venueId, b.costCenterId)
      addSeries(week, key, amount)
      getOr(primaryTop, key, emptyTop).tips += amount
      for (const l of lines) {
        const reqId = workerDayRequest.get(`${l.workerId}|${b.date}`)
        const req = reqId ? lookups.requests.get(reqId) : undefined
        if (req) getOr(positionTop, req.positionId, emptyTop).tips += l.amount
      }
    }
    if (inOpsWindow(b.approvedAt)) opsTipLines += lines.length
  }

  for (const inv of input.invoices) {
    if (!venueMatches(inv.venueId) || !invoiceInScope(inv, persona)) continue
    for (const d of inv.disputes) getOr(weeks, weekOf(d.at), emptyWeek).disputes++
    if (inv.status === "Paid" && inOpsWindow(inv.paidAt)) opsPaymentLines += inv.lines.length
  }

  const rateActivities = input.activities.filter(
    (a) => a.kind === "rate" && /published|approved rate revision/i.test(a.text) && inOpsWindow(a.at)
  ).length
  const rateCardChanges = input.rateCards.filter((r) => r.effectiveFrom >= opsSince && r.effectiveFrom <= today).length
  const opsRateChanges = Math.max(rateActivities, rateCardChanges)

  // Weekly stats ----------------------------------------------------------------
  const toWeekStat = (week: ISODate): WeekStat => {
    const acc = weeks.get(week) ?? emptyWeek()
    const filled = Math.min(acc.filled, acc.slots)
    return {
      week,
      label: formatDate(week, "MMM d"),
      current: week === currentWeek,
      labor: round2(acc.labor),
      tips: round2(acc.tips),
      spend: round2(acc.labor + acc.tips),
      hours: round2(acc.hours),
      shifts: acc.shifts,
      slots: acc.slots,
      filled,
      fillRate: acc.slots > 0 ? filled / acc.slots : null,
      worked: acc.worked,
      noShows: acc.noShows,
      noShowRate: acc.worked > 0 ? acc.noShows / acc.worked : null,
      backfilled: acc.backfilled,
      late: acc.late,
      disputes: acc.disputes,
    }
  }
  const chartWeekKeys = rangeWeekKeys.filter((w) => w >= historyStart)
  if (chartWeekKeys.length === 0) chartWeekKeys.push(currentWeek)
  const weekStats = chartWeekKeys.map(toWeekStat)
  const prevStats = prevWeekKeys.filter((w) => w >= historyStart).map(toWeekStat)

  // KPIs ------------------------------------------------------------------------
  const total = (list: WeekStat[], pick: (w: WeekStat) => number) => list.reduce((s, w) => s + pick(w), 0)
  const labor = total(weekStats, (w) => w.labor)
  const tips = total(weekStats, (w) => w.tips)
  const slots = total(weekStats, (w) => w.slots)
  const filled = total(weekStats, (w) => w.filled)
  const worked = total(weekStats, (w) => w.worked)
  const noShows = total(weekStats, (w) => w.noShows)
  const fillRate = slots > 0 ? filled / slots : null
  const noShowRate = worked > 0 ? noShows / worked : null
  const prevSlots = total(prevStats, (w) => w.slots)
  const prevWorked = total(prevStats, (w) => w.worked)
  const prevFillRate = prevSlots > 0 ? total(prevStats, (w) => w.filled) / prevSlots : null
  const prevNoShowRate = prevWorked > 0 ? total(prevStats, (w) => w.noShows) / prevWorked : null
  const complete = weekStats.filter((w) => !w.current)
  const kpis: Kpis = {
    spend: round2(labor + tips),
    labor: round2(labor),
    tips: round2(tips),
    hours: round2(total(weekStats, (w) => w.hours)),
    shifts: total(weekStats, (w) => w.shifts),
    pros: pros.size,
    slots,
    filled,
    fillRate,
    worked,
    noShows,
    backfilled: total(weekStats, (w) => w.backfilled),
    noShowRate,
    trends: {
      spend: volumeTrend(
        complete.map((w) => w.spend),
        prevStats.map((w) => w.spend),
        !!supplierId
      ),
      hours: volumeTrend(
        complete.map((w) => w.hours),
        prevStats.map((w) => w.hours),
        true
      ),
      fill: rateTrend(fillRate, prevFillRate, true),
      noShow: rateTrend(noShowRate, prevNoShowRate, false),
    },
  }

  // Spend by series -------------------------------------------------------------
  const labelForPrimary = (key: string) =>
    primaryDimension === "venue"
      ? (lookups.venues.get(key)?.shortName ?? "Unknown venue")
      : (lookups.costCenters.get(key)?.name ?? "Unassigned")
  const ranked = [...seriesTotals.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const topKeys = ranked.slice(0, MAX_SERIES).map(([key]) => key)
  const hasOther = ranked.length > MAX_SERIES
  const series: SeriesDef[] = topKeys.map((key, i) => ({ key, label: labelForPrimary(key), color: SERIES_COLORS[i] }))
  if (hasOther) series.push({ key: "other", label: "Other", color: OTHER_COLOR })
  const topKeySet = new Set(topKeys)
  const spendRows: SpendRow[] = weekStats.map((w) => {
    const row = { week: w.week, label: w.label, total: w.spend, tips: w.tips } as SpendRow
    for (const key of topKeys) row[key] = 0
    if (hasOther) row.other = 0
    for (const [key, amount] of seriesByWeek.get(w.week) ?? []) {
      const target = topKeySet.has(key) ? key : "other"
      if (target === "other" && !hasOther) continue
      row[target] = round2(Number(row[target] ?? 0) + amount)
    }
    return row
  })

  // Approval cycle time (all history, so the cutover is always visible) ---------
  const cutoverWeek = weekOf(cutoverDate)
  const cyclePoints: CyclePoint[] = [...cycleByWeek.entries()]
    .filter(([week, list]) => week <= currentWeek && list.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, list]) => {
      const phase = week < cutoverWeek ? "pre" : "post"
      return {
        week,
        label: formatDate(week, "MMM d"),
        hours: round2(median(list) ?? 0),
        count: list.length,
        phase,
        fill: phase === "pre" ? "var(--color-pre)" : "var(--color-post)",
      }
    })
  const preMedian = median(pre)
  const postMedian = median(post)
  const firstPost = cyclePoints.find((p) => p.phase === "post")
  const cycle: CycleStats = {
    points: cyclePoints,
    preMedian,
    postMedian,
    reduction: preMedian !== null && postMedian !== null && preMedian > 0 ? 1 - postMedian / preMedian : null,
    preCount: pre.length,
    postCount: post.length,
    within24: post.length ? postWithin24 / post.length : null,
    autoShare: post.length ? postAuto / post.length : null,
    cutoverDate,
    markerWeek: firstPost && cyclePoints.some((p) => p.phase === "pre") ? firstPost.week : undefined,
  }

  // Fill ------------------------------------------------------------------------
  const fillPoints: FillPoint[] = weekStats.map((w) => ({
    week: w.week,
    label: w.label,
    rate: w.fillRate === null ? null : round2(w.fillRate * 100),
    filled: w.filled,
    slots: w.slots,
    current: w.current,
  }))
  const fillMarker = chartWeekKeys.includes(cutoverWeek) && chartWeekKeys[0] !== cutoverWeek ? cutoverWeek : undefined

  // Hours by position -----------------------------------------------------------
  const totalHours = kpis.hours
  const positions: PositionPoint[] = [...positionTop.entries()]
    .filter(([, v]) => v.hours > 0)
    .sort((a, b) => b[1].hours - a[1].hours)
    .slice(0, 8)
    .map(([id, v]) => ({
      id,
      label: lookups.positions.get(id)?.title ?? "Other",
      hours: round2(v.hours),
      share: totalHours > 0 ? v.hours / totalHours : 0,
    }))

  // Mix -------------------------------------------------------------------------
  const mixLabel = (key: string) => {
    if (mixDimension === "supplier") return lookups.suppliers.get(key)?.shortName ?? "Other"
    if (mixDimension === "venue") return lookups.venues.get(key)?.shortName ?? "Other"
    return lookups.costCenters.get(key)?.name ?? "Other"
  }
  const mixRanked = [...mix.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const mixTotal = mixRanked.reduce((s, [, v]) => s + v, 0)
  const mixTop = mixRanked.slice(0, MAX_SERIES)
  const mixRest = mixRanked.slice(MAX_SERIES).reduce((s, [, v]) => s + v, 0)
  const slices: MixSlice[] = mixTop.map(([key, value], i) => ({
    key,
    label: mixLabel(key),
    hours: round2(value),
    share: mixTotal > 0 ? value / mixTotal : 0,
    color: SERIES_COLORS[i],
    fill: `var(--color-${key})`,
  }))
  if (mixRest > 0) {
    slices.push({
      key: "other",
      label: "Other",
      hours: round2(mixRest),
      share: mixTotal > 0 ? mixRest / mixTotal : 0,
      color: OTHER_COLOR,
      fill: "var(--color-other)",
    })
  }

  // Quality ---------------------------------------------------------------------
  const qualityPoints: QualityPoint[] = weekStats.map((w) => ({
    week: w.week,
    label: w.label,
    noShows: w.noShows,
    late: w.late,
    disputes: w.disputes,
  }))

  // Ops time saved --------------------------------------------------------------
  const opsCounts: Record<OpsKey, number> = {
    workOrders: workOrders.size,
    timesheets: opsTimesheets,
    tipLines: opsTipLines,
    paymentLines: opsPaymentLines,
    rateChanges: opsRateChanges,
  }
  const opsMeta: Record<OpsKey, { label: string; detail: string }> = {
    workOrders: { label: "Work orders created automatically", detail: "One per Pro per request, opened the moment a shift is filled" },
    timesheets: { label: "Timesheets approved in Mise", detail: "Bulk review or the 72-hour policy instead of one-by-one sign-off" },
    tipLines: { label: "Tip lines distributed", detail: "Split by hours and invoiced automatically instead of keyed per Pro" },
    paymentLines: { label: "Invoice lines matched to payments", detail: "Remittance references Mise invoice IDs, so nothing is matched by hand" },
    rateChanges: { label: "Rate revisions applied", detail: "Upcoming requests repriced automatically instead of revised one at a time" },
  }
  const opsItems: OpsItem[] = (Object.keys(OPS_MINUTES) as OpsKey[]).map((key) => ({
    key,
    label: opsMeta[key].label,
    detail: opsMeta[key].detail,
    count: opsCounts[key],
    minutesEach: OPS_MINUTES[key],
    hours: (opsCounts[key] * OPS_MINUTES[key]) / 60,
  }))

  // Top tables ------------------------------------------------------------------
  const toTopRow = (id: string, acc: TopAcc, label: string, venue?: Venue): TopRow => {
    const fillCount = Math.min(acc.filled, acc.slots)
    return {
      id,
      label,
      venue,
      spend: round2(acc.labor + acc.tips),
      labor: round2(acc.labor),
      tips: round2(acc.tips),
      hours: round2(acc.hours),
      slots: acc.slots,
      filled: fillCount,
      fillRate: acc.slots > 0 ? fillCount / acc.slots : null,
      avgBill: acc.hours > 0 ? acc.labor / acc.hours : null,
    }
  }
  const byActivity = (a: TopRow, b: TopRow) => b.spend - a.spend || b.slots - a.slots
  const primaryRows = [...primaryTop.entries()]
    .map(([id, acc]) =>
      toTopRow(id, acc, labelForPrimary(id), primaryDimension === "venue" ? lookups.venues.get(id) : undefined)
    )
    .filter((r) => r.spend > 0 || r.slots > 0)
    .sort(byActivity)
    .slice(0, 8)
  const positionRows = [...positionTop.entries()]
    .map(([id, acc]) => toTopRow(id, acc, lookups.positions.get(id)?.title ?? "Other"))
    .filter((r) => r.spend > 0 || r.slots > 0)
    .sort(byActivity)
    .slice(0, 8)

  const fillCandidates = [...primaryTop.entries()]
    .filter(([, acc]) => acc.slots >= 8)
    .map(([id, acc]) => ({ id, rate: Math.min(acc.filled, acc.slots) / acc.slots, open: acc.slots - Math.min(acc.filled, acc.slots) }))
    .sort((a, b) => a.rate - b.rate)
  const worstFill = fillCandidates[0]
  const laggard: FillLaggard | undefined =
    fillCandidates.length > 1 && worstFill.rate < FILL_TARGET
      ? { id: worstFill.id, label: labelForPrimary(worstFill.id), rate: worstFill.rate, open: worstFill.open }
      : undefined

  return {
    range: {
      key: range,
      weeks: weeksN,
      start: chartWeekKeys[0],
      end: today,
      historyStart,
      clipped: rangeWeekKeys[0] < historyStart,
    },
    weeks: weekStats,
    kpis,
    spend: { dimension: primaryDimension, series, rows: spendRows, total: kpis.spend, tips: kpis.tips },
    cycle,
    fill: { points: fillPoints, markerWeek: fillMarker, rate: fillRate, laggard },
    positions,
    mix: { dimension: mixDimension, slices, total: round2(mixTotal) },
    quality: {
      points: qualityPoints,
      totals: {
        noShows,
        late: total(weekStats, (w) => w.late),
        disputes: total(weekStats, (w) => w.disputes),
      },
    },
    ops: {
      since: opsSince,
      items: opsItems,
      totalHours: opsItems.reduce((s, item) => s + item.hours, 0),
    },
    top: { primaryDimension, primary: primaryRows, positions: positionRows },
  }
}

export interface VenueOption {
  id: string
  label: string
  brand: string
}

/** Venues the persona can filter to: assigned venues, or every venue with work in scope. */
export function venueOptionsFor(persona: Persona, lookups: Lookups): VenueOption[] {
  const ids = new Set<string>()
  if (persona.venueIds !== "all" && persona.id !== "supplier") {
    for (const id of persona.venueIds) ids.add(id)
  } else if (persona.id === "supplier") {
    for (const req of lookups.requests.values()) if (requestInScope(req, persona)) ids.add(req.venueId)
  } else {
    for (const id of lookups.venues.keys()) ids.add(id)
  }
  return [...ids]
    .map((id) => lookups.venues.get(id))
    .filter((v): v is Venue => !!v)
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name))
    .map((v) => ({ id: v.id, label: v.name, brand: v.brand }))
}
