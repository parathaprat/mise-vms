import { addDays, addMinutes, isValid } from "date-fns"

import { daysFromToday, formatDate, parseLocal, shiftWindow, toISODate, weekStartOf } from "@/lib/dates"
import { computeFill, requestInScope, venueInScope, type FillStats, type Lookups, type RequestView } from "@/lib/selectors"
import type { Activity, ActivityKind, ISODate, Persona, Shift, StaffingRequest, Venue, Worker } from "@/lib/types"

export type ScheduleMode = "week" | "live"

export const SERVICE_LABEL = "Dining service"

/** A Confirmed Pro becomes "late" this long after the scheduled start without a check-in. */
export const LATE_GRACE_MINUTES = 15
/** Backfills are dispatched mid-shift; they only count as late once well past their ETA. */
export const BACKFILL_GRACE_MINUTES = 45
const BACKFILL_ETA_MINUTES = 30

export function isISODate(value: string | null | undefined): value is ISODate {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseLocal(value))
}

export function shiftISODate(date: ISODate, days: number): ISODate {
  return toISODate(addDays(parseLocal(date), days))
}

export function weekDates(date: ISODate): ISODate[] {
  const monday = weekStartOf(parseLocal(date))
  return Array.from({ length: 7 }, (_, i) => toISODate(addDays(monday, i)))
}

function clockParts(d: Date) {
  const h = d.getHours()
  const m = d.getMinutes()
  const hour = h % 12 === 0 ? 12 : h % 12
  return { text: m === 0 ? `${hour}` : `${hour}:${String(m).padStart(2, "0")}`, meridiem: h >= 12 ? "PM" : "AM" }
}

/** "4:30–11:30 PM", "9 AM–4:30 PM", "10 PM–2 AM". */
export function compactTimeRange(start: Date, end: Date): string {
  const s = clockParts(start)
  const e = clockParts(end)
  const sameHalf = s.meridiem === e.meridiem && end.getTime() - start.getTime() < 12 * 3_600_000
  return sameHalf ? `${s.text}–${e.text} ${e.meridiem}` : `${s.text} ${s.meridiem}–${e.text} ${e.meridiem}`
}

export function compactClock(d: Date): string {
  const p = clockParts(d)
  return `${p.text} ${p.meridiem}`
}

/** "Today, Oct 12", "Tomorrow, Oct 13", "Fri, Oct 16". */
export function dayLabel(date: ISODate, now: Date): string {
  const diff = daysFromToday(date, now)
  const short = formatDate(date, "MMM d")
  if (diff === 0) return `Today, ${short}`
  if (diff === 1) return `Tomorrow, ${short}`
  if (diff === -1) return `Yesterday, ${short}`
  return formatDate(date, "EEE, MMM d")
}

export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h}h ${rest}m` : `${h}h`
}

// Day requests & event blocks ---------------------------------------------------

export interface DayRequest {
  key: string
  view: RequestView
  date: ISODate
  shifts: Shift[]
  fill: FillStats
  start: Date
  end: Date
  /** Scheduled payable hours across every slot that day. */
  hours: number
  cost: number
  tentative: boolean
}

export interface DayRequestOptions {
  venueId: string
  includeTentative: boolean
}

export function dayRequests(views: RequestView[], lookups: Lookups, date: ISODate, opts: DayRequestOptions): DayRequest[] {
  const out: DayRequest[] = []
  for (const view of views) {
    const { req } = view
    if (req.state === "cancelled" || !req.dates.includes(date)) continue
    if (opts.venueId !== "all" && req.venueId !== opts.venueId) continue
    const tentative = req.state === "pending" || req.state === "draft"
    if (tentative && !opts.includeTentative) continue
    const shifts = (lookups.shiftsByRequest.get(req.id) ?? []).filter((s) => s.date === date)
    const fill = computeFill(req, shifts)
    if (!tentative && fill.total === 0) continue
    const slots = tentative ? Math.max(fill.total, req.headcount) : fill.total
    if (tentative) fill.total = slots
    const { start, end } = shiftWindow(date, req.startTime, req.endTime)
    const hours = slots * view.hoursPerShift
    out.push({ key: `${req.id}|${date}`, view, date, shifts, fill, start, end, hours, cost: hours * req.billRate, tentative })
  }
  return out.sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.view.position.title.localeCompare(b.view.position.title) || a.view.req.id.localeCompare(b.view.req.id)
  )
}

export interface EventBlock {
  key: string
  date: ISODate
  venue: Venue
  name: string
  isService: boolean
  requests: DayRequest[]
  start: Date
  end: Date
  /** Staffing across active requests only. */
  fill: FillStats
  cost: number
  pendingCost: number
  hours: number
  tentative: boolean
  pendingCount: number
  draftOnly: boolean
}

function emptyFill(): FillStats {
  return { total: 0, filled: 0, open: 0, checkedIn: 0, completed: 0, noShows: 0, cancelled: 0 }
}

function addFill(into: FillStats, f: FillStats) {
  into.total += f.total
  into.filled += f.filled
  into.open += f.open
  into.checkedIn += f.checkedIn
  into.completed += f.completed
  into.noShows += f.noShows
  into.cancelled += f.cancelled
}

export function groupEvents(requests: DayRequest[]): EventBlock[] {
  const map = new Map<string, EventBlock>()
  for (const r of requests) {
    const { req, venue } = r.view
    const name = req.eventName?.trim() || SERVICE_LABEL
    const key = `${venue.id}|${r.date}|${name}`
    let block = map.get(key)
    if (!block) {
      block = {
        key,
        date: r.date,
        venue,
        name,
        isService: !req.eventName,
        requests: [],
        start: r.start,
        end: r.end,
        fill: emptyFill(),
        cost: 0,
        pendingCost: 0,
        hours: 0,
        tentative: true,
        pendingCount: 0,
        draftOnly: true,
      }
      map.set(key, block)
    }
    block.requests.push(r)
    if (r.start < block.start) block.start = r.start
    if (r.end > block.end) block.end = r.end
    if (r.tentative) {
      block.pendingCount++
      block.pendingCost += r.cost
      if (req.state !== "draft") block.draftOnly = false
    } else {
      block.tentative = false
      block.draftOnly = false
      addFill(block.fill, r.fill)
      block.cost += r.cost
      block.hours += r.hours
    }
  }
  return [...map.values()].sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.venue.shortName.localeCompare(b.venue.shortName) || a.name.localeCompare(b.name)
  )
}

export type BlockPhase = "tentative" | "done" | "live" | "open" | "filled"

export function blockPhase(block: Pick<EventBlock, "tentative" | "start" | "end" | "fill">, now: Date): BlockPhase {
  if (block.tentative) return "tentative"
  if (now >= block.end) return "done"
  if (block.fill.open > 0) return "open"
  if (now >= block.start) return "live"
  return "filled"
}

export interface WeekSummary {
  slots: number
  filled: number
  open: number
  cost: number
  pendingCost: number
  pendingSlots: number
  events: number
  venues: number
  onsite: number
}

export function summarizeWeek(days: { requests: DayRequest[]; blocks: EventBlock[] }[], now: Date): WeekSummary {
  const summary: WeekSummary = { slots: 0, filled: 0, open: 0, cost: 0, pendingCost: 0, pendingSlots: 0, events: 0, venues: 0, onsite: 0 }
  const venues = new Set<string>()
  for (const day of days) {
    for (const r of day.requests) {
      if (r.tentative) {
        summary.pendingCost += r.cost
        summary.pendingSlots += r.fill.total
        continue
      }
      summary.slots += r.fill.total
      summary.filled += r.fill.filled
      summary.cost += r.cost
      summary.onsite += r.fill.checkedIn
      if (r.end > now) summary.open += r.fill.open
      venues.add(r.view.venue.id)
    }
    summary.events += day.blocks.filter((b) => !b.tentative).length
  }
  summary.venues = venues.size
  return summary
}

// Live board --------------------------------------------------------------------

export type LiveState = "open" | "confirmed" | "enroute" | "late" | "onsite" | "completed" | "noshow"

export function shiftState(shift: Shift, req: Pick<StaffingRequest, "startTime" | "endTime">, now: Date): LiveState | "cancelled" {
  switch (shift.status) {
    case "Cancelled":
      return "cancelled"
    case "Open":
      return "open"
    case "Checked in":
      return "onsite"
    case "Completed":
      return "completed"
    case "No-show":
      return "noshow"
  }
  if (!shift.workerId) return "open"
  if (shift.backfillFor) {
    if (!shift.assignedAt) return "enroute"
    return now > addMinutes(parseLocal(shift.assignedAt), BACKFILL_GRACE_MINUTES) ? "late" : "enroute"
  }
  const { start } = shiftWindow(shift.date, req.startTime, req.endTime)
  return now > addMinutes(start, LATE_GRACE_MINUTES) ? "late" : "confirmed"
}

export function minutesLate(shift: Shift, req: Pick<StaffingRequest, "startTime" | "endTime">, now: Date): number {
  const due =
    shift.backfillFor && shift.assignedAt
      ? addMinutes(parseLocal(shift.assignedAt), BACKFILL_ETA_MINUTES)
      : shiftWindow(shift.date, req.startTime, req.endTime).start
  return Math.max(0, Math.round((now.getTime() - due.getTime()) / 60_000))
}

export interface LiveSlot {
  key: string
  shift: Shift
  /** The backfill when the original Pro no-showed and Mise found a replacement. */
  effective: Shift
  backfill?: Shift
  state: LiveState
}

export function liveSlots(shifts: Shift[], req: StaffingRequest, now: Date): LiveSlot[] {
  const backfills = new Map<string, Shift>()
  for (const s of shifts) if (s.backfillFor && s.status !== "Cancelled") backfills.set(s.backfillFor, s)
  const out: LiveSlot[] = []
  for (const s of shifts) {
    if (s.backfillFor || s.status === "Cancelled") continue
    const backfill = s.status === "No-show" ? backfills.get(s.id) : undefined
    const effective = backfill ?? s
    const state = shiftState(effective, req, now)
    out.push({ key: s.id, shift: s, effective, backfill, state: state === "cancelled" ? "noshow" : state })
  }
  return out.sort((a, b) => a.shift.slot - b.shift.slot)
}

export type LiveCounts = Record<LiveState, number>

export function emptyCounts(): LiveCounts {
  return { open: 0, confirmed: 0, enroute: 0, late: 0, onsite: 0, completed: 0, noshow: 0 }
}

export function countSlots(slots: LiveSlot[]): LiveCounts {
  const counts = emptyCounts()
  for (const s of slots) counts[s.state]++
  return counts
}

export type RowPhase = "upcoming" | "live" | "done"

export function rowPhase(row: Pick<DayRequest, "start" | "end">, now: Date): RowPhase {
  if (now >= row.end) return "done"
  if (now >= row.start) return "live"
  return "upcoming"
}

export interface LiveRow extends DayRequest {
  slots: LiveSlot[]
  counts: LiveCounts
  phase: RowPhase
}

export function liveRows(requests: DayRequest[], now: Date): LiveRow[] {
  return requests
    .filter((r) => !r.tentative)
    .map((r) => {
      const slots = liveSlots(r.shifts, r.view.req, now)
      return { ...r, slots, counts: countSlots(slots), phase: rowPhase(r, now) }
    })
}

export interface LiveTotals extends LiveCounts {
  backfilled: number
  /** Open slots on shifts that haven't ended yet. */
  openAhead: number
  openSoon: number
}

/**
 * Shift-level counts for the stat strip. Suppliers only see their own Pros (matching the
 * top-bar live pill) but every open slot they could still fill.
 */
export function liveTotals(rows: LiveRow[], lookups: Lookups, persona: Persona, now: Date): LiveTotals {
  const totals: LiveTotals = { ...emptyCounts(), backfilled: 0, openAhead: 0, openSoon: 0 }
  for (const row of rows) {
    for (const s of row.shifts) {
      const state = shiftState(s, row.view.req, now)
      if (state === "cancelled") continue
      if (state === "open") {
        totals.open++
        if (row.end > now) {
          totals.openAhead++
          if (row.start.getTime() - now.getTime() <= 3 * 3_600_000) totals.openSoon++
        }
        continue
      }
      if (!ownPro(s.workerId, lookups, persona)) continue
      totals[state]++
      if (s.backfillFor) totals.backfilled++
    }
  }
  return totals
}

function ownPro(workerId: string | undefined, lookups: Lookups, persona: Persona): boolean {
  if (persona.id !== "supplier") return true
  if (!workerId) return false
  return lookups.workers.get(workerId)?.supplierId === persona.supplierId
}

export type AttentionItem =
  | { kind: "late"; id: string; row: LiveRow; shift: Shift; worker?: Worker; minutes: number; urgency: number }
  | { kind: "noshow"; id: string; row: LiveRow; shift: Shift; worker?: Worker; backfill?: Shift; backfillWorker?: Worker; backfillState?: LiveState; urgency: number }
  | { kind: "open"; id: string; row: LiveRow; open: number; startsInMinutes: number; urgency: number }

export function attentionItems(rows: LiveRow[], lookups: Lookups, persona: Persona, now: Date): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const row of rows) {
    const req = row.view.req
    for (const slot of row.slots) {
      if (slot.state === "late" && ownPro(slot.effective.workerId, lookups, persona)) {
        const minutes = minutesLate(slot.effective, req, now)
        items.push({
          kind: "late",
          id: `late:${slot.effective.id}`,
          row,
          shift: slot.effective,
          worker: slot.effective.workerId ? lookups.workers.get(slot.effective.workerId) : undefined,
          minutes,
          urgency: 200 + Math.min(minutes, 99),
        })
      }
      if (slot.shift.status === "No-show" && ownPro(slot.shift.workerId, lookups, persona)) {
        const backfillState = slot.backfill ? slot.state : undefined
        const resolved = backfillState === "onsite" || backfillState === "completed"
        items.push({
          kind: "noshow",
          id: `noshow:${slot.shift.id}`,
          row,
          shift: slot.shift,
          worker: slot.shift.workerId ? lookups.workers.get(slot.shift.workerId) : undefined,
          backfill: slot.backfill,
          backfillWorker: slot.backfill?.workerId ? lookups.workers.get(slot.backfill.workerId) : undefined,
          backfillState,
          urgency: !slot.backfill ? (row.phase === "done" ? 120 : 300) : resolved ? 40 : 150,
        })
      }
    }
    if (row.counts.open > 0 && row.end > now) {
      const startsInMinutes = Math.round((row.start.getTime() - now.getTime()) / 60_000)
      if (startsInMinutes <= 180) {
        items.push({
          kind: "open",
          id: `open:${row.key}`,
          row,
          open: row.counts.open,
          startsInMinutes,
          urgency: 100 + Math.max(0, 180 - Math.max(0, startsInMinutes)) / 3,
        })
      }
    }
  }
  return items.sort((a, b) => b.urgency - a.urgency || a.row.start.getTime() - b.row.start.getTime())
}

// Timeline axis -------------------------------------------------------------------

export interface TimelineAxis {
  startMin: number
  endMin: number
  hours: number[]
}

export function minutesFromMidnight(date: ISODate, d: Date): number {
  return Math.round((d.getTime() - parseLocal(date).getTime()) / 60_000)
}

export function timelineAxis(rows: Pick<DayRequest, "start" | "end">[], date: ISODate): TimelineAxis {
  let min = Infinity
  let max = -Infinity
  for (const r of rows) {
    min = Math.min(min, minutesFromMidnight(date, r.start))
    max = Math.max(max, minutesFromMidnight(date, r.end))
  }
  if (!Number.isFinite(min)) {
    min = 9 * 60
    max = 17 * 60
  }
  const startMin = Math.max(0, Math.floor(min / 60) * 60 - 60)
  const endMin = Math.min(48 * 60, Math.ceil(max / 60) * 60 + 60)
  const hours: number[] = []
  for (let m = startMin; m <= endMin; m += 60) hours.push(m)
  return { startMin, endMin, hours }
}

export function hourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  if (h === 0) return "12 AM"
  if (h === 12) return "12 PM"
  return h > 12 ? `${h - 12} PM` : `${h} AM`
}

// Live activity -----------------------------------------------------------------

export const LIVE_ACTIVITY_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>(["checkin", "noshow", "fill", "request", "approval"])

function activitySeq(id: string): number {
  const n = Number(id.replace(/\D+/g, ""))
  return Number.isFinite(n) ? n : 0
}

export function dayActivities(activities: Activity[], date: ISODate, lookups: Lookups, persona: Persona, venueId: string, limit = 60): Activity[] {
  const out: Activity[] = []
  for (const a of activities) {
    if (!a.at.startsWith(date) || !LIVE_ACTIVITY_KINDS.has(a.kind)) continue
    const req = a.requestId ? lookups.requests.get(a.requestId) : undefined
    const actVenue = req?.venueId ?? a.venueId
    if (venueId !== "all" && actVenue !== venueId) continue
    if (req) {
      if (!requestInScope(req, persona)) continue
    } else if (!actVenue || !venueInScope(actVenue, persona)) continue
    if (persona.id === "supplier" && a.workerId && lookups.workers.get(a.workerId)?.supplierId !== persona.supplierId) continue
    out.push(a)
  }
  out.sort((x, y) => y.at.localeCompare(x.at) || activitySeq(y.id) - activitySeq(x.id))
  return out.slice(0, limit)
}

/** Venues offered in the venue filter: the persona's venues, or (suppliers) wherever they have work. */
export function scopedVenues(venues: Venue[], views: RequestView[], persona: Persona): Venue[] {
  if (persona.id === "supplier") {
    const ids = new Set(views.map((v) => v.venue.id))
    return venues.filter((v) => ids.has(v.id))
  }
  return venues.filter((v) => venueInScope(v.id, persona))
}
