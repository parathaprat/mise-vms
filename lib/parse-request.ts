import { addDays, getDay, isValid } from "date-fns"

import { formatDate, formatTimeRange, timeFromMinutes, toISODate } from "@/lib/dates"
import type { Position, Venue } from "@/lib/types"

export interface ParsedRequest {
  venueId?: string
  positionId?: string
  headcount?: number
  dates?: string[]
  startTime?: string
  endTime?: string
  eventName?: string
  /** Human-readable chips describing what was understood, in display order. */
  matched: { kind: "headcount" | "position" | "venue" | "date" | "time" | "event"; label: string }[]
}

export interface ParseContext {
  venues: Venue[]
  positions: Position[]
  now: Date
}

const VENUE_ALIASES: Record<string, string[]> = {
  "v-wrigley": ["wrigley", "wrigley field", "friendly confines"],
  "v-soldier": ["soldier field", "soldier"],
  "v-united": ["united center", "the uc", "uc"],
  "v-lynn": ["lynn family stadium", "lynn family", "lynn"],
  "v-phoenix": ["phoenix raceway", "raceway", "phoenix"],
  "v-lower": ["lower.com field", "lower.com", "lower com", "crew stadium"],
  "v-sloan": ["sloan park", "sloan", "mesa"],
  "v-ford": ["ford field", "ford"],
  "v-crisler": ["crisler center", "crisler", "michigan"],
  "v-nyu": ["nyu", "palladium"],
  "v-uww": ["uw-whitewater", "uw–whitewater", "whitewater", "uww"],
  "v-pace": ["pace university", "pace", "pleasantville"],
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const WEEKDAY_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function findAlias(lower: string, alias: string): number {
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}(?=$|[^a-z0-9])`)
  const m = re.exec(lower)
  return m ? m.index + m[1].length : -1
}

function to24(hour: number, minute: number, meridiem?: string): number {
  let h = hour % 12
  if (meridiem && meridiem.startsWith("p")) h += 12
  if (!meridiem && hour === 12) h = 12
  return h * 60 + minute
}

function parseTimes(lower: string): { start: string; end: string; label: string } | null {
  const ranged =
    /(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|a|p)?\s*(?:-|–|, |to|until|till|through)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|a|p)?(?![\d/])/i
  const m = ranged.exec(lower)
  if (!m) return null
  const sh = Number(m[1])
  const sm = Number(m[2] ?? 0)
  const eh = Number(m[4])
  const em = Number(m[5] ?? 0)
  if (sh > 24 || eh > 24 || sm > 59 || em > 59) return null
  const sMer = m[3]?.replace(/\./g, "")
  const eMer = m[6]?.replace(/\./g, "")
  const twentyFour = sh > 12 || eh > 12 || (!!m[2] && !sMer && !eMer && (sh >= 13 || eh >= 13))
  let start: number
  let end: number
  if (twentyFour) {
    start = sh * 60 + sm
    end = eh * 60 + em
  } else {
    let startMer = sMer
    let endMer = eMer
    if (!endMer && !startMer) {
      startMer = sh >= 1 && sh <= 6 ? "pm" : "am"
      endMer = eh < sh || eh <= 6 || startMer === "pm" ? "pm" : "am"
      if (startMer === "am" && eh === 12) endMer = "pm"
    } else if (!startMer && endMer) {
      startMer = endMer === "pm" && sh <= eh && sh !== 12 ? "pm" : endMer === "pm" ? "am" : "am"
    } else if (startMer && !endMer) {
      endMer = startMer === "am" && eh <= sh ? "pm" : startMer
    }
    start = to24(sh, sm, startMer)
    end = to24(eh, em, endMer)
  }
  const startTime = timeFromMinutes(start)
  const endTime = timeFromMinutes(end)
  return { start: startTime, end: endTime, label: formatTimeRange(startTime, endTime) }
}

function nextWeekday(from: Date, weekday: number, forceNextWeek: boolean): Date {
  const diff = (weekday - getDay(from) + 7) % 7
  const base = addDays(from, diff)
  return forceNextWeek ? addDays(base, 7) : base
}

function parseDates(lower: string, now: Date): string[] {
  const out = new Set<string>()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (/\b(today|tonight|this evening)\b/.test(lower)) out.add(toISODate(today))
  if (/\btomorrow\b/.test(lower)) out.add(toISODate(addDays(today, 1)))
  if (/\bthis weekend\b/.test(lower)) {
    out.add(toISODate(nextWeekday(today, 6, false)))
    out.add(toISODate(nextWeekday(today, 0, false)))
  }
  if (/\bnext weekend\b/.test(lower)) {
    out.add(toISODate(addDays(nextWeekday(today, 6, false), 7)))
    out.add(toISODate(addDays(nextWeekday(today, 0, false), 7)))
  }
  WEEKDAYS.forEach((day, idx) => {
    const re = new RegExp(`\\b(next\\s+)?(${day}|${WEEKDAY_SHORT[idx]})s?\\b`, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(lower))) {
      out.add(toISODate(nextWeekday(today, idx, !!m[1])))
    }
  })
  const numeric = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g
  let n: RegExpExecArray | null
  while ((n = numeric.exec(lower))) {
    const month = Number(n[1]) - 1
    const day = Number(n[2])
    let year = n[3] ? Number(n[3].length === 2 ? `20${n[3]}` : n[3]) : today.getFullYear()
    let d = new Date(year, month, day)
    if (!n[3] && d < today) {
      year += 1
      d = new Date(year, month, day)
    }
    if (isValid(d) && d.getMonth() === month) out.add(toISODate(d))
  }
  const monthRe = new RegExp(`\\b(${MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:-|–|to)\\s*(\\d{1,2})(?:st|nd|rd|th)?)?\\b`, "g")
  let mm: RegExpExecArray | null
  while ((mm = monthRe.exec(lower))) {
    const month = MONTHS.findIndex((m) => mm![1].startsWith(m.slice(0, 3)))
    const from = Number(mm[2])
    const to = mm[3] ? Number(mm[3]) : from
    for (let day = from; day <= Math.min(to, from + 13); day++) {
      let d = new Date(today.getFullYear(), month, day)
      if (d < today) d = new Date(today.getFullYear() + 1, month, day)
      if (isValid(d) && d.getMonth() === month) out.add(toISODate(d))
    }
  }
  return [...out].sort()
}

export function parseRequestText(text: string, ctx: ParseContext): ParsedRequest {
  const lower = ` ${text.toLowerCase().replace(/\s+/g, " ").trim()} `
  const result: ParsedRequest = { matched: [] }

  let posIndex = -1
  let posAlias = ""
  const aliases = ctx.positions
    .flatMap((p) => [p.title.toLowerCase(), ...p.aliases].map((a) => ({ id: p.id, alias: a.toLowerCase() })))
    .sort((a, b) => b.alias.length - a.alias.length)
  for (const { id, alias } of aliases) {
    const idx = findAlias(lower, alias)
    if (idx >= 0) {
      result.positionId = id
      posIndex = idx
      posAlias = alias
      break
    }
  }

  const venueHits: { id: string; idx: number; len: number }[] = []
  for (const venue of ctx.venues) {
    const names = [venue.name.toLowerCase(), venue.shortName.toLowerCase(), ...(VENUE_ALIASES[venue.id] ?? [])]
    for (const name of names) {
      const idx = findAlias(lower, name)
      if (idx >= 0) venueHits.push({ id: venue.id, idx, len: name.length })
    }
  }
  if (venueHits.length) {
    venueHits.sort((a, b) => b.len - a.len)
    result.venueId = venueHits[0].id
  }

  const withoutDates = lower
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(new RegExp(`\\b(?:${MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join("|")})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s*(?:-|–|to)\\s*\\d{1,2}(?:st|nd|rd|th)?)?`, "g"), " ")

  const times = parseTimes(withoutDates)
  if (times) {
    result.startTime = times.start
    result.endTime = times.end
  }

  const scrubbed = withoutDates.replace(
    /(?:from\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?\s*(?:-|–|, |to|until|till)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?/g,
    " "
  )

  if (posIndex >= 0) {
    const before = lower.slice(Math.max(0, posIndex - 24), posIndex)
    const m = /(\d{1,3})\s*(?:x|×)?\s*(?:more\s+|extra\s+|additional\s+)?(?:[a-z/]+\s+){0,2}$/.exec(before)
    if (m) result.headcount = Number(m[1])
  }
  if (!result.headcount) {
    const m = /\b(\d{1,3})\s*(?:x|×|pros|people|staff|workers|heads)\b/.exec(scrubbed) ?? /\b(\d{1,3})\b(?!\s*(?:am|pm|:))/.exec(scrubbed)
    if (m && Number(m[1]) > 0 && Number(m[1]) < 300) result.headcount = Number(m[1])
  }

  const dates = parseDates(lower, ctx.now)
  if (dates.length) result.dates = dates

  const eventText = lower.replace(/\bvs\.\s/g, "vs ")
  const originalText = ` ${text.replace(/\s+/g, " ").trim()} `.replace(/\b[vV][sS]\.\s/g, "vs ")
  const eventMatch = /\bfor (?:the |a |our )?([a-z0-9'&\- ]{3,60}?)(?=\s+(?:on|at|from|this|next|tomorrow|today|tonight|starting|between)\b|\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?\s*(?:-|–|, |to)\s*\d|[,.!?]|\s*$)/.exec(eventText)
  if (eventMatch) {
    const raw = eventMatch[1].trim()
    const isNoise = /^(\d+|me|us|them|shifts?|pros?|people|staff)$/.test(raw) || (posAlias && raw.includes(posAlias))
    if (!isNoise) {
      const start = eventMatch.index + eventMatch[0].indexOf(eventMatch[1])
      const asTyped = originalText.slice(start, start + eventMatch[1].length).trim() || raw
      result.eventName = (asTyped[0].toUpperCase() + asTyped.slice(1)).replace(/\bvs\b(?!\.)/gi, "vs.")
    }
  }

  const position = ctx.positions.find((p) => p.id === result.positionId)
  const venue = ctx.venues.find((v) => v.id === result.venueId)
  if (result.headcount) result.matched.push({ kind: "headcount", label: `${result.headcount} ${result.headcount === 1 ? "Pro" : "Pros"}` })
  if (position) result.matched.push({ kind: "position", label: position.title })
  if (venue) result.matched.push({ kind: "venue", label: venue.name })
  if (result.dates?.length) {
    result.matched.push({
      kind: "date",
      label: result.dates.length > 3 ? `${result.dates.length} dates` : result.dates.map((d) => formatDate(d, "EEE MMM d")).join(", "),
    })
  }
  if (times) result.matched.push({ kind: "time", label: times.label })
  if (result.eventName) result.matched.push({ kind: "event", label: result.eventName })
  return result
}

/** Serializes a parsed draft for `/requests/new?draft=` deep links. */
export function draftQuery(parsed: Omit<ParsedRequest, "matched">): string {
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== undefined && k !== "matched") payload[k] = v
  }
  return encodeURIComponent(JSON.stringify(payload))
}
