import { addDays, differenceInMinutes } from "date-fns"

import { minutesBetween, parseLocal, scheduledMinutes, shiftWindow, toISODate } from "@/lib/dates"
import { round2 } from "@/lib/format"
import { alcoholCertFor } from "@/lib/reference"
import type {
  AnomalyType,
  CertType,
  Policies,
  Position,
  StaffingRequest,
  TimeEntry,
  Venue,
  Worker,
} from "@/lib/types"
import { backgroundCheckState, workerSafetyReady } from "@/lib/safety"

export function billFromPay(pay: number, markupPct: number): number {
  return round2(pay * (1 + markupPct))
}

export function postMsaRate(billRate: number, msaFeePct: number): number {
  return round2(billRate * (1 - msaFeePct / 100))
}

export function defaultBreakMinutes(startTime: string, endTime: string): number {
  return scheduledMinutes(startTime, endTime) > 300 ? 30 : 0
}

export function payableShiftHours(
  req: Pick<StaffingRequest, "startTime" | "endTime" | "breakMinutes">
): number {
  return Math.max(0, (scheduledMinutes(req.startTime, req.endTime) - req.breakMinutes) / 60)
}

export function totalSlots(req: Pick<StaffingRequest, "dates" | "headcount">): number {
  return req.dates.length * req.headcount
}

export function estimateRequestCost(
  req: Pick<StaffingRequest, "dates" | "headcount" | "startTime" | "endTime" | "breakMinutes" | "billRate">
): number {
  return round2(totalSlots(req) * payableShiftHours(req) * req.billRate)
}

export function requiredCertsFor(position: Position, venue: Venue): CertType[] {
  const certs = new Set<CertType>(position.requiredCerts)
  if (position.category === "Bar") certs.add(alcoholCertFor(venue.state))
  return [...certs]
}

export const ANOMALY_LABELS: Record<AnomalyType, string> = {
  missing_clockout: "No clock-out",
  short_shift: "Under 10 min",
  long_break: "Break ≥ shift",
  late_arrival: "Late arrival",
  early_departure: "Left early",
  over_schedule: "Over schedule",
}

export const ANOMALY_HINTS: Record<AnomalyType, string> = {
  missing_clockout: "The Pro never clocked out. Confirm the real end time before approving.",
  short_shift: "Clocked time is under 10 minutes, usually an accidental tap.",
  long_break: "Recorded break is as long as the shift itself.",
  late_arrival: "Clocked in more than 15 minutes after the scheduled start.",
  early_departure: "Clocked out an hour or more before the scheduled end. If you sent the Pro home, the 4-hour minimum applies.",
  over_schedule: "Clocked time runs more than an hour past the scheduled end.",
}

interface EntryShape {
  clockIn: string
  clockOut?: string
  breakMinutes: number
  date: string
}

export function workedMinutes(entry: EntryShape): number {
  if (!entry.clockOut) return 0
  return Math.max(0, minutesBetween(entry.clockIn, entry.clockOut))
}

export function payableHours(entry: EntryShape): number {
  const worked = workedMinutes(entry)
  return Math.max(0, round2((worked - entry.breakMinutes) / 60))
}

export function detectAnomalies(
  entry: EntryShape,
  req: Pick<StaffingRequest, "startTime" | "endTime">,
  options: { ignoreLate?: boolean } = {}
): AnomalyType[] {
  const out: AnomalyType[] = []
  const { start, end } = shiftWindow(entry.date, req.startTime, req.endTime)
  const clockIn = parseLocal(entry.clockIn)
  if (!entry.clockOut) {
    out.push("missing_clockout")
  } else {
    const clockOut = parseLocal(entry.clockOut)
    const worked = differenceInMinutes(clockOut, clockIn)
    if (worked < 10) out.push("short_shift")
    if (entry.breakMinutes > 0 && entry.breakMinutes >= worked) out.push("long_break")
    if (differenceInMinutes(end, clockOut) >= 60 && worked >= 10) out.push("early_departure")
    if (differenceInMinutes(clockOut, end) > 60) out.push("over_schedule")
  }
  if (!options.ignoreLate && differenceInMinutes(clockIn, start) > 15) out.push("late_arrival")
  return out
}

/** Recomputes hours, overtime and amount for every entry, splitting weekly overtime per worker. */
export function recomputeEntries(
  entries: TimeEntry[],
  policies: Pick<Policies, "overtimeMultiplier" | "overtimeWeeklyThreshold">
): TimeEntry[] {
  const byWorkerWeek = new Map<string, TimeEntry[]>()
  for (const e of entries) {
    const d = parseLocal(e.date)
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const key = `${e.workerId}|${monday.toDateString()}`
    const list = byWorkerWeek.get(key)
    if (list) list.push(e)
    else byWorkerWeek.set(key, [e])
  }
  const updated = new Map<string, TimeEntry>()
  for (const list of byWorkerWeek.values()) {
    list.sort((a, b) => a.clockIn.localeCompare(b.clockIn))
    let running = 0
    for (const e of list) {
      const total = payableHours(e)
      const regularRoom = Math.max(0, policies.overtimeWeeklyThreshold - running)
      const regular = round2(Math.min(total, regularRoom))
      const overtime = round2(Math.max(0, total - regular))
      running += total
      const amount = round2(regular * e.billRate + overtime * e.billRate * policies.overtimeMultiplier)
      if (
        regular !== e.regularHours ||
        overtime !== e.overtimeHours ||
        amount !== e.amount
      ) {
        updated.set(e.id, { ...e, regularHours: regular, overtimeHours: overtime, amount })
      }
    }
  }
  if (updated.size === 0) return entries
  return entries.map((e) => updated.get(e.id) ?? e)
}

export function entryHours(e: Pick<TimeEntry, "regularHours" | "overtimeHours">): number {
  return round2(e.regularHours + e.overtimeHours)
}

export interface EligibilityContext {
  venue: Venue
  position: Position
  dateBooked: (workerId: string) => boolean
  blocked: Set<string>
  supplierIds: string[]
  policies: Policies
  today: string
}

export type CertState = "valid" | "expiring" | "expired" | "missing"

export function certStatus(worker: Worker, cert: CertType, today: string): CertState {
  const c = worker.certs.find((x) => x.type === cert)
  if (!c) return "missing"
  if (c.expires < today) return "expired"
  const soon = toISODate(addDays(parseLocal(today), 30))
  return c.expires <= soon ? "expiring" : "valid"
}

export function eligibilityIssues(worker: Worker, ctx: EligibilityContext): string[] {
  const issues: string[] = []
  if (worker.status !== "Active") issues.push(`${worker.status}, not yet cleared to work`)
  const background = backgroundCheckState(worker, ctx.today)
  if (background === "pending") issues.push("Background check pending")
  if (background === "expired") issues.push("Background check expired")
  if (
    background === "ready" &&
    !workerSafetyReady(worker, ctx.today) &&
    worker.onboarding.some((item) => item.status === "Pending")
  ) {
    issues.push("Safety onboarding incomplete")
  }
  if (!worker.positionIds.includes(ctx.position.id)) issues.push(`Not qualified as ${ctx.position.title}`)
  if (worker.metro !== ctx.venue.metro) issues.push("Outside venue market")
  if (ctx.blocked.has(worker.id)) issues.push("On this venue's do-not-return list")
  if (!ctx.supplierIds.includes(worker.supplierId)) issues.push("Supplier not on this request")
  if (ctx.dateBooked(worker.id)) issues.push("Already booked that day")
  for (const cert of requiredCertsFor(ctx.position, ctx.venue)) {
    const status = certStatus(worker, cert, ctx.today)
    if (status === "missing") issues.push(`Missing ${cert}`)
    if (status === "expired") issues.push(`${cert} expired`)
  }
  if (ctx.policies.blockOverCapWorkers && worker.compassHours >= ctx.policies.contractualHoursCap) {
    issues.push(`At ${ctx.policies.contractualHoursCap}-hour contractual cap`)
  }
  return issues
}
