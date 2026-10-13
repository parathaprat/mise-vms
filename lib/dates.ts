import {
  addDays,
  differenceInCalendarDays,
  differenceInMinutes,
  format,
  isValid,
  parseISO,
  startOfWeek,
} from "date-fns"

import type { ISODate, LocalDateTime } from "@/lib/types"

export function toISODate(d: Date): ISODate {
  return format(d, "yyyy-MM-dd")
}

export function toLocal(d: Date): LocalDateTime {
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

/** Parses "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" as a local (venue) time. */
export function parseLocal(value: string): Date {
  const d = parseISO(value)
  return isValid(d) ? d : new Date(NaN)
}

export function combine(date: ISODate, time: string): LocalDateTime {
  return `${date}T${time}`
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function timeFromMinutes(total: number): string {
  const normalized = ((total % 1440) + 1440) % 1440
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Start/end for a shift on a given date; end rolls to the next day for overnight shifts. */
export function shiftWindow(
  date: ISODate,
  startTime: string,
  endTime: string
): { start: Date; end: Date } {
  const start = parseLocal(combine(date, startTime))
  let end = parseLocal(combine(date, endTime))
  if (minutesOf(endTime) <= minutesOf(startTime)) end = addDays(end, 1)
  return { start, end }
}

export function scheduledMinutes(startTime: string, endTime: string): number {
  const diff = minutesOf(endTime) - minutesOf(startTime)
  return diff <= 0 ? diff + 1440 : diff
}

export function weekStartOf(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 })
}

export function weekKey(date: ISODate | Date): ISODate {
  const d = typeof date === "string" ? parseLocal(date) : date
  return toISODate(weekStartOf(d))
}

export function minutesBetween(a: string, b: string): number {
  return differenceInMinutes(parseLocal(b), parseLocal(a))
}

export function daysFromToday(date: ISODate, now: Date): number {
  return differenceInCalendarDays(parseLocal(date), now)
}

export function formatTime(time: string): string {
  const mins = minutesOf(time)
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  const suffix = h >= 12 ? "PM" : "AM"
  const hour = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`
}

export function formatClock(value?: LocalDateTime): string {
  if (!value) return "–"
  const d = parseLocal(value)
  if (!isValid(d)) return "–"
  return format(d, "h:mm a")
}

export function formatDate(date: ISODate | Date, pattern = "EEE, MMM d"): string {
  const d = typeof date === "string" ? parseLocal(date) : date
  if (!isValid(d)) return "–"
  return format(d, pattern)
}

export function formatDateTime(value?: LocalDateTime): string {
  if (!value) return "–"
  const d = parseLocal(value)
  if (!isValid(d)) return "–"
  return format(d, "MMM d, h:mm a")
}

export function relativeDay(date: ISODate, now: Date): string {
  const diff = daysFromToday(date, now)
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  if (diff === -1) return "Yesterday"
  if (diff > 1 && diff < 7) return formatDate(date, "EEEE")
  return formatDate(date)
}

export function formatDateList(dates: ISODate[], now: Date): string {
  if (dates.length === 0) return "No dates"
  const sorted = [...dates].sort()
  if (sorted.length === 1) return relativeDay(sorted[0], now)
  const first = parseLocal(sorted[0])
  const last = parseLocal(sorted[sorted.length - 1])
  const contiguous =
    differenceInCalendarDays(last, first) === sorted.length - 1
  const sameMonth = format(first, "MMM") === format(last, "MMM")
  const range = sameMonth
    ? `${format(first, "MMM d")}–${format(last, "d")}`
    : `${format(first, "MMM d")} – ${format(last, "MMM d")}`
  return contiguous ? range : `${sorted.length} dates · ${range}`
}

export function timeAgo(value: LocalDateTime, now: Date): string {
  const mins = differenceInMinutes(now, parseLocal(value))
  if (Number.isNaN(mins)) return ""
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(toISODate(parseLocal(value)), "MMM d")
}

export function enumerateDates(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = []
  let cursor = parseLocal(start)
  const last = parseLocal(end)
  while (cursor <= last && out.length < 400) {
    out.push(toISODate(cursor))
    cursor = addDays(cursor, 1)
  }
  return out
}
