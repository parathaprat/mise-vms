import { addDays, addMinutes, differenceInMinutes } from "date-fns"

import { formatClock, minutesOf, parseLocal, shiftWindow, timeFromMinutes, toISODate } from "@/lib/dates"
import { round2, workerLegalName, workerName } from "@/lib/format"
import { entryHours } from "@/lib/rules"
import type { Lookups } from "@/lib/selectors"
import type {
  AdjustmentReason,
  AnomalyType,
  DisputeReason,
  PersonaId,
  Policies,
  Position,
  StaffingRequest,
  Supplier,
  TimeEntry,
  Venue,
  Worker,
} from "@/lib/types"

export type TimesheetTab = "review" | "flagged" | "disputed" | "approved" | "invoiced" | "all"

export const TIMESHEET_TABS: { value: TimesheetTab; label: string }[] = [
  { value: "review", label: "Needs review" },
  { value: "flagged", label: "Flagged" },
  { value: "disputed", label: "Disputed" },
  { value: "approved", label: "Approved" },
  { value: "invoiced", label: "Invoiced" },
  { value: "all", label: "All" },
]

export function parseTab(value: string | null): TimesheetTab {
  return TIMESHEET_TABS.some((t) => t.value === value) ? (value as TimesheetTab) : "review"
}

export type DateRange = "7d" | "30d" | "all"

export const ADJUSTMENT_REASONS: AdjustmentReason[] = [
  "Forgot to clock out",
  "Sent home early",
  "Break correction",
  "Late arrival",
  "Uniform deduction",
  "Worker swap",
  "Other",
]

export const DISPUTE_REASONS: DisputeReason[] = [
  "Hours don't match sign-in",
  "Name not recognized",
  "Worker swap",
  "Rate incorrect",
  "Duplicate entry",
  "Pro not on site",
]

export interface EntryRow {
  id: string
  entry: TimeEntry
  worker?: Worker
  supplier?: Supplier
  request?: StaffingRequest
  venue?: Venue
  position?: Position
  scheduledStart?: Date
  scheduledEnd?: Date
  /** Positive when the Pro clocked in after the scheduled start. */
  lateMinutes: number
  earlyMinutes: number
  overMinutes: number
  backfill: boolean
  hours: number
  search: string
}

export function buildEntryRow(entry: TimeEntry, lookups: Lookups): EntryRow {
  const request = lookups.requests.get(entry.requestId)
  const worker = lookups.workers.get(entry.workerId)
  const supplier = worker ? lookups.suppliers.get(worker.supplierId) : undefined
  const venue = request ? lookups.venues.get(request.venueId) : undefined
  const position = request ? lookups.positions.get(request.positionId) : undefined
  const window = request ? shiftWindow(entry.date, request.startTime, request.endTime) : undefined
  const clockIn = parseLocal(entry.clockIn)
  const clockOut = entry.clockOut ? parseLocal(entry.clockOut) : undefined
  const lateMinutes = window ? differenceInMinutes(clockIn, window.start) : 0
  const endDelta = window && clockOut ? differenceInMinutes(clockOut, window.end) : 0
  const shift = lookups.shiftsByRequest.get(entry.requestId)?.find((s) => s.id === entry.shiftId)
  return {
    id: entry.id,
    entry,
    worker,
    supplier,
    request,
    venue,
    position,
    scheduledStart: window?.start,
    scheduledEnd: window?.end,
    lateMinutes,
    earlyMinutes: Math.max(0, -endDelta),
    overMinutes: Math.max(0, endDelta),
    backfill: !!shift?.backfillFor,
    hours: entryHours(entry),
    search: [
      worker ? workerName(worker) : "",
      worker ? workerLegalName(worker) : "",
      entry.id,
      entry.requestId,
      position?.title,
      request?.eventName,
      venue?.name,
      supplier?.shortName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  }
}

export function inTab(entry: TimeEntry, tab: TimesheetTab): boolean {
  switch (tab) {
    case "review":
      return entry.status === "Pending"
    case "flagged":
      return entry.status === "Pending" && entry.anomalies.length > 0
    case "disputed":
      return entry.status === "Disputed"
    case "approved":
      return entry.status === "Approved" || entry.status === "Auto-approved"
    case "invoiced":
      return entry.status === "Invoiced"
    default:
      return true
  }
}

export function isApprovable(entry: TimeEntry): boolean {
  return entry.status === "Pending" || entry.status === "Disputed"
}

export function isClean(entry: TimeEntry): boolean {
  return entry.status === "Pending" && entry.anomalies.length === 0
}

export function isSelectableRow(row: EntryRow): boolean {
  return isApprovable(row.entry)
}

export type EntryAction = "approve" | "adjust" | "dispute" | "reassign" | "respond"

export type EntryCapabilities = Record<EntryAction, boolean>

const NO_ACTIONS: EntryCapabilities = { approve: false, adjust: false, dispute: false, reassign: false, respond: false }

/** Venues decide on hours, suppliers can only answer disputes, the program team watches. */
export function entryCapabilities(entry: TimeEntry, persona: PersonaId): EntryCapabilities {
  const open = entry.status !== "Invoiced"
  if (persona === "venue") {
    return {
      approve: isApprovable(entry),
      adjust: open,
      dispute: open && entry.status !== "Disputed",
      reassign: open,
      respond: false,
    }
  }
  if (persona === "supplier") return { ...NO_ACTIONS, respond: entry.status === "Disputed" && !!entry.dispute }
  return NO_ACTIONS
}

export function hasAnyAction(caps: EntryCapabilities): boolean {
  return caps.approve || caps.adjust || caps.dispute || caps.reassign || caps.respond
}

export function countByTab(rows: EntryRow[]): Record<TimesheetTab, number> {
  const counts: Record<TimesheetTab, number> = { review: 0, flagged: 0, disputed: 0, approved: 0, invoiced: 0, all: rows.length }
  for (const { entry } of rows) {
    if (entry.status === "Pending") {
      counts.review++
      if (entry.anomalies.length > 0) counts.flagged++
    } else if (entry.status === "Disputed") counts.disputed++
    else if (entry.status === "Approved" || entry.status === "Auto-approved") counts.approved++
    else if (entry.status === "Invoiced") counts.invoiced++
  }
  return counts
}

export interface EntryTotals {
  count: number
  hours: number
  amount: number
}

export function totalsOf(rows: { entry: TimeEntry }[]): EntryTotals {
  let hoursTotal = 0
  let amount = 0
  for (const { entry } of rows) {
    hoursTotal += entry.regularHours + entry.overtimeHours
    amount += entry.amount
  }
  return { count: rows.length, hours: round2(hoursTotal), amount: round2(amount) }
}

/** When the policy engine will auto-approve this entry, or null if it never will. */
export function autoApproveAt(entry: TimeEntry, policies: Pick<Policies, "timesheetAutoApproveHours">): Date | null {
  if (entry.status !== "Pending" || entry.anomalies.length > 0 || !entry.clockOut || entry.dispute) return null
  return addMinutes(parseLocal(entry.clockOut), policies.timesheetAutoApproveHours * 60)
}

export function formatDuration(minutes: number): string {
  const total = Math.round(Math.abs(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function formatCountdown(target: Date, now: Date): string {
  const mins = differenceInMinutes(target, now)
  if (mins <= 0) return "any moment"
  if (mins < 60) return `in ${mins}m`
  const h = Math.round(mins / 60)
  return h < 48 ? `in ${h}h` : `in ${Math.round(h / 24)}d`
}

export function isPolicyApproval(approvedBy?: string): boolean {
  return !!approvedBy && approvedBy.startsWith("Policy")
}

export function suggestedAdjustmentReason(entry: TimeEntry): AdjustmentReason {
  const has = (a: AnomalyType) => entry.anomalies.includes(a)
  if (has("missing_clockout")) return "Forgot to clock out"
  if (has("long_break")) return "Break correction"
  if (has("early_departure")) return "Sent home early"
  if (has("late_arrival")) return "Late arrival"
  return "Other"
}

export const DISPUTE_PLACEHOLDER: Record<DisputeReason, string> = {
  "Hours don't match sign-in": "e.g. The captain's sheet shows clock-out at 10:15 PM, not 11:02 PM.",
  "Name not recognized": "e.g. Nobody by this name signed in at the staffing desk for the 4 PM call.",
  "Worker swap": "e.g. The stand lead says a different Pro worked stand 112.",
  "Rate incorrect": "e.g. This shift was booked at the suite rate, not the concessions rate.",
  "Duplicate entry": "e.g. The same shift appears twice for this Pro.",
  "Pro not on site": "e.g. No badge pickup and nobody at the stand when the shift started.",
}

export interface EntryDraft {
  date: string
  clockIn: string
  clockOut: string
  breakMinutes: number
  overnight: boolean
}

const TIME_RE = /^\d{2}:\d{2}$/

/** Builds clock-in/out timestamps on the entry's date; a clock-out at or before the clock-in rolls to the next day. */
export function buildDraft(entry: TimeEntry, inTime: string, outTime: string, breakMinutes: number): EntryDraft | null {
  if (!TIME_RE.test(inTime) || !TIME_RE.test(outTime)) return null
  const base = entry.clockIn.slice(0, 10)
  const overnight = minutesOf(outTime) <= minutesOf(inTime)
  const outDate = overnight ? toISODate(addDays(parseLocal(base), 1)) : base
  return {
    date: entry.date,
    clockIn: `${base}T${inTime}`,
    clockOut: `${outDate}T${outTime}`,
    breakMinutes: Number.isFinite(breakMinutes) ? Math.max(0, Math.round(breakMinutes)) : 0,
    overnight,
  }
}

export function addToTime(time: string, minutes: number): string {
  return timeFromMinutes(minutesOf(time) + minutes)
}

/**
 * Estimates the amount after an edit. Weekly overtime is re-split by the store, so an entry
 * that already carries overtime keeps its regular-hour room and the rest bills at the OT rate.
 */
export function previewAmount(entry: TimeEntry, payable: number, overtimeMultiplier: number) {
  const regular = entry.overtimeHours > 0 ? Math.min(payable, entry.regularHours) : payable
  const overtime = Math.max(0, payable - regular)
  return {
    regular: round2(regular),
    overtime: round2(overtime),
    amount: round2(regular * entry.billRate + overtime * entry.billRate * overtimeMultiplier),
  }
}

export function disputeReplySuggestions(row: EntryRow): string[] {
  const w = row.worker
  const name = w ? workerName(w) : "the Pro"
  const first = w ? (w.preferredName ?? w.firstName) : "the Pro"
  const venue = row.venue?.shortName ?? "the venue"
  const clockIn = formatClock(row.entry.clockIn)
  const clockOut = row.entry.clockOut ? formatClock(row.entry.clockOut) : null
  const out: string[] = []
  switch (row.entry.dispute?.reason) {
    case "Name not recognized":
      if (w?.preferredName) {
        out.push(`${w.preferredName} is the preferred name for ${workerLegalName(w)}, same Pro, verified by geofenced check-in at ${venue} at ${clockIn}.`)
      } else {
        out.push(`Confirmed with ${name} directly. The geofenced check-in at ${clockIn} places them on site at ${venue}.`)
      }
      break
    case "Worker swap":
      out.push(`Confirmed with our dispatcher, ${name} worked this shift. The geofenced check-in at ${clockIn} is theirs.`)
      out.push("You're right: a teammate covered this shift. Please reassign the hours to the Pro who actually worked.")
      break
    case "Hours don't match sign-in":
      out.push(
        clockOut
          ? `The geofence shows ${first} on site until ${clockOut}. Happy to accept the captain's sheet if you'd like to adjust.`
          : `${first} forgot to clock out, please set the end time from your sign-in sheet and we'll accept it.`
      )
      break
    case "Rate incorrect":
      out.push("The bill rate matches the current FlexForce rate card for this position and market. Happy to review if the booking was different.")
      break
    case "Duplicate entry":
      out.push(`Checked: ${first} has only this entry for the shift. Please send the other entry ID if you're still seeing a duplicate.`)
      break
    case "Pro not on site":
      out.push(`${first}'s geofenced check-in at ${clockIn} was inside the venue perimeter. We're confirming with them now.`)
      break
  }
  out.push(`Looking into this with ${first} now. We'll confirm within the hour.`)
  return out
}

export function entriesCsv(rows: EntryRow[]): string {
  const header = [
    "Entry",
    "Request",
    "Pro (preferred)",
    "Legal name",
    "Supplier",
    "Venue",
    "Position",
    "Event",
    "Date",
    "Clock in",
    "Clock out",
    "Break (min)",
    "Regular hours",
    "Overtime hours",
    "Bill rate",
    "Amount",
    "Status",
    "Flags",
  ]
  const escape = (value: string | number) => {
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = rows.map((r) =>
    [
      r.entry.id,
      r.entry.requestId,
      r.worker ? workerName(r.worker) : "",
      r.worker ? workerLegalName(r.worker) : "",
      r.supplier?.name ?? "",
      r.venue?.name ?? "",
      r.position?.title ?? "",
      r.request?.eventName ?? "",
      r.entry.date,
      r.entry.clockIn.replace("T", " "),
      r.entry.clockOut?.replace("T", " ") ?? "",
      r.entry.breakMinutes,
      r.entry.regularHours,
      r.entry.overtimeHours,
      r.entry.billRate.toFixed(2),
      r.entry.amount.toFixed(2),
      r.entry.status,
      r.entry.anomalies.join("; "),
    ]
      .map(escape)
      .join(",")
  )
  return [header.join(","), ...lines].join("\n")
}
