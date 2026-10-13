import { addDays, addMinutes, differenceInCalendarDays, differenceInMinutes, endOfMonth, startOfMonth, subMonths } from "date-fns"

import type { Tone } from "@/components/app/status-badge"
import type { DemoData } from "@/lib/data"
import { formatClock, formatDate, formatTimeRange, parseLocal, relativeDay, shiftWindow, timeAgo, toISODate, weekStartOf } from "@/lib/dates"
import { hours as formatHours, money, num, pct, plural, rate, workerName } from "@/lib/format"
import { lineTotals } from "@/lib/invoice"
import { draftQuery, parseRequestText, type ParsedRequest } from "@/lib/parse-request"
import { metroById, PERSONAS } from "@/lib/reference"
import { ANOMALY_LABELS, defaultBreakMinutes, payableShiftHours } from "@/lib/rules"
import {
  buildInbox,
  buildRequestView,
  computeFill,
  entryInScope,
  groupBy,
  invoiceInScope,
  requestInScope,
  venueInScope,
  workerComplianceFlags,
  workerInScope,
  type InboxKind,
  type Lookups,
} from "@/lib/selectors"
import type { AnomalyType, DisputeReason, Invoice, ISODate, Persona, PersonaId, Position, StaffingRequest, TimeEntry, Venue, Worker } from "@/lib/types"

// Reply model ------------------------------------------------------------------------

export type IconKey =
  | "inbox"
  | "timesheets"
  | "dispute"
  | "tips"
  | "approval"
  | "change"
  | "invoice"
  | "payment"
  | "staffing"
  | "compliance"
  | "coi"
  | "calendar"
  | "live"
  | "workforce"
  | "draft"
  | "spend"

export interface Stat {
  label: string
  value: string
  hint?: string
  tone?: Tone
}

export type RecordMedia =
  | { kind: "worker"; worker: Pick<Worker, "firstName" | "lastName" | "preferredName" | "hue"> }
  | { kind: "venue"; label: string; hue: number }
  | { kind: "icon"; icon: IconKey; tone?: Tone }

export interface RecordItem {
  id: string
  title: string
  subtitle?: string
  meta?: string
  badge?: { label: string; tone: Tone }
  href?: string
  media?: RecordMedia
}

export interface ActionItem {
  label: string
  href?: string
  /** Opens the request composer with this serialized draft (`draftQuery`). */
  draft?: string
  prompt?: string
  primary?: boolean
  icon?: IconKey
}

export interface DraftEstimate {
  slots: number
  hoursPerShift: number
  breakMinutes: number
  billRate: number
  total?: number
}

export interface DraftCard {
  title: string
  chips: ParsedRequest["matched"]
  missing: string[]
  estimate?: DraftEstimate
  notes: { tone: Tone; text: string }[]
  query: string
  venueChoices?: { label: string; prompt: string; hue: number }[]
}

export type Block =
  | { type: "text"; text: string }
  | { type: "stats"; items: Stat[] }
  | { type: "records"; title?: string; items: RecordItem[]; footer?: string }
  | { type: "actions"; items: ActionItem[] }
  | { type: "draft"; draft: DraftCard }
  | { type: "chips"; label?: string; items: { label: string; prompt: string }[] }

export interface Reply {
  intent: string
  blocks: Block[]
  suggestions?: string[]
}

export interface EngineContext {
  data: DemoData
  lookups: Lookups
  persona: Persona
  now: Date
}

const DEMO_DRAFT = "Need 12 cash bartenders at Wrigley Saturday 4-11pm for the Cubs game"

export const SUGGESTIONS: Record<PersonaId, string[]> = {
  venue: [
    "What needs my attention today?",
    "How much did we spend at Wrigley last week?",
    "Who are my most reliable bartenders?",
    "Which events still have open shifts?",
    DEMO_DRAFT,
  ],
  program: [
    "Which suppliers have compliance issues?",
    "What did we spend this month?",
    "Show requests waiting for my approval",
    "Which Pros are near the 390-hour cap?",
  ],
  supplier: ["Which shifts can we still fill this week?", "Any disputed timesheets?", "What payments are scheduled?"],
}

// Shared helpers ---------------------------------------------------------------------

interface Prompt {
  raw: string
  lower: string
  parsed: ParsedRequest
  question: boolean
}

const text = (value: string): Block => ({ type: "text", text: value })

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("")
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

function pluralTitle(title: string): string {
  if (/(s|sh|ch|x)$/i.test(title)) return `${title}es`
  return `${title}s`
}

function isoRange(start: ISODate, end: ISODate): string {
  if (start === end) return formatDate(start, "EEE, MMM d")
  const a = parseLocal(start)
  const b = parseLocal(end)
  return a.getMonth() === b.getMonth() ? `${formatDate(a, "MMM d")}–${formatDate(b, "d")}` : `${formatDate(a, "MMM d")} – ${formatDate(b, "MMM d")}`
}

function hoursLabel(value: number): string {
  return value >= 100 ? `${num(Math.round(value))}h` : formatHours(value)
}

function trendLabel(current: number, previous: number, versus: string): string | undefined {
  if (previous <= 0) return undefined
  const change = (current - previous) / previous
  if (Math.abs(change) < 0.005) return `flat vs ${versus}`
  return `${change > 0 ? "up" : "down"} ${pct(Math.abs(change))} vs ${versus}`
}

function venueMedia(venue: Venue): RecordMedia {
  return { kind: "venue", label: venue.name, hue: venue.hue }
}

function workerMedia(worker: Worker): RecordMedia {
  return { kind: "worker", worker }
}

function scopeVenues(ctx: EngineContext): Venue[] {
  return ctx.data.venues.filter((v) => venueInScope(v.id, ctx.persona))
}

function scopePhrase(ctx: EngineContext, venue?: Venue): string {
  if (venue) return `at ${venue.name}`
  if (ctx.persona.id === "venue") return "across your venues"
  if (ctx.persona.id === "supplier") return "across your Compass accounts"
  return "across the program"
}

function resolveVenue(prompt: Prompt, ctx: EngineContext): { venue?: Venue; outOfScope?: Venue } {
  const id = prompt.parsed.venueId
  const venue = id ? ctx.lookups.venues.get(id) : undefined
  if (!venue) return {}
  if (!venueInScope(venue.id, ctx.persona)) return { outOfScope: venue }
  return { venue }
}

function outOfScopeReply(venue: Venue, ctx: EngineContext): Reply {
  const mine = scopeVenues(ctx)
  return {
    intent: "out-of-scope",
    blocks: [
      text(`**${venue.name}** isn’t one of your venues, so I can’t see its data as ${ctx.persona.name}. You manage ${joinList(mine.map((v) => v.shortName))}.`),
      { type: "chips", label: "Try one of yours", items: mine.map((v) => ({ label: v.shortName, prompt: `How much did we spend at ${v.shortName} last week?` })) },
    ],
  }
}

/** Drops a venue mention ("at Crisler Center") so a venue-choice prompt can't re-match it. */
function withoutVenue(raw: string, venue: Venue): string {
  let out = raw
  for (const name of [venue.name, venue.shortName].sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    out = out.replace(new RegExp(`(?:\\b(?:at|in|for)\\s+)?\\b${escaped}\\b`, "i"), " ")
  }
  return out.replace(/\s{2,}/g, " ").trim()
}

function matchPosition(prompt: Prompt, ctx: EngineContext): Position | undefined {
  return prompt.parsed.positionId ? ctx.lookups.positions.get(prompt.parsed.positionId) : undefined
}

function reqLabel(req: StaffingRequest): string {
  return req.eventName ?? "Dining service"
}

/** `relativeDay` for use mid-sentence: "tomorrow", "Thursday", "Thu, Oct 8". */
function inlineDay(date: ISODate, now: Date): string {
  const label = relativeDay(date, now)
  return /^(Today|Tomorrow|Yesterday)$/.test(label) ? label.toLowerCase() : label
}

function hoursOut(start: Date, now: Date): number {
  return (start.getTime() - now.getTime()) / 3_600_000
}

/** "underway", "starts in 45m", "starts in 19h" or "starts Friday 4:30 PM". */
function startsLabel(start: Date, now: Date): string {
  const h = hoursOut(start, now)
  if (h <= 0) return "underway"
  if (h < 1) return `starts in ${Math.max(1, Math.round(h * 60))}m`
  if (h < 24) return `starts in ${Math.round(h)}h`
  return `starts ${inlineDay(toISODate(start), now)} ${formatDate(start, "h:mm a").replace(":00", "")}`
}

// Intent: attention ------------------------------------------------------------------

const INBOX_PHRASE: Record<InboxKind, [string, string]> = {
  timesheets: ["timesheet to review", "timesheets to review"],
  dispute: ["timesheet dispute to answer", "timesheet disputes to answer"],
  tips: ["tip batch to approve", "tip batches to approve"],
  "tips-draft": ["draft tip batch", "draft tip batches"],
  "request-approval": ["request awaiting approval", "requests awaiting approval"],
  change: ["change request", "change requests"],
  invoice: ["invoice to approve", "invoices to approve"],
  "invoice-dispute": ["invoice dispute", "invoice disputes"],
  staffing: ["open shift starting soon", "open shifts starting soon"],
  compliance: ["compliance flag", "compliance flags"],
  "supplier-coi": ["supplier COI alert", "supplier COI alerts"],
}

const INBOX_ICON: Record<InboxKind, IconKey> = {
  timesheets: "timesheets",
  dispute: "dispute",
  tips: "tips",
  "tips-draft": "tips",
  "request-approval": "approval",
  change: "change",
  invoice: "invoice",
  "invoice-dispute": "dispute",
  staffing: "staffing",
  compliance: "compliance",
  "supplier-coi": "coi",
}

/** Inbox kinds whose `at` is a creation or expiry date rather than when the task arrived. */
const TIMELESS_KINDS = new Set<InboxKind>(["staffing", "supplier-coi", "compliance"])

function liveSnapshot(ctx: EngineContext) {
  const today = toISODate(ctx.now)
  let onsite = 0
  let late = 0
  let noShows = 0
  for (const s of ctx.data.shifts) {
    if (s.date !== today && s.status !== "Checked in") continue
    const req = ctx.lookups.requests.get(s.requestId)
    if (!req || req.state !== "active" || !requestInScope(req, ctx.persona)) continue
    if (ctx.persona.id === "supplier" && (!s.workerId || ctx.lookups.workers.get(s.workerId)?.supplierId !== ctx.persona.supplierId)) continue
    if (s.status === "Checked in") onsite++
    if (s.date !== today) continue
    if (s.status === "No-show") noShows++
    if (s.status === "Confirmed" && !s.backfillFor && ctx.now > addMinutes(shiftWindow(s.date, req.startTime, req.endTime).start, 15)) late++
  }
  return { onsite, late, noShows }
}

function floorSummary(live: ReturnType<typeof liveSnapshot>): string {
  const parts: string[] = []
  if (live.onsite) parts.push(`**${plural(live.onsite, "Pro")}** checked in`)
  if (live.late) parts.push(`**${num(live.late)} running late**`)
  else if (live.onsite) parts.push("nobody running late")
  if (live.noShows) parts.push(`${plural(live.noShows, "no-show")} so far today`)
  return parts.length ? `On the floor: ${joinList(parts)}.` : "No shifts are underway right now."
}

function attention(ctx: EngineContext): Reply {
  const items = buildInbox(ctx.data, ctx.lookups, ctx.persona, ctx.now)
  const live = liveSnapshot(ctx)
  const liveStats: Stat[] = [
    { label: "On site now", value: num(live.onsite), tone: live.onsite ? "success" : "muted" },
    { label: "Late right now", value: num(live.late), tone: live.late ? "warning" : "muted" },
  ]
  if (items.length === 0) {
    return {
      intent: "attention",
      blocks: [
        text(`You’re all caught up, ${ctx.persona.firstName}. Nothing in your inbox needs you right now.`),
        { type: "stats", items: liveStats },
        { type: "actions", items: [{ label: "Open live board", href: "/schedule?view=live", icon: "live", primary: true }] },
      ],
      suggestions: SUGGESTIONS[ctx.persona.id].slice(1, 4),
    }
  }

  const high = items.filter((i) => i.priority === "high").length
  const parts: string[] = []
  for (const [kind, list] of groupBy(items, (i) => i.kind)) {
    const [one, many] = kind === "staffing" && ctx.persona.id === "supplier" ? ["open shift to fill", "open shifts to fill"] : INBOX_PHRASE[kind as InboxKind]
    const count = kind === "timesheets" || kind === "staffing" ? list.reduce((sum, i) => sum + (i.count ?? 1), 0) : list.length
    parts.push(`${num(count)} ${count === 1 ? one : many}`)
  }
  const breakdown = parts.length > 4 ? joinList([...parts.slice(0, 4), "more"]) : joinList(parts)
  const awaiting = items
    .filter((i) => i.kind === "timesheets" || i.kind === "invoice" || i.kind === "tips" || i.kind === "request-approval")
    .reduce((sum, i) => sum + (i.amount ?? 0), 0)

  const stats: Stat[] = [
    { label: "High priority", value: num(high), tone: high ? "danger" : "muted" },
    { label: "Inbox items", value: num(items.length) },
    ...liveStats.slice(0, 1),
  ]
  if (awaiting > 0) stats.push({ label: "Awaiting approval", value: money(awaiting) })

  const top = items.slice(0, 5)
  return {
    intent: "attention",
    blocks: [
      text(`${ctx.persona.firstName}, you have **${plural(items.length, "item")}** waiting${high ? `, including **${num(high)} high priority**` : ""}. That’s ${breakdown}.`),
      { type: "stats", items: stats },
      {
        type: "records",
        title: "Start here",
        items: top.map((i) => ({
          id: i.id,
          title: i.title,
          subtitle: i.subtitle,
          meta: i.amount ? money(i.amount) : TIMELESS_KINDS.has(i.kind) ? undefined : timeAgo(i.at, ctx.now),
          badge: i.priority === "high" ? { label: "High", tone: "danger" } : undefined,
          href: i.href,
          media: { kind: "icon", icon: INBOX_ICON[i.kind], tone: i.priority === "high" ? "danger" : "muted" },
        })),
        footer: items.length > top.length ? `+${plural(items.length - top.length, "more item")} in your inbox` : undefined,
      },
      text(floorSummary(live)),
      {
        type: "actions",
        items: [
          { label: "Open inbox", href: "/inbox", icon: "inbox", primary: true },
          { label: "Live board", href: "/schedule?view=live", icon: "live" },
        ],
      },
    ],
    suggestions:
      ctx.persona.id === "venue"
        ? ["Which events still have open shifts?", "How much did we spend this week?"]
        : ctx.persona.id === "program"
          ? ["Show requests waiting for my approval", "Which suppliers have compliance issues?"]
          : ["Which shifts can we still fill this week?", "Any disputed timesheets?"],
  }
}

// Intent: spend ----------------------------------------------------------------------

interface Period {
  label: string
  start: ISODate
  end: ISODate
  prevStart: ISODate
  prevEnd: ISODate
  /** How the comparison window reads in a trend, e.g. "the week before". */
  prevLabel: string
  weeks: number
}

function parsePeriod(lower: string, now: Date): Period {
  const day = (offset: number) => toISODate(addDays(now, offset))
  const monday = weekStartOf(now)
  const mondayISO = (offset: number) => toISODate(addDays(monday, offset))
  if (/\btoday\b|\btonight\b/.test(lower)) {
    return { label: "today", start: day(0), end: day(0), prevStart: day(-7), prevEnd: day(-7), prevLabel: "the same day last week", weeks: 0 }
  }
  if (/\byesterday\b/.test(lower)) {
    return { label: "yesterday", start: day(-1), end: day(-1), prevStart: day(-8), prevEnd: day(-8), prevLabel: "the same day the week before", weeks: 0 }
  }
  if (/\b(this|current) week\b|\bweek to date\b|\bwtd\b/.test(lower)) {
    const days = differenceInCalendarDays(now, monday) + 1
    return { label: "this week", start: mondayISO(0), end: day(0), prevStart: mondayISO(-7), prevEnd: day(-7), prevLabel: "the same point last week", weeks: days / 7 }
  }
  if (/\b(last|past) (7|seven) days\b/.test(lower)) {
    return { label: "over the last 7 days", start: day(-6), end: day(0), prevStart: day(-13), prevEnd: day(-7), prevLabel: "the 7 days before", weeks: 1 }
  }
  if (/\b(last|past) (30|thirty) days\b|\bpast month\b/.test(lower)) {
    return { label: "over the last 30 days", start: day(-29), end: day(0), prevStart: day(-59), prevEnd: day(-30), prevLabel: "the 30 days before", weeks: 30 / 7 }
  }
  if (/\b(this|current) month\b|\bmonth to date\b|\bmtd\b/.test(lower)) {
    const start = startOfMonth(now)
    const prevStart = startOfMonth(subMonths(now, 1))
    const elapsed = differenceInCalendarDays(now, start)
    return {
      label: "this month",
      start: toISODate(start),
      end: day(0),
      prevStart: toISODate(prevStart),
      prevEnd: toISODate(addDays(prevStart, elapsed)),
      prevLabel: "the same point last month",
      weeks: (elapsed + 1) / 7,
    }
  }
  if (/\b(last|previous) month\b/.test(lower)) {
    const prev = subMonths(now, 1)
    const before = subMonths(now, 2)
    const days = differenceInCalendarDays(endOfMonth(prev), startOfMonth(prev)) + 1
    return {
      label: `in ${formatDate(prev, "MMMM")}`,
      start: toISODate(startOfMonth(prev)),
      end: toISODate(endOfMonth(prev)),
      prevStart: toISODate(startOfMonth(before)),
      prevEnd: toISODate(endOfMonth(before)),
      prevLabel: formatDate(before, "MMMM"),
      weeks: days / 7,
    }
  }
  return { label: "last week", start: mondayISO(-7), end: mondayISO(-1), prevStart: mondayISO(-14), prevEnd: mondayISO(-8), prevLabel: "the week before", weeks: 1 }
}

function spend(prompt: Prompt, ctx: EngineContext): Reply {
  const { venue, outOfScope } = resolveVenue(prompt, ctx)
  if (outOfScope) return outOfScopeReply(outOfScope, ctx)
  const position = matchPosition(prompt, ctx)
  const period = parsePeriod(prompt.lower, ctx.now)
  const supplier = ctx.persona.id === "supplier"

  const matches = (date: ISODate, start: ISODate, end: ISODate) => date >= start && date <= end
  const inScope = ctx.data.timeEntries.filter((e) => {
    if (!entryInScope(e, ctx.lookups, ctx.persona)) return false
    const req = ctx.lookups.requests.get(e.requestId)
    if (!req) return false
    if (venue && req.venueId !== venue.id) return false
    if (position && req.positionId !== position.id) return false
    return true
  })
  const current = inScope.filter((e) => matches(e.date, period.start, period.end))
  const previous = inScope.filter((e) => matches(e.date, period.prevStart, period.prevEnd))
  const total = current.reduce((sum, e) => sum + e.amount, 0)
  const prevTotal = previous.reduce((sum, e) => sum + e.amount, 0)
  const hrs = current.reduce((sum, e) => sum + e.regularHours + e.overtimeHours, 0)
  const ot = current.reduce((sum, e) => sum + e.overtimeHours, 0)
  const pending = current.filter((e) => e.status === "Pending" || e.status === "Disputed").length

  const roleLabel = position ? pluralTitle(position.title).toLowerCase() : undefined
  const where = scopePhrase(ctx, venue)
  const range = isoRange(period.start, period.end)
  if (current.length === 0) {
    return {
      intent: "spend",
      blocks: [text(`No time has been recorded${roleLabel ? ` for ${roleLabel}` : ""} ${where} ${period.label} (${range}).`)],
      suggestions: ["What did we spend this month?", "Which events still have open shifts?"],
    }
  }

  const byPosition = [...groupBy(current, (e) => ctx.lookups.requests.get(e.requestId)?.positionId ?? "")]
    .map(([id, list]) => ({
      position: ctx.lookups.positions.get(id),
      amount: list.reduce((sum, e) => sum + e.amount, 0),
      hours: list.reduce((sum, e) => sum + e.regularHours + e.overtimeHours, 0),
      shifts: list.length,
    }))
    .sort((a, b) => b.amount - a.amount)

  const trend = trendLabel(total, prevTotal, period.prevLabel)
  const verb = supplier ? "billed" : "spent"
  const blocks: Block[] = [
    text(
      `You ${verb} **${money(total)}**${roleLabel ? ` on ${roleLabel}` : ""} ${where} ${period.label} (${range}) for ${hoursLabel(hrs)} across ${plural(current.length, "shift")}.${trend ? ` That’s ${trend}.` : ""}`
    ),
    {
      type: "stats",
      items: [
        { label: supplier ? "Billed" : "Labor spend", value: money(total), hint: trend },
        { label: "Hours", value: hoursLabel(hrs), hint: ot > 0 ? `${formatHours(ot)} overtime` : "No overtime" },
        { label: "Shifts worked", value: num(current.length), hint: pending ? `${num(pending)} not yet approved` : "All approved" },
        { label: "Avg bill rate", value: hrs > 0 ? rate(total / hrs) : "–" },
      ],
    },
  ]

  if (!position && byPosition.length > 1) {
    blocks.push({
      type: "records",
      title: "Top positions",
      items: byPosition.slice(0, 4).map((p) => ({
        id: p.position?.id ?? "other",
        title: p.position?.title ?? "Other",
        subtitle: `${plural(p.shifts, "shift")} · ${hoursLabel(p.hours)}`,
        meta: money(p.amount),
        badge: { label: pct(p.amount / total), tone: "muted" },
        media: { kind: "icon", icon: "spend", tone: "primary" },
      })),
    })
  }

  if (!venue && ctx.persona.id !== "supplier") {
    const venues = scopeVenues(ctx)
    if (venues.length > 1 && venues.length <= 4) {
      const byVenue = venues
        .map((v) => ({ v, amount: current.filter((e) => ctx.lookups.requests.get(e.requestId)?.venueId === v.id).reduce((s, e) => s + e.amount, 0) }))
        .filter((x) => x.amount > 0)
        .sort((a, b) => b.amount - a.amount)
      if (byVenue.length > 1) blocks.push(text(`By venue: ${byVenue.map((x) => `${x.v.shortName} **${money(x.amount)}**`).join(" · ")}.`))
    }
  }

  if (!supplier && period.weeks > 0 && !position) {
    const budget = ctx.data.costCenters
      .filter((c) => c.active && (venue ? c.venueId === venue.id : venueInScope(c.venueId, ctx.persona)))
      .reduce((sum, c) => sum + c.weeklyBudget, 0)
    const scaled = budget * period.weeks
    if (scaled > 0) blocks.push(text(`That’s **${pct(total / scaled)}** of the ${money(scaled)} cost-center budget for the period.`))
  }

  blocks.push({
    type: "actions",
    items: [
      { label: "Review timesheets", href: "/timesheets", icon: "timesheets", primary: pending > 0 },
      { label: supplier ? "Invoices & payments" : "Invoices", href: "/invoices", icon: "invoice" },
    ],
  })

  return {
    intent: "spend",
    blocks,
    suggestions: [
      period.label === "last week" ? `What did we ${supplier ? "bill" : "spend"} this month?` : `How much did we ${supplier ? "bill" : "spend"} last week?`,
      supplier ? "What payments are scheduled?" : "Who are my most reliable bartenders?",
    ],
  }
}

// Intent: open shifts ----------------------------------------------------------------

interface OpenSlot {
  req: StaffingRequest
  date: ISODate
  open: number
  start: Date
  value: number
}

function collectOpen(ctx: EngineContext, venue?: Venue, position?: Position): OpenSlot[] {
  const today = toISODate(ctx.now)
  const horizon = toISODate(addDays(ctx.now, 6))
  const out: OpenSlot[] = []
  for (const req of ctx.data.requests) {
    if (req.state !== "active" || !requestInScope(req, ctx.persona)) continue
    if (venue && req.venueId !== venue.id) continue
    if (position && req.positionId !== position.id) continue
    const shifts = ctx.lookups.shiftsByRequest.get(req.id) ?? []
    for (const [date, list] of groupBy(
      shifts.filter((s) => s.status === "Open" && !s.workerId && s.date >= today && s.date <= horizon),
      (s) => s.date
    )) {
      const { start, end } = shiftWindow(date, req.startTime, req.endTime)
      if (end <= ctx.now) continue
      out.push({ req, date, open: list.length, start, value: list.length * payableShiftHours(req) * req.billRate })
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime())
}

function openShifts(prompt: Prompt, ctx: EngineContext): Reply {
  const { venue, outOfScope } = resolveVenue(prompt, ctx)
  if (outOfScope) return outOfScopeReply(outOfScope, ctx)
  const position = matchPosition(prompt, ctx)
  const supplier = ctx.persona.id === "supplier"
  const slots = collectOpen(ctx, venue, position)
  const total = slots.reduce((sum, s) => sum + s.open, 0)
  const soon = slots.filter((s) => hoursOut(s.start, ctx.now) <= 48).reduce((sum, s) => sum + s.open, 0)
  const value = slots.reduce((sum, s) => sum + s.value, 0)
  const where = venue ? ` at ${venue.name}` : ""
  const what = position ? `${position.title} ` : ""

  if (total === 0) {
    return {
      intent: "open-shifts",
      blocks: [
        text(
          supplier
            ? `Nothing left to fill${where}. Every ${what}shift on your Compass requests for the next 7 days is staffed.`
            : `You’re covered: every ${what}shift${where} for the next 7 days is filled.`
        ),
        { type: "actions", items: [{ label: "Open schedule", href: "/schedule", icon: "calendar", primary: true }] },
      ],
      suggestions: supplier ? ["What payments are scheduled?"] : ["What needs my attention today?", "How much did we spend this week?"],
    }
  }

  const byEvent = /\bevents?\b/.test(prompt.lower)
  let records: RecordItem[]
  let groups: number
  if (byEvent) {
    const events = [...groupBy(slots, (s) => `${s.req.venueId}|${s.date}|${s.req.eventName ?? ""}`).values()]
      .map((list) => ({ list, open: list.reduce((sum, s) => sum + s.open, 0), start: list[0].start }))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
    groups = events.length
    records = events.slice(0, 6).map(({ list, open, start }) => {
      const first = list[0]
      const v = ctx.lookups.venues.get(first.req.venueId)
      const positions = [...new Set(list.map((s) => ctx.lookups.positions.get(s.req.positionId)?.title ?? ""))]
      const roles = positions.length > 2 ? `${positions.slice(0, 2).join(", ")} +${positions.length - 2}` : joinList(positions)
      const h = hoursOut(start, ctx.now)
      return {
        id: `${first.req.venueId}|${first.date}|${first.req.eventName ?? ""}`,
        title: reqLabel(first.req),
        subtitle: `${v?.shortName ?? ""} · ${relativeDay(first.date, ctx.now)} · ${roles}`,
        meta: `${num(open)} open`,
        badge: h <= 24 ? { label: "Rush", tone: "danger" } : h <= 72 ? { label: "Soon", tone: "warning" } : undefined,
        href: `/schedule?date=${first.date}`,
        media: v ? venueMedia(v) : undefined,
      }
    })
  } else {
    const byReq = [...groupBy(slots, (s) => s.req.id).values()].map((list) => ({
      req: list[0].req,
      open: list.reduce((sum, s) => sum + s.open, 0),
      dates: list.map((s) => s.date),
      start: list[0].start,
    }))
    groups = byReq.length
    records = byReq.slice(0, 6).map(({ req, open, dates, start }) => {
      const v = ctx.lookups.venues.get(req.venueId)
      const p = ctx.lookups.positions.get(req.positionId)
      const h = hoursOut(start, ctx.now)
      return {
        id: req.id,
        title: supplier ? `Fill ${num(open)} ${p?.title ?? ""} ${open === 1 ? "shift" : "shifts"}` : `${plural(open, "open shift")} · ${p?.title ?? ""}`,
        subtitle: `${v?.shortName ?? ""} · ${reqLabel(req)} · ${dates.length > 1 ? `${dates.length} dates` : relativeDay(dates[0], ctx.now)}`,
        meta: startsLabel(start, ctx.now),
        badge: h <= 24 ? { label: "Rush", tone: "danger" } : h <= 72 ? { label: "Soon", tone: "warning" } : undefined,
        href: `/requests/${req.id}`,
        media: v ? venueMedia(v) : undefined,
      }
    })
  }

  const unit = byEvent ? plural(groups, "event") : plural(groups, "request")
  const lead = supplier
    ? `Your team can still fill **${plural(total, `${what}shift`)}**${where} over the next 7 days across ${unit}, about **${money(value)}** in billings.`
    : `There ${total === 1 ? "is" : "are"} **${plural(total, `open ${what}shift`)}**${where} in the next 7 days across ${unit}.`
  const urgency = soon === 0 ? "" : soon === total ? (total === 1 ? " It starts within 48 hours." : " All of them start within 48 hours.") : ` **${num(soon)}** ${soon === 1 ? "starts" : "start"} within 48 hours.`
  const openByRole = new Map<string, number>()
  for (const s of slots) openByRole.set(s.req.positionId, (openByRole.get(s.req.positionId) ?? 0) + s.open)
  const topRole = position ?? ctx.lookups.positions.get([...openByRole].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "")
  return {
    intent: "open-shifts",
    blocks: [
      text(`${lead}${urgency}`),
      {
        type: "stats",
        items: [
          { label: supplier ? "Shifts to fill" : "Open shifts", value: num(total), tone: total ? "warning" : "success" },
          { label: "Within 48h", value: num(soon), tone: soon ? "danger" : "muted" },
          { label: byEvent ? "Events" : "Requests", value: num(groups) },
          { label: supplier ? "Billable value" : "Est. value", value: money(value) },
        ],
      },
      { type: "records", items: records, footer: groups > records.length ? `+${num(groups - records.length)} more` : undefined },
      {
        type: "actions",
        items: supplier
          ? [{ label: "Open requests", href: "/requests", icon: "staffing", primary: true }]
          : [
              { label: "Open schedule", href: "/schedule", icon: "calendar", primary: true },
              { label: "All requests", href: "/requests", icon: "staffing" },
            ],
      },
    ],
    suggestions: supplier
      ? ["Any disputed timesheets?", "What payments are scheduled?"]
      : [`Who are my most reliable ${topRole ? pluralTitle(topRole.title).toLowerCase() : "Pros"}${venue ? ` at ${venue.shortName}` : ""}?`, "What needs my attention today?"],
  }
}

// Intent: reliable Pros --------------------------------------------------------------

function reliablePros(prompt: Prompt, ctx: EngineContext): Reply {
  const { venue, outOfScope } = resolveVenue(prompt, ctx)
  if (outOfScope) return outOfScopeReply(outOfScope, ctx)
  const position = matchPosition(prompt, ctx)
  const venueIds = new Set((venue ? [venue] : scopeVenues(ctx)).map((v) => v.id))

  const completed = new Map<string, number>()
  for (const s of ctx.data.shifts) {
    if (s.status !== "Completed" || !s.workerId) continue
    const req = ctx.lookups.requests.get(s.requestId)
    if (!req || !venueIds.has(req.venueId)) continue
    if (ctx.persona.id === "supplier" && !requestInScope(req, ctx.persona)) continue
    if (position && req.positionId !== position.id) continue
    completed.set(s.workerId, (completed.get(s.workerId) ?? 0) + 1)
  }
  const rosters = ctx.data.rosters.filter((r) => venueIds.has(r.venueId))
  const favorites = new Set(rosters.flatMap((r) => r.favorites))
  const blocked = new Set(rosters.flatMap((r) => r.blocked.map((b) => b.workerId)))

  const ranked = ctx.data.workers
    .filter(
      (w) =>
        w.status === "Active" &&
        !blocked.has(w.id) &&
        workerInScope(w, ctx.data, ctx.persona) &&
        (!position || w.positionIds.includes(position.id)) &&
        (!venue || w.metro === venue.metro)
    )
    .map((w) => ({ w, score: w.reliability * w.rating, done: completed.get(w.id) ?? 0 }))
    .sort((a, b) => Number(b.done > 0) - Number(a.done > 0) || b.score - a.score || b.done - a.done)
  const top = ranked.slice(0, 5)
  const label = position ? pluralTitle(position.title).toLowerCase() : "Pros"

  if (top.length === 0) {
    return {
      intent: "reliable",
      blocks: [text(`I couldn’t find active ${label} ${scopePhrase(ctx, venue)} yet.`)],
      suggestions: ["Which events still have open shifts?"],
    }
  }
  const favCount = top.filter((t) => favorites.has(t.w.id)).length
  const floor = Math.min(...top.map((t) => t.w.reliability))
  const favWord = ctx.persona.id === "supplier" ? "venue favorite" : "roster favorite"
  const favPhrase =
    favCount === 0
      ? ""
      : favCount === top.length
        ? top.length === 1
          ? `, and they’re a ${favWord}`
          : `, and every one is a ${favWord}`
        : `, and ${num(favCount)} ${favCount === 1 ? `is a ${favWord}` : `are ${favWord}s`}`
  const history =
    ctx.persona.id === "venue" ? (n: number) => `${plural(n, "shift")} with you` : ctx.persona.id === "supplier" ? (n: number) => `${plural(n, "Compass shift")}` : (n: number) => `${plural(n, "program shift")}`
  return {
    intent: "reliable",
    blocks: [
      text(
        `Your most dependable ${label} ${scopePhrase(ctx, venue)}, ranked by reliability × rating. ${top.length === 1 ? "They show" : `All ${num(top.length)} show`} up **${pct(floor)}+** of the time${favPhrase}.`
      ),
      {
        type: "records",
        items: top.map(({ w, done }) => {
          const supplier = ctx.lookups.suppliers.get(w.supplierId)
          const role = position ?? ctx.lookups.positions.get(w.positionIds[0])
          const source = ctx.persona.id === "supplier" ? (metroById(w.metro)?.label ?? w.metro) : (supplier?.shortName ?? "")
          return {
            id: w.id,
            title: workerName(w),
            subtitle: `${role?.title ?? "Pro"} · ${source} · ${done ? history(done) : ctx.persona.id === "venue" ? "new to your venues" : "no recent shifts"}`,
            meta: `${pct(w.reliability)} · ${w.rating.toFixed(2)}★`,
            badge: favorites.has(w.id) ? { label: "Favorite", tone: "warning" } : undefined,
            href: `/workforce/${w.id}`,
            media: workerMedia(w),
          }
        }),
      },
      { type: "actions", items: [{ label: "Browse workforce", href: "/workforce", icon: "workforce", primary: true }] },
    ],
    suggestions: [
      position ? `Which ${pluralTitle(position.title).toLowerCase()} had no-shows recently?` : "Any no-shows in the last two weeks?",
      ctx.persona.id !== "venue"
        ? "Which Pros are near the 390-hour cap?"
        : (position && position.id !== "p-cash-bartender") || (venue && venue.id !== "v-wrigley")
          ? `Need 6 ${position ? pluralTitle(position.title).toLowerCase() : "cash bartenders"} at ${venue?.shortName ?? "Wrigley"} Saturday 4-11pm`
          : DEMO_DRAFT,
    ],
  }
}

// Intent: no-shows & late ------------------------------------------------------------

function attendance(prompt: Prompt, ctx: EngineContext): Reply {
  const { venue, outOfScope } = resolveVenue(prompt, ctx)
  if (outOfScope) return outOfScopeReply(outOfScope, ctx)
  const position = matchPosition(prompt, ctx)
  const today = toISODate(ctx.now)
  const from = toISODate(addDays(ctx.now, -13))
  const supplier = ctx.persona.id === "supplier"

  const relevant = (req: StaffingRequest | undefined): req is StaffingRequest =>
    !!req && requestInScope(req, ctx.persona) && (!venue || req.venueId === venue.id) && (!position || req.positionId === position.id)
  const ownWorker = (workerId?: string) => !supplier || (!!workerId && ctx.lookups.workers.get(workerId)?.supplierId === ctx.persona.supplierId)

  let scheduled = 0
  const noShows: { shiftId: string; workerId?: string; req: StaffingRequest; date: ISODate }[] = []
  const backfilledIds = new Set(ctx.data.shifts.filter((s) => s.backfillFor).map((s) => s.backfillFor!))
  for (const s of ctx.data.shifts) {
    if (s.date < from || s.date > today || !s.workerId || s.backfillFor) continue
    if (s.status !== "Completed" && s.status !== "Checked in" && s.status !== "No-show") continue
    const req = ctx.lookups.requests.get(s.requestId)
    if (!relevant(req) || !ownWorker(s.workerId)) continue
    scheduled++
    if (s.status === "No-show") noShows.push({ shiftId: s.id, workerId: s.workerId, req, date: s.date })
  }
  const late = ctx.data.timeEntries
    .filter((e) => e.date >= from && e.date <= today && e.anomalies.includes("late_arrival") && entryInScope(e, ctx.lookups, ctx.persona))
    .flatMap((e) => {
      const req = ctx.lookups.requests.get(e.requestId)
      if (!relevant(req)) return []
      const minutes = differenceInMinutes(parseLocal(e.clockIn), shiftWindow(e.date, req.startTime, req.endTime).start)
      return [{ id: e.id, workerId: e.workerId, req, date: e.date, minutes }]
    })
  const backfilled = noShows.filter((n) => backfilledIds.has(n.shiftId)).length
  const rateValue = scheduled ? noShows.length / scheduled : 0
  const who = supplier ? "Your Pros had" : "There were"
  const where = venue ? ` at ${venue.name}` : ""

  const examples: RecordItem[] = [
    ...noShows.map((n) => ({ kind: "noshow" as const, date: n.date, workerId: n.workerId, req: n.req, id: n.shiftId, minutes: 0 })),
    ...late.map((l) => ({ kind: "late" as const, date: l.date, workerId: l.workerId, req: l.req, id: l.id, minutes: l.minutes })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date) || (a.kind === "noshow" ? -1 : 1))
    .slice(0, 5)
    .map((x) => {
      const w = x.workerId ? ctx.lookups.workers.get(x.workerId) : undefined
      const v = ctx.lookups.venues.get(x.req.venueId)
      const p = ctx.lookups.positions.get(x.req.positionId)
      return {
        id: x.id,
        title: workerName(w),
        subtitle: `${p?.title ?? ""} · ${v?.shortName ?? ""} · ${relativeDay(x.date, ctx.now)}`,
        badge:
          x.kind === "noshow"
            ? backfilledIds.has(x.id)
              ? { label: "No-show · backfilled", tone: "warning" as Tone }
              : { label: "No-show", tone: "danger" as Tone }
            : { label: `${num(x.minutes)} min late`, tone: "warning" as Tone },
        href: w ? `/workforce/${w.id}` : undefined,
        media: w ? workerMedia(w) : undefined,
      }
    })

  const blocks: Block[] = [
    text(
      !noShows.length && late.length
        ? `${supplier ? "Your Pros had no" : "No"} no-shows across ${plural(scheduled, "scheduled shift")}${where} in the last 14 days, but **${plural(late.length, "late arrival")}** (clocked in more than 15 minutes after start).`
        : noShows.length
          ? `${who} **${plural(noShows.length, "no-show")}** out of ${plural(scheduled, "scheduled shift")}${where} in the last 14 days (**${pct(rateValue, 1)}**)${late.length ? `, plus **${plural(late.length, "late arrival")}** (clocked in more than 15 minutes after start)` : " and no late arrivals"}.`
          : `Clean sheet${where}: no no-shows or late arrivals across ${plural(scheduled, "shift")} in the last 14 days.`
    ),
    {
      type: "stats",
      items: [
        { label: "No-shows", value: num(noShows.length), tone: noShows.length ? "danger" : "success" },
        { label: "No-show rate", value: pct(rateValue, 1) },
        { label: "Late arrivals", value: num(late.length), tone: late.length ? "warning" : "success" },
        { label: "Backfilled", value: num(backfilled), hint: ctx.data.policies.autoBackfillNoShows ? "Auto-backfill on" : "Auto-backfill off" },
      ],
    },
  ]
  if (examples.length) blocks.push({ type: "records", title: "Most recent", items: examples })
  if (ctx.data.policies.autoBackfillNoShows && !supplier) {
    blocks.push(
      text("Auto-backfill is on: a Pro who hasn’t checked in 20 minutes after start is marked a no-show, and Mise books an eligible replacement when at least 90 minutes of the shift remain.")
    )
  }
  blocks.push({ type: "actions", items: [{ label: "Open workforce", href: "/workforce", icon: "workforce", primary: true }] })
  return { intent: "attendance", blocks, suggestions: ["Who are my most reliable bartenders?", "What needs my attention today?"] }
}

// Intent: invoices & payments --------------------------------------------------------

function invoices(prompt: Prompt, ctx: EngineContext): Reply {
  const fee = ctx.data.policies.msaFeePct
  const today = toISODate(ctx.now)
  const since = toISODate(addDays(ctx.now, -30))
  const supplier = ctx.persona.id === "supplier"
  const mine = ctx.data.invoices.filter((i) => invoiceInScope(i, ctx.persona))
  const totals = new Map(mine.map((i) => [i.id, lineTotals(i.lines, fee)]))
  const sum = (list: typeof mine, key: "totalDue" | "netToSupplier" | "programFee" = "totalDue") => list.reduce((s, i) => s + (totals.get(i.id)?.[key] ?? 0), 0)
  const pending = mine.filter((i) => i.status === "Pending approval").sort((a, b) => sum([b]) - sum([a]))
  const approved = mine.filter((i) => i.status === "Approved")
  const disputed = mine.filter((i) => i.status === "Disputed")
  const paid = mine.filter((i) => i.status === "Paid" && i.paidAt && i.paidAt.slice(0, 10) >= since)

  const invoiceRecord = (inv: (typeof mine)[number]): RecordItem => {
    const s = ctx.lookups.suppliers.get(inv.supplierId)
    const v = ctx.lookups.venues.get(inv.venueId)
    const tone: Tone = inv.status === "Disputed" ? "danger" : inv.status === "Pending approval" ? "warning" : inv.status === "Paid" ? "success" : "primary"
    return {
      id: inv.id,
      title: `${inv.id} · ${supplier ? (v?.shortName ?? "") : (s?.shortName ?? "")}`,
      subtitle: `${supplier ? "" : `${v?.shortName ?? ""} · `}${isoRange(inv.periodStart, inv.periodEnd)} · due ${formatDate(inv.dueDate, "MMM d")}`,
      meta: money(totals.get(inv.id)?.totalDue ?? 0),
      badge: { label: inv.status === "Pending approval" ? "Pending" : inv.status, tone },
      href: `/invoices/${inv.id}`,
      media: { kind: "icon", icon: "invoice", tone },
    }
  }

  if (supplier) {
    const payments = ctx.data.payments.filter((p) => p.supplierId === ctx.persona.supplierId)
    const upcoming = payments.filter((p) => p.status !== "Settled").sort((a, b) => a.date.localeCompare(b.date))
    const settled = payments.filter((p) => p.status === "Settled" && p.date >= since)
    const scheduledIds = new Set(upcoming.flatMap((p) => p.invoiceIds))
    const queued = approved.filter((i) => !scheduledIds.has(i.id))
    const next = upcoming[0]
    const queuedLine = queued.length
      ? ` ${plural(queued.length, `${next ? "more " : ""}approved invoice`)} (${money(sum(queued))}) ${queued.length === 1 ? "is" : "are"} waiting for ${next ? "a later" : "the next"} payment run.`
      : ""
    const blocks: Block[] = [
      text(
        next
          ? `Your next payment is **${money(next.amount, true)}** on **${formatDate(next.date, "EEE, MMM d")}** via ${next.method}, covering ${plural(next.invoiceIds.length, "invoice")}.${queuedLine}`
          : `No payments are scheduled right now.${queuedLine}`
      ),
      {
        type: "stats",
        items: [
          { label: "Scheduled", value: money(upcoming.reduce((s, p) => s + p.amount, 0)), hint: plural(upcoming.length, "payment") },
          { label: "With venues", value: money(sum(pending)), hint: `${plural(pending.length, "invoice")} pending approval`, tone: pending.length ? "warning" : undefined },
          { label: "Disputed", value: money(sum(disputed)), hint: plural(disputed.length, "invoice"), tone: disputed.length ? "danger" : undefined },
          { label: "Settled · 30 days", value: money(settled.reduce((s, p) => s + p.amount, 0)), hint: `Net of the ${fee}% MSA fee` },
        ],
      },
    ]
    if (upcoming.length) {
      blocks.push({
        type: "records",
        title: "Upcoming payments",
        items: upcoming.slice(0, 3).map((p) => ({
          id: p.id,
          title: `${p.id} · ${money(p.amount, true)}`,
          subtitle: `${p.method} · ${plural(p.invoiceIds.length, "invoice")} · ref ${p.reference}`,
          meta: formatDate(p.date, "EEE, MMM d"),
          badge: { label: p.status, tone: "info" },
          href: "/invoices",
          media: { kind: "icon", icon: "payment", tone: "info" },
        })),
      })
    }
    if (pending.length || disputed.length) {
      blocks.push({ type: "records", title: "Waiting on venues", items: [...disputed, ...pending].slice(0, 4).map(invoiceRecord) })
    }
    blocks.push({ type: "actions", items: [{ label: "Open invoices", href: "/invoices", icon: "invoice", primary: true }] })
    return { intent: "invoices", blocks, suggestions: ["Any disputed timesheets?", "How much did we bill this month?"] }
  }

  const nextRun = ctx.data.payments.filter((p) => p.status !== "Settled" && p.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
  const lines: string[] = []
  if (pending.length) lines.push(`**${plural(pending.length, "invoice")}** (${money(sum(pending))}) ${ctx.persona.id === "venue" ? "need your approval" : "are pending venue approval"}.`)
  else lines.push("No invoices are waiting for approval.")
  if (approved.length) lines.push(`${plural(approved.length, "approved invoice")} (${money(sum(approved))}) ${nextRun ? `go out on the ${formatDate(nextRun.date, "EEE, MMM d")} payment run` : "are queued for payment"}.`)
  if (paid.length) lines.push(`Paid in the last 30 days: **${money(sum(paid))}** across ${plural(paid.length, "invoice")}${ctx.persona.id === "program" ? `, including ${money(sum(paid, "programFee"))} in ${fee}% MSA program fees` : ""}.`)
  if (disputed.length) lines.push(`${plural(disputed.length, "invoice")} ${disputed.length === 1 ? "is" : "are"} in dispute.`)

  return {
    intent: "invoices",
    blocks: [
      text(lines.join(" ")),
      {
        type: "stats",
        items: [
          { label: "Pending approval", value: money(sum(pending)), hint: plural(pending.length, "invoice"), tone: pending.length ? "warning" : undefined },
          { label: "Approved · scheduled", value: money(sum(approved)), hint: plural(approved.length, "invoice") },
          { label: "Paid · 30 days", value: money(sum(paid)), hint: plural(paid.length, "invoice"), tone: "success" },
          { label: "Disputed", value: num(disputed.length), tone: disputed.length ? "danger" : "muted" },
        ],
      },
      ...(pending.length || disputed.length
        ? [{ type: "records" as const, title: "Needs a decision", items: [...disputed, ...pending].slice(0, 5).map(invoiceRecord) }]
        : []),
      { type: "actions", items: [{ label: "Open invoices", href: "/invoices", icon: "invoice", primary: true }] },
    ],
    suggestions: ["How much did we spend last week?", ctx.persona.id === "program" ? "Which suppliers have compliance issues?" : "Any disputed timesheets?"],
  }
}

// Intent: 390-hour cap ---------------------------------------------------------------

function hoursCap(ctx: EngineContext): Reply {
  const { contractualHoursCap: cap, contractualHoursWarnPct: warnPct, blockOverCapWorkers } = ctx.data.policies
  const warn = cap * (warnPct / 100)
  const list = ctx.data.workers
    .filter((w) => w.status !== "Inactive" && w.compassHours >= warn && workerInScope(w, ctx.data, ctx.persona))
    .sort((a, b) => b.compassHours - a.compassHours)
  const atCap = list.filter((w) => w.compassHours >= cap).length
  if (list.length === 0) {
    return { intent: "cap", blocks: [text(`No Pros ${scopePhrase(ctx)} are above ${warnPct}% of the ${cap}-hour contractual cap.`)], suggestions: ["Who are my most reliable bartenders?"] }
  }
  return {
    intent: "cap",
    blocks: [
      text(
        `**${plural(list.length, "Pro")}** ${scopePhrase(ctx)} ${list.length === 1 ? "is" : "are"} past ${warnPct}% of the **${cap}-hour** contractual cap${atCap ? `, and **${num(atCap)}** ${atCap === 1 ? "has" : "have"} hit it` : ""}. ${blockOverCapWorkers ? "Policy blocks over-cap Pros from new bookings, so plan conversions or rotations now." : "Over-cap Pros can still be booked under current policy."}`
      ),
      {
        type: "records",
        items: list.slice(0, 6).map((w) => {
          const left = Math.max(0, cap - w.compassHours)
          return {
            id: w.id,
            title: workerName(w),
            subtitle: `${ctx.lookups.suppliers.get(w.supplierId)?.shortName ?? ""} · ${metroById(w.metro)?.label ?? w.metro} · ${num(w.lifetimeShifts)} lifetime shifts`,
            meta: `${num(w.compassHours)}/${cap}h`,
            badge: left === 0 ? { label: "At cap", tone: "danger" } : { label: `${num(left)}h left`, tone: "warning" },
            href: `/workforce/${w.id}`,
            media: workerMedia(w),
          }
        }),
        footer: list.length > 6 ? `+${plural(list.length - 6, "more Pro")} approaching the cap` : undefined,
      },
      {
        type: "actions",
        items: [
          { label: "Open workforce", href: "/workforce", icon: "workforce", primary: true },
          ...(ctx.persona.id === "program" ? [{ label: "Policies", href: "/policies", icon: "compliance" as const }] : []),
        ],
      },
    ],
    suggestions: ["Which suppliers have compliance issues?", "Who are my most reliable bartenders?"],
  }
}

// Intent: compliance -----------------------------------------------------------------

function compliance(ctx: EngineContext): Reply {
  const today = toISODate(ctx.now)
  const supplierScope =
    ctx.persona.id === "supplier"
      ? ctx.data.suppliers.filter((s) => s.id === ctx.persona.supplierId)
      : ctx.persona.id === "venue"
        ? ctx.data.suppliers.filter((s) => ctx.data.requests.some((r) => venueInScope(r.venueId, ctx.persona) && r.supplierIds.includes(s.id)))
        : ctx.data.suppliers
  const workers = ctx.data.workers.filter((w) => w.status !== "Inactive" && workerInScope(w, ctx.data, ctx.persona))
  const flagsBySupplier = new Map<string, { expired: number; expiring: number }>()
  let expiredWorkers = 0
  let expiringWorkers = 0
  for (const w of workers) {
    const flags = workerComplianceFlags(w, ctx.data, today)
    const expired = flags.some((f) => f.kind === "cert-expired")
    const expiring = !expired && flags.some((f) => f.kind === "cert-expiring")
    if (!expired && !expiring) continue
    if (expired) expiredWorkers++
    else expiringWorkers++
    const entry = flagsBySupplier.get(w.supplierId) ?? { expired: 0, expiring: 0 }
    if (expired) entry.expired++
    else entry.expiring++
    flagsBySupplier.set(w.supplierId, entry)
  }

  const rows = supplierScope
    .map((s) => {
      const days = Math.round((parseLocal(s.coiExpires).getTime() - parseLocal(today).getTime()) / 86_400_000)
      const certs = flagsBySupplier.get(s.id) ?? { expired: 0, expiring: 0 }
      const issues: string[] = []
      let badge: { label: string; tone: Tone } = { label: "Compliant", tone: "success" }
      let severity = 0
      if (certs.expired) {
        issues.push(`${plural(certs.expired, "Pro")} with expired certs`)
        badge = { label: "Cert gaps", tone: "warning" }
        severity = 1
      }
      if (days >= 0 && days <= 30) {
        issues.unshift(`COI expires in ${plural(days, "day")}`)
        badge = { label: "COI expiring", tone: "warning" }
        severity = 2
      }
      if (!s.msaSigned) {
        issues.unshift("MSA not signed")
        badge = { label: "Action needed", tone: "danger" }
        severity = 3
      }
      if (days < 0) {
        issues.unshift(`COI expired ${plural(-days, "day")} ago (distribution paused)`)
        badge = { label: "Action needed", tone: "danger" }
        severity = 3
      }
      return { s, days, certs, issues, badge, severity }
    })
    .sort((a, b) => b.severity - a.severity || a.days - b.days)
  const flagged = rows.filter((r) => r.issues.length)
  const coiExpired = rows.filter((r) => r.days < 0).length
  const coiSoon = rows.filter((r) => r.days >= 0 && r.days <= 30).length

  const headline =
    ctx.persona.id === "supplier"
      ? flagged.length
        ? `Here’s where ${ctx.persona.org} stands: ${joinList(flagged[0].issues)}.`
        : `${ctx.persona.org} is fully compliant: COI valid until ${formatDate(rows[0]?.s.coiExpires ?? today, "MMM d, yyyy")} and no expired certifications.`
      : flagged.length
        ? `**${plural(flagged.length, "supplier")}** need${flagged.length === 1 ? "s" : ""} attention${coiExpired ? `, including **${num(coiExpired)}** with an expired COI` : ""}. ${num(expiredWorkers)} active ${expiredWorkers === 1 ? "Pro has" : "Pros have"} an expired certification and ${num(expiringWorkers)} more expire within 30 days.`
        : `Every supplier is compliant: COIs current, MSAs signed. ${num(expiredWorkers)} Pros have expired certifications.`

  return {
    intent: "compliance",
    blocks: [
      text(headline),
      {
        type: "stats",
        items: [
          { label: "Suppliers flagged", value: num(flagged.length), tone: flagged.length ? "warning" : "success" },
          { label: "COI expired", value: num(coiExpired), tone: coiExpired ? "danger" : "muted" },
          { label: "COI ≤ 30 days", value: num(coiSoon), tone: coiSoon ? "warning" : "muted" },
          { label: "Pros · expired certs", value: num(expiredWorkers), tone: expiredWorkers ? "danger" : "muted" },
        ],
      },
      {
        type: "records",
        items: (flagged.length ? flagged : rows).slice(0, 5).map((r) => ({
          id: r.s.id,
          title: r.s.name,
          subtitle: r.issues.length ? r.issues.join(" · ") : `COI valid until ${formatDate(r.s.coiExpires, "MMM d, yyyy")}`,
          meta: `Tier ${r.s.tier}`,
          badge: r.badge,
          href: ctx.persona.id === "program" ? "/suppliers" : "/workforce",
          media: { kind: "venue", label: r.s.name, hue: r.s.hue },
        })),
      },
      {
        type: "actions",
        items: [
          ...(ctx.persona.id === "program" ? [{ label: "Open suppliers", href: "/suppliers", icon: "coi" as const, primary: true }] : []),
          { label: "Workforce", href: "/workforce", icon: "workforce", primary: ctx.persona.id !== "program" },
        ],
      },
    ],
    suggestions: ["Which Pros are near the 390-hour cap?", ctx.persona.id === "program" ? "What did we spend this month?" : "What needs my attention today?"],
  }
}

// Intent: approvals ------------------------------------------------------------------

function approvals(ctx: EngineContext): Reply {
  const limit = ctx.data.policies.autoApproveRequestsUnder
  const pendingReqs = ctx.data.requests
    .filter((r) => r.state === "pending" && requestInScope(r, ctx.persona) && (ctx.persona.id !== "venue" || venueInScope(r.venueId, ctx.persona)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const changes = ctx.data.changeRequests
    .filter((c) => c.status === "Pending")
    .filter((c) => ctx.persona.id === "program" || c.requestedByPersona === ctx.persona.id)
    .filter((c) => ctx.persona.id !== "venue" || !c.venueId || venueInScope(c.venueId, ctx.persona))
  const inbox = ctx.persona.id === "venue" ? buildInbox(ctx.data, ctx.lookups, ctx.persona, ctx.now).filter((i) => i.kind === "timesheets" || i.kind === "tips" || i.kind === "invoice") : []

  const reqRecords: RecordItem[] = pendingReqs.map((r) => {
    const v = ctx.lookups.venues.get(r.venueId)
    const p = ctx.lookups.positions.get(r.positionId)
    const cost = r.dates.length * r.headcount * payableShiftHours(r) * r.billRate
    return {
      id: r.id,
      title: `${r.id} · ${r.headcount} × ${p?.title ?? ""}`,
      subtitle: `${v?.shortName ?? ""} · ${reqLabel(r)} · ${plural(r.dates.length, "date")} · by ${r.createdBy}`,
      meta: money(cost),
      badge: cost > limit ? { label: `Over ${money(limit)}`, tone: "warning" } : { label: "Pending", tone: "warning" },
      href: `/requests/${r.id}`,
      media: v ? venueMedia(v) : undefined,
    }
  })
  const changeRecords: RecordItem[] = changes.map((c) => ({
    id: c.id,
    title: c.summary,
    subtitle: `${c.type} · requested by ${c.requestedBy} · ${timeAgo(c.createdAt, ctx.now)}`,
    badge: { label: "Change", tone: "info" },
    href: c.requestId ? `/requests/${c.requestId}` : "/rates",
    media: { kind: "icon", icon: "change", tone: "info" },
  }))

  if (ctx.persona.id === "program") {
    const value = pendingReqs.reduce((sum, r) => sum + r.dates.length * r.headcount * payableShiftHours(r) * r.billRate, 0)
    return {
      intent: "approvals",
      blocks: [
        text(
          pendingReqs.length || changes.length
            ? `**${plural(pendingReqs.length, "request")}** (${money(value)}) and **${plural(changes.length, "change request")}** are waiting on you. Requests land here when they’re over the ${money(limit)} auto-approve limit.`
            : "Nothing is waiting for your approval. Every request and change has been decided."
        ),
        ...(reqRecords.length ? [{ type: "records" as const, title: "Staffing requests", items: reqRecords.slice(0, 5) }] : []),
        ...(changeRecords.length ? [{ type: "records" as const, title: "Change requests", items: changeRecords.slice(0, 5) }] : []),
        { type: "actions", items: [{ label: "Open inbox", href: "/inbox", icon: "inbox", primary: true }] },
      ],
      suggestions: ["Which suppliers have compliance issues?", "What did we spend this month?"],
    }
  }

  if (ctx.persona.id === "supplier") {
    return {
      intent: "approvals",
      blocks: [
        text(changes.length ? `You have **${plural(changes.length, "change request")}** waiting on the program office.` : "Nothing of yours is waiting on approval right now."),
        ...(changeRecords.length ? [{ type: "records" as const, items: changeRecords }] : []),
      ],
      suggestions: ["What payments are scheduled?", "Any disputed timesheets?"],
    }
  }

  const tsCount = inbox.filter((i) => i.kind === "timesheets").reduce((s, i) => s + (i.count ?? 0), 0)
  const yours = inbox.reduce((s, i) => s + (i.amount ?? 0), 0)
  return {
    intent: "approvals",
    blocks: [
      text(
        `Waiting on you: **${plural(tsCount, "timesheet")}**${inbox.some((i) => i.kind === "tips") ? ", tip batches" : ""}${inbox.some((i) => i.kind === "invoice") ? " and invoices" : ""} worth ${money(yours)}. Waiting on the program office: **${plural(pendingReqs.length, "request")}** and ${plural(changes.length, "change request")}.`
      ),
      ...(inbox.length
        ? [
            {
              type: "records" as const,
              title: "Your approvals",
              items: inbox.slice(0, 4).map((i) => ({
                id: i.id,
                title: i.title,
                subtitle: i.subtitle,
                meta: i.amount ? money(i.amount) : undefined,
                badge: i.flagged ? { label: `${num(i.flagged)} flagged`, tone: "warning" as Tone } : undefined,
                href: i.href,
                media: { kind: "icon" as const, icon: INBOX_ICON[i.kind], tone: (i.priority === "high" ? "danger" : "muted") as Tone },
              })),
            },
          ]
        : []),
      ...(reqRecords.length || changeRecords.length ? [{ type: "records" as const, title: "With the program office", items: [...reqRecords, ...changeRecords].slice(0, 4) }] : []),
      {
        type: "actions",
        items: [
          { label: "Review timesheets", href: "/timesheets", icon: "timesheets", primary: true },
          { label: "Open inbox", href: "/inbox", icon: "inbox" },
        ],
      },
    ],
    suggestions: ["Any disputed timesheets?", "How much did we spend last week?"],
  }
}

// Intent: disputes -------------------------------------------------------------------

function disputes(ctx: EngineContext): Reply {
  const supplier = ctx.persona.id === "supplier"
  const entries = ctx.data.timeEntries
    .filter((e) => e.status === "Disputed" && e.dispute && entryInScope(e, ctx.lookups, ctx.persona))
    .sort((a, b) => (b.dispute?.at ?? "").localeCompare(a.dispute?.at ?? ""))
  const open = entries.filter((e) => !e.dispute?.response)
  const amount = entries.reduce((s, e) => s + e.amount, 0)
  const invoiceDisputes = supplier ? [] : ctx.data.invoices.filter((i) => i.status === "Disputed" && invoiceInScope(i, ctx.persona))

  if (entries.length === 0 && invoiceDisputes.length === 0) {
    return { intent: "disputes", blocks: [text("No disputed timesheets right now. Every recorded shift is either approved or pending review.")], suggestions: supplier ? ["What payments are scheduled?"] : ["What needs my attention today?"] }
  }
  return {
    intent: "disputes",
    blocks: [
      text(
        supplier
          ? `You have **${plural(entries.length, "disputed timesheet")}** (${money(amount)}). ${
              open.length === 0
                ? "You’ve responded to all of them."
                : open.length === entries.length
                  ? entries.length === 1
                    ? "It still needs your response."
                    : "All of them still need your response."
                  : `**${num(open.length)}** still ${open.length === 1 ? "needs" : "need"} your response.`
            } Disputed hours are held back from invoicing until they’re resolved.`
          : `**${plural(entries.length, "timesheet")}** (${money(amount)}) ${entries.length === 1 ? "is" : "are"} in dispute; ${num(open.length)} ${open.length === 1 ? "is" : "are"} waiting on the supplier.${invoiceDisputes.length ? ` Plus ${plural(invoiceDisputes.length, "invoice dispute")}.` : ""}`
      ),
      {
        type: "records",
        items: entries.slice(0, 5).map((e) => {
          const w = ctx.lookups.workers.get(e.workerId)
          const req = ctx.lookups.requests.get(e.requestId)
          const v = req ? ctx.lookups.venues.get(req.venueId) : undefined
          return {
            id: e.id,
            title: `${e.id} · ${workerName(w)}`,
            subtitle: `${e.dispute?.reason ?? "Disputed"} · ${v?.shortName ?? ""} · ${formatDate(e.date, "MMM d")} · raised by ${e.dispute?.by ?? "venue"}`,
            meta: money(e.amount),
            badge: e.dispute?.response ? { label: "Responded", tone: "info" } : { label: supplier ? "Respond" : "Awaiting supplier", tone: "danger" },
            href: "/timesheets?tab=disputed",
            media: w ? workerMedia(w) : undefined,
          }
        }),
      },
      ...(invoiceDisputes.length
        ? [
            {
              type: "records" as const,
              title: "Invoice disputes",
              items: invoiceDisputes.map((i) => ({
                id: i.id,
                title: `${i.id} · ${ctx.lookups.suppliers.get(i.supplierId)?.shortName ?? ""}`,
                subtitle: i.disputes.find((d) => d.status === "Open")?.reason ?? "Open dispute",
                meta: money(lineTotals(i.lines, ctx.data.policies.msaFeePct).totalDue),
                badge: { label: "Disputed", tone: "danger" as Tone },
                href: `/invoices/${i.id}`,
                media: { kind: "icon" as const, icon: "invoice" as const, tone: "danger" as Tone },
              })),
            },
          ]
        : []),
      { type: "actions", items: [{ label: "Open disputed timesheets", href: "/timesheets?tab=disputed", icon: "dispute", primary: true }] },
    ],
    suggestions: supplier ? ["What payments are scheduled?", "Which shifts can we still fill this week?"] : ["What needs my attention today?", "Show requests waiting for my approval"],
  }
}

// Intent: Pro profile ----------------------------------------------------------------

function findWorker(prompt: Prompt, ctx: EngineContext): Worker | undefined {
  const lower = prompt.lower
  let best: { w: Worker; len: number } | undefined
  for (const w of ctx.data.workers) {
    for (const name of new Set([`${w.firstName} ${w.lastName}`, `${w.preferredName ?? w.firstName} ${w.lastName}`])) {
      const n = name.toLowerCase()
      if (n.length > (best?.len ?? 0) && lower.includes(` ${n}`) && new RegExp(`${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`).test(lower)) best = { w, len: n.length }
    }
  }
  return best?.w
}

function proProfile(worker: Worker, ctx: EngineContext): Reply {
  if (!workerInScope(worker, ctx.data, ctx.persona)) {
    return {
      intent: "profile",
      blocks: [
        text(
          ctx.persona.id === "supplier"
            ? `${workerName(worker)} works through ${ctx.lookups.suppliers.get(worker.supplierId)?.shortName ?? "another supplier"}, so they’re outside your workforce scope.`
            : `${workerName(worker)} isn’t in your workforce scope.`
        ),
      ],
    }
  }
  const today = toISODate(ctx.now)
  const cap = ctx.data.policies.contractualHoursCap
  const supplier = ctx.lookups.suppliers.get(worker.supplierId)
  const shifts = ctx.data.shifts.filter((s) => s.workerId === worker.id)
  const visible = shifts.filter((s) => {
    const req = ctx.lookups.requests.get(s.requestId)
    return !!req && requestInScope(req, ctx.persona)
  })
  const upcoming = visible.filter((s) => s.date >= today && (s.status === "Confirmed" || s.status === "Checked in")).sort((a, b) => a.date.localeCompare(b.date))
  const recent = visible.filter((s) => s.date < today || s.status === "Completed").sort((a, b) => b.date.localeCompare(a.date))
  const noShows = visible.filter((s) => s.status === "No-show").length
  const flags = workerComplianceFlags(worker, ctx.data, today)
  const positions = worker.positionIds.map((id) => ctx.lookups.positions.get(id)?.title).filter(Boolean) as string[]

  const shiftRecord = (s: (typeof shifts)[number]): RecordItem => {
    const req = ctx.lookups.requests.get(s.requestId)!
    const v = ctx.lookups.venues.get(req.venueId)
    const p = ctx.lookups.positions.get(req.positionId)
    return {
      id: s.id,
      title: `${p?.title ?? ""} · ${reqLabel(req)}`,
      subtitle: `${v?.shortName ?? ""} · ${relativeDay(s.date, ctx.now)} · ${req.id}`,
      badge: { label: s.status, tone: s.status === "No-show" ? "danger" : s.status === "Completed" ? "neutral" : s.status === "Checked in" ? "success" : "primary" },
      href: `/requests/${req.id}`,
      media: v ? venueMedia(v) : undefined,
    }
  }

  return {
    intent: "profile",
    blocks: [
      {
        type: "records",
        items: [
          {
            id: worker.id,
            title: workerName(worker),
            subtitle: `${joinList(positions.slice(0, 3))} · ${supplier?.shortName ?? ""} · ${metroById(worker.metro)?.label ?? worker.metro}`,
            badge: worker.status === "Active" ? { label: "Active", tone: "success" } : { label: worker.status, tone: "warning" },
            href: `/workforce/${worker.id}`,
            media: workerMedia(worker),
          },
        ],
      },
      {
        type: "stats",
        items: [
          { label: "Reliability", value: pct(worker.reliability), tone: worker.reliability >= 0.95 ? "success" : undefined },
          { label: "Rating", value: `${worker.rating.toFixed(2)}★` },
          { label: "Lifetime shifts", value: num(worker.lifetimeShifts) },
          { label: "Contract hours", value: `${num(worker.compassHours)}/${cap}`, tone: worker.compassHours >= cap ? "danger" : worker.compassHours >= cap * 0.85 ? "warning" : undefined },
        ],
      },
      text(
        `${worker.preferredName ?? worker.firstName} has worked **${plural(recent.filter((s) => s.status === "Completed").length, "shift")}** ${scopePhrase(ctx)}${noShows ? ` with ${plural(noShows, "no-show")}` : " with no no-shows"}.${upcoming.length ? ` Next up: ${inlineDay(upcoming[0].date, ctx.now)}.` : " Nothing booked ahead."}${flags.length ? ` Heads up: ${joinList(flags.map((f) => f.label.toLowerCase()))}.` : ""}`
      ),
      ...(upcoming.length ? [{ type: "records" as const, title: "Upcoming", items: upcoming.slice(0, 3).map(shiftRecord) }] : []),
      ...(recent.length ? [{ type: "records" as const, title: "Recent", items: recent.slice(0, 3).map(shiftRecord) }] : []),
      { type: "actions", items: [{ label: "Open profile", href: `/workforce/${worker.id}`, icon: "workforce", primary: true }] },
    ],
    suggestions: ["Who are my most reliable bartenders?", "Which Pros are near the 390-hour cap?"],
  }
}

// Intent: a specific request, timesheet or invoice -----------------------------------

const RECORD_ID = /\b(jp|ts|inv)-\d{3,6}\b/

function recordNotFound(id: string, ctx: EngineContext): Reply {
  return {
    intent: "record-missing",
    blocks: [text(`I couldn’t find **${id}** in ${ctx.persona.org}’s workspace. Check the ID, or press ⌘K to search requests, Pros and invoices.`)],
    suggestions: SUGGESTIONS[ctx.persona.id].slice(0, 2),
  }
}

function recordOutOfScope(id: string, where: string, ctx: EngineContext): Reply {
  return { intent: "record-scope", blocks: [text(`**${id}** belongs to ${where}, which is outside what you can see as ${ctx.persona.name}.`)], suggestions: SUGGESTIONS[ctx.persona.id].slice(0, 2) }
}

function requestSummary(req: StaffingRequest, ctx: EngineContext): Reply {
  const venue = ctx.lookups.venues.get(req.venueId)
  if (!requestInScope(req, ctx.persona)) return recordOutOfScope(req.id, venue?.name ?? "another venue", ctx)
  const view = buildRequestView(req, ctx.lookups, ctx.now)
  if (!view) return recordNotFound(req.id, ctx)
  const supplier = ctx.persona.id === "supplier"
  const shifts = ctx.lookups.shiftsByRequest.get(req.id) ?? []
  const entries = ctx.lookups.entriesByRequest.get(req.id) ?? []
  const today = toISODate(ctx.now)
  const what = `${num(req.headcount)} × ${view.position.title} at ${view.venue.shortName}${req.eventName ? `, ${req.eventName}` : ""}`
  const times = formatTimeRange(req.startTime, req.endTime)
  const dates = [...req.dates].sort()
  const upcoming = dates.filter((d) => shiftWindow(d, req.startTime, req.endTime).end > ctx.now)
  const dayFill = (date: ISODate) => computeFill(req, shifts.filter((s) => s.date === date))
  const openAhead = upcoming.reduce((sum, d) => sum + dayFill(d).open, 0)
  const next = upcoming[0]
  const nextWindow = next ? shiftWindow(next, req.startTime, req.endTime) : undefined
  const pendingEntries = entries.filter((e) => e.status === "Pending" || e.status === "Disputed").length
  const { fill } = view

  let lead: string
  switch (view.status) {
    case "Draft":
      lead = `**${req.id}** is still a draft (${what}). Finish it in the composer to send it to suppliers.`
      break
    case "Pending approval": {
      const step = req.approvals.find((a) => a.status === "Pending")
      lead = `**${req.id}** (${what}) is waiting on ${step?.approverName ?? "program"} because its ${money(view.estimate)} estimate is over the ${money(ctx.data.policies.autoApproveRequestsUnder)} auto-approve limit. Suppliers see it once it’s approved.`
      break
    }
    case "Cancelled":
      lead = `**${req.id}** (${what}) was cancelled${req.cancelledReason ? `: “${req.cancelledReason.replace(/\.$/, "")}.”` : "."}`
      break
    case "Completed":
      lead = `**${req.id}** (${what}) wrapped up ${inlineDay(dates[dates.length - 1], ctx.now)}: ${plural(fill.completed, "shift")} worked out of ${num(fill.total)}${fill.noShows ? `, with ${plural(fill.noShows, "no-show")}` : ""}. ${pendingEntries ? `${plural(pendingEntries, "timesheet")} still ${pendingEntries === 1 ? "needs" : "need"} a decision.` : "Every timesheet is settled."}`
      break
    default: {
      const live = next === today && nextWindow && ctx.now >= nextWindow.start ? dayFill(today) : undefined
      if (live) {
        lead = `**${req.id}** (${what}) is underway: **${num(live.checkedIn)} on site**${live.completed ? `, ${num(live.completed)} done` : ""}${live.noShows ? `, ${plural(live.noShows, "no-show")}${live.backfilled ? ` (${num(live.backfilled)} backfilled)` : ""}` : ""}${live.open ? ` and ${plural(live.open, "slot")} still open` : ""}.`
      } else {
        lead = `**${req.id}** (${what}) is **${num(fill.filled)}/${num(fill.total)} filled** (${pct(fill.total ? fill.filled / fill.total : 0)}).`
        const when = nextWindow ? startsLabel(nextWindow.start, ctx.now) : ""
        if (openAhead && next) lead += ` ${plural(openAhead, "shift")} ${openAhead === 1 ? "is" : "are"} still open; the next date is ${inlineDay(next, ctx.now)}, ${times} (${when}).`
        else if (nextWindow) lead += ` Every upcoming shift is confirmed, and the next one ${when === "underway" ? "is underway" : when}.`
      }
    }
  }

  const blocks: Block[] = [text(lead)]
  if (req.state === "active") {
    blocks.push({
      type: "stats",
      items: [
        { label: "Filled", value: `${num(fill.filled)}/${num(fill.total)}`, tone: fill.total && fill.filled >= fill.total ? "success" : "warning" },
        { label: "Open ahead", value: num(openAhead), tone: openAhead ? "warning" : "muted" },
        view.status === "Completed"
          ? { label: "No-shows", value: num(fill.noShows), tone: fill.noShows ? "danger" : "muted" }
          : { label: "On site now", value: num(fill.checkedIn), tone: fill.checkedIn ? "success" : "muted" },
        { label: supplier ? "Est. billings" : "Est. cost", value: money(view.estimate), hint: `${formatHours(view.hoursPerShift)} per shift` },
      ],
    })
    const shown = (upcoming.length ? upcoming : dates.slice(-3)).slice(0, 4)
    if (dates.length > 1 || openAhead) {
      blocks.push({
        type: "records",
        title: upcoming.length ? "Upcoming dates" : "Dates",
        items: shown.map((d) => {
          const f = dayFill(d)
          return {
            id: d,
            title: formatDate(d, "EEE, MMM d"),
            subtitle: `${times} · ${num(f.filled)}/${num(f.total)} filled`,
            badge: f.open ? { label: `${num(f.open)} open`, tone: "warning" } : { label: d < today ? "Done" : "Filled", tone: d < today ? "muted" : "success" },
            href: `/schedule?date=${d}`,
            media: { kind: "icon", icon: "calendar", tone: f.open ? "warning" : "muted" },
          }
        }),
        footer: upcoming.length > shown.length ? `+${plural(upcoming.length - shown.length, "more date")}` : undefined,
      })
    }
  }
  const actions: ActionItem[] = [{ label: "Open request", href: `/requests/${req.id}`, icon: "staffing", primary: true }]
  if (entries.length) actions.push({ label: "Timesheets", href: `/timesheets?request=${req.id}`, icon: "timesheets" })
  if (req.state === "active" && next) actions.push(next === today ? { label: "Live board", href: "/schedule?view=live", icon: "live" } : { label: "Schedule", href: `/schedule?date=${next}`, icon: "calendar" })
  blocks.push({ type: "actions", items: actions })
  return {
    intent: "request",
    blocks,
    suggestions: supplier ? ["Which shifts can we still fill this week?", "Any disputed timesheets?"] : ["Which events still have open shifts?", `Who are my most reliable ${pluralTitle(view.position.title).toLowerCase()}?`],
  }
}

const DISPUTE_NEXT_STEP: Record<DisputeReason, string> = {
  "Name not recognized": "Check the sign-in sheet and who checked in on site. If nobody by that name worked, keep the dispute so the supplier voids the entry; if it was a known Pro, approve it.",
  "Worker swap": "Ask the supplier to confirm who actually worked. The hours can stand, but the entry should name the Pro who was on site before it’s approved.",
  "Hours don't match sign-in": "Compare the clock times with your sign-in sheet, adjust the entry to the verified times (adjustments are logged with a reason), then approve.",
  "Rate incorrect": "Compare the billed rate with the request’s bill rate; if they differ, the supplier needs to correct the entry before it’s approved.",
  "Duplicate entry": "Look for a second entry for the same Pro and shift. Approve one and keep the other disputed so it’s never invoiced.",
  "Pro not on site": "Confirm with your on-site lead and the check-in record. If the Pro never arrived, keep the dispute so the supplier voids the entry.",
}

const ANOMALY_NEXT_STEP: Record<AnomalyType, string> = {
  missing_clockout: "confirm the real end time and adjust the clock-out",
  short_shift: "it’s usually an accidental tap, so check for a duplicate entry",
  long_break: "correct the break length",
  late_arrival: "pay follows the clock, so approve as-is unless the Pro actually started on time",
  early_departure: "if you sent the Pro home, the 4-hour minimum applies",
  over_schedule: "confirm the extra time was requested on site",
}

function timesheetSummary(entry: TimeEntry, ctx: EngineContext): Reply {
  const req = ctx.lookups.requests.get(entry.requestId)
  const venue = req ? ctx.lookups.venues.get(req.venueId) : undefined
  if (!entryInScope(entry, ctx.lookups, ctx.persona)) return recordOutOfScope(entry.id, ctx.persona.id === "supplier" ? "another supplier’s Pro" : (venue?.name ?? "another venue"), ctx)
  const worker = ctx.lookups.workers.get(entry.workerId)
  const position = req ? ctx.lookups.positions.get(req.positionId) : undefined
  const supplier = ctx.persona.id === "supplier"
  const name = workerName(worker)
  const first = worker?.preferredName ?? worker?.firstName ?? name
  const window = req ? shiftWindow(entry.date, req.startTime, req.endTime) : undefined
  const totalHours = entry.regularHours + entry.overtimeHours
  const clocked = `${formatClock(entry.clockIn)}–${entry.clockOut ? formatClock(entry.clockOut) : "no clock-out"}`

  const anomalyDetail = (a: AnomalyType): string => {
    const clockIn = parseLocal(entry.clockIn)
    const clockOut = entry.clockOut ? parseLocal(entry.clockOut) : undefined
    switch (a) {
      case "late_arrival":
        return window ? `clocked in at ${formatClock(entry.clockIn)}, ${num(differenceInMinutes(clockIn, window.start))} min after the ${formatDate(window.start, "h:mm a")} start` : "clocked in late"
      case "early_departure":
        return window && clockOut ? `clocked out at ${formatClock(entry.clockOut)}, ${num(differenceInMinutes(window.end, clockOut))} min before the scheduled end` : "left early"
      case "over_schedule":
        return window && clockOut ? `clocked out at ${formatClock(entry.clockOut)}, ${num(differenceInMinutes(clockOut, window.end))} min past the scheduled end` : "ran past the scheduled end"
      case "missing_clockout":
        return "no clock-out was recorded"
      case "long_break":
        return `a ${num(entry.breakMinutes)}-minute break was recorded`
      case "short_shift":
        return clockOut ? `only ${num(differenceInMinutes(clockOut, clockIn))} min on the clock` : "under 10 minutes on the clock"
    }
  }

  const blocks: Block[] = [
    text(
      `**${entry.id}**: ${name} worked **${formatHours(totalHours)}** as ${position?.title ?? "a Pro"} at ${venue?.shortName ?? "the venue"} on ${formatDate(entry.date, "EEE, MMM d")} (${clocked}, ${num(entry.breakMinutes)}-min break) for **${money(entry.amount)}** at ${rate(entry.billRate)}${entry.overtimeHours ? `, including ${formatHours(entry.overtimeHours)} overtime` : ""}. Status: **${entry.status}**.`
    ),
  ]

  if (entry.dispute) {
    const d = entry.dispute
    blocks.push(
      text(
        `${d.by} disputed it ${timeAgo(d.at, ctx.now)}, citing **${d.reason}**${d.note ? `: “${d.note.replace(/\.$/, "")}.”` : "."} ${d.response ? `${d.response.by} responded: “${d.response.note.replace(/\.$/, "")}.”` : supplier ? "It’s waiting on your response." : "The supplier hasn’t responded yet."}`
      )
    )
    blocks.push(
      text(
        supplier
          ? `**Suggested next step:** reply from the Disputed tab with the ${entry.source.toLowerCase()} record${req && entry.billRate !== req.billRate ? ` and the rate you billed (${rate(entry.billRate)} vs ${rate(req.billRate)} on the request)` : ""}. Disputed hours stay off invoices until the venue resolves it.`
          : `**Suggested next step:** ${d.reason === "Rate incorrect" && req ? (entry.billRate !== req.billRate ? `it bills at ${rate(entry.billRate)} but the request rate is ${rate(req.billRate)}, so ask the supplier to correct it.` : `it bills at the request rate (${rate(req.billRate)}), so check whether overtime was applied correctly before approving.`) : DISPUTE_NEXT_STEP[d.reason]} Disputed hours stay off invoices until it’s resolved.`
      )
    )
  }
  if (entry.anomalies.length) {
    blocks.push(
      text(
        `${entry.anomalies.length === 1 ? "One flag to check." : `${num(entry.anomalies.length)} flags to check.`} ${entry.anomalies.map((a) => `**${ANOMALY_LABELS[a]}**: ${anomalyDetail(a)}; ${ANOMALY_NEXT_STEP[a]}.`).join(" ")}`
      )
    )
  }
  if (!entry.dispute && entry.status === "Pending") {
    blocks.push(
      text(
        entry.anomalies.length
          ? supplier
            ? "The venue will review these flags before approving."
            : `If the times are right, approve it; otherwise **Adjust** the times with a reason, or **Dispute** it to send it back to ${worker ? (ctx.lookups.suppliers.get(worker.supplierId)?.shortName ?? "the supplier") : "the supplier"}.`
          : supplier
            ? "No flags. It’s waiting on venue approval."
            : `No flags. It matches the schedule, so it’s safe to approve. Pending entries auto-approve after ${num(ctx.data.policies.timesheetAutoApproveHours)} hours.`
      )
    )
  }
  if (entry.adjustments.length) {
    const last = entry.adjustments[entry.adjustments.length - 1]
    blocks.push(text(`Adjusted ${plural(entry.adjustments.length, "time")}, most recently by ${last.by}: ${last.summary.replace(/\.$/, "")}.`))
  }
  if (worker) {
    blocks.push({
      type: "records",
      items: [
        {
          id: worker.id,
          title: name,
          subtitle: `${ctx.lookups.suppliers.get(worker.supplierId)?.shortName ?? ""} · ${pct(worker.reliability)} reliable · ${worker.rating.toFixed(2)}★`,
          meta: `${num(worker.lifetimeShifts)} shifts`,
          href: `/workforce/${worker.id}`,
          media: workerMedia(worker),
        },
      ],
    })
  }
  blocks.push({
    type: "actions",
    items: [
      { label: entry.status === "Disputed" ? "Open disputed timesheets" : "Open timesheets", href: entry.status === "Disputed" ? "/timesheets?tab=disputed" : `/timesheets?request=${entry.requestId}`, icon: "timesheets", primary: true },
      ...(req ? [{ label: "Request", href: `/requests/${req.id}`, icon: "staffing" as const }] : []),
    ],
  })
  return { intent: "timesheet", blocks, suggestions: [`Tell me about ${first} ${worker?.lastName ?? ""}`.trim(), "Any disputed timesheets?"] }
}

function invoiceSummary(inv: Invoice, ctx: EngineContext): Reply {
  const venue = ctx.lookups.venues.get(inv.venueId)
  const supplierRec = ctx.lookups.suppliers.get(inv.supplierId)
  if (!invoiceInScope(inv, ctx.persona)) return recordOutOfScope(inv.id, ctx.persona.id === "supplier" ? (supplierRec?.name ?? "another supplier") : (venue?.name ?? "another venue"), ctx)
  const fee = ctx.data.policies.msaFeePct
  const t = lineTotals(inv.lines, fee)
  const payment = inv.paymentId ? ctx.data.payments.find((p) => p.id === inv.paymentId) : ctx.data.payments.find((p) => p.invoiceIds.includes(inv.id))
  const openDisputes = inv.disputes.filter((d) => d.status === "Open")
  const counterpart = ctx.persona.id === "supplier" ? (venue?.name ?? "the venue") : (supplierRec?.name ?? "the supplier")

  const status =
    inv.status === "Paid"
      ? `Paid${inv.paidAt ? ` on ${formatDate(inv.paidAt.slice(0, 10), "MMM d")}` : ""}${payment ? ` (${payment.id}, ${payment.method})` : ""}.`
      : inv.status === "Approved"
        ? `Approved${inv.approvedBy ? ` by ${inv.approvedBy}` : ""}${payment ? `. It goes out with ${payment.id} on ${formatDate(payment.date, "EEE, MMM d")}` : " and queued for the next payment run"}.`
        : inv.status === "Disputed"
          ? `In dispute: ${openDisputes.map((d) => `“${d.reason}” raised by ${d.by}`).join("; ") || "an open dispute"}.`
          : inv.status === "Pending approval"
            ? `Waiting on venue approval, due ${formatDate(inv.dueDate, "MMM d")}.`
            : "Still accruing hours for this period."

  return {
    intent: "invoice",
    blocks: [
      text(`**${inv.id}** (${counterpart}, ${isoRange(inv.periodStart, inv.periodEnd)}) comes to **${money(t.totalDue, true)}** for ${hoursLabel(t.hours)} across ${plural(inv.lines.length, "line")}. ${status}`),
      {
        type: "stats",
        items: [
          { label: "Total due", value: money(t.totalDue) },
          { label: "Hours", value: hoursLabel(t.hours), hint: t.overtime ? `${money(t.overtime)} overtime` : "No overtime" },
          ctx.persona.id === "supplier"
            ? { label: "Net to you", value: money(t.netToSupplier), hint: `After the ${fee}% MSA fee` }
            : { label: "Program fee", value: money(t.programFee), hint: `${fee}% MSA fee` },
          { label: "Status", value: inv.status, tone: inv.status === "Disputed" ? "danger" : inv.status === "Pending approval" ? "warning" : inv.status === "Paid" ? "success" : undefined },
        ],
      },
      ...(t.tips || t.credits ? [text(`Includes ${t.tips ? `${money(t.tips)} in tips` : ""}${t.tips && t.credits ? " and " : ""}${t.credits ? `${money(Math.abs(t.credits))} in credits` : ""}.`)] : []),
      { type: "actions", items: [{ label: "Open invoice", href: `/invoices/${inv.id}`, icon: "invoice", primary: true }] },
    ],
    suggestions: ctx.persona.id === "supplier" ? ["What payments are scheduled?", "Any disputed timesheets?"] : ["How much did we spend last week?", "Any disputed timesheets?"],
  }
}

function recordReply(prompt: Prompt, ctx: EngineContext): Reply | undefined {
  const match = RECORD_ID.exec(prompt.lower)
  if (!match) return undefined
  const id = match[0].toUpperCase()
  if (match[1] === "jp") {
    const req = ctx.lookups.requests.get(id)
    return req ? requestSummary(req, ctx) : recordNotFound(id, ctx)
  }
  if (match[1] === "ts") {
    const entry = ctx.data.timeEntries.find((e) => e.id === id)
    return entry ? timesheetSummary(entry, ctx) : recordNotFound(id, ctx)
  }
  const inv = ctx.data.invoices.find((i) => i.id === id)
  return inv ? invoiceSummary(inv, ctx) : recordNotFound(id, ctx)
}

// Intent: draft a request ------------------------------------------------------------

function draftRequest(prompt: Prompt, ctx: EngineContext): Reply {
  if (ctx.persona.id === "supplier") {
    const open = openShifts({ ...prompt, lower: " this week " }, ctx)
    return {
      intent: "draft-supplier",
      blocks: [text("Staffing requests are posted by venue teams, so I can’t draft one for you. Here’s the matching open work your Pros can pick up instead."), ...open.blocks],
      suggestions: open.suggestions,
    }
  }
  const parsed = prompt.parsed
  const venueRes = resolveVenue(prompt, ctx)
  const venue = venueRes.venue
  const position = matchPosition(prompt, ctx)
  const draft: Omit<ParsedRequest, "matched"> = {
    venueId: venue?.id,
    positionId: parsed.positionId,
    headcount: parsed.headcount,
    dates: parsed.dates,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    eventName: parsed.eventName,
  }
  const missing: { label: string; phrase: string }[] = []
  if (!venue)
    missing.push(
      venueRes.outOfScope
        ? { label: `Pick one of your venues (${venueRes.outOfScope.shortName} isn’t yours)`, phrase: "a venue you manage" }
        : { label: "Pick a venue", phrase: "a venue" }
    )
  if (!position) missing.push({ label: "Choose a position", phrase: "a position" })
  if (!parsed.headcount) missing.push({ label: "Add a headcount", phrase: "a headcount" })
  if (!parsed.dates?.length) missing.push({ label: "Pick a date", phrase: "a date" })
  if (!parsed.startTime || !parsed.endTime) missing.push({ label: "Set shift times", phrase: "shift times" })

  let estimate: DraftEstimate | undefined
  const notes: DraftCard["notes"] = []
  if (venue && position) {
    const card = ctx.data.rateCards.find((r) => r.positionId === position.id && r.metro === venue.metro)
    if (card) {
      const start = parsed.startTime ?? "16:00"
      const end = parsed.endTime ?? "23:00"
      const breakMinutes = defaultBreakMinutes(start, end)
      const hoursPerShift = payableShiftHours({ startTime: start, endTime: end, breakMinutes })
      const slots = (parsed.headcount ?? 0) * (parsed.dates?.length ?? 0)
      const complete = !!parsed.headcount && !!parsed.dates?.length && !!parsed.startTime && !!parsed.endTime
      estimate = { slots, hoursPerShift, breakMinutes, billRate: card.billRate, total: complete ? Math.round(slots * hoursPerShift * card.billRate * 100) / 100 : undefined }
      if (estimate.total !== undefined) {
        const limit = ctx.data.policies.autoApproveRequestsUnder
        if (ctx.persona.id === "program") notes.push({ tone: "success", text: "Program-posted requests skip approval and go straight to suppliers." })
        else if (estimate.total > limit) notes.push({ tone: "warning", text: `Over the ${money(limit)} auto-approve limit, so ${PERSONAS.program.name} will need to approve it.` })
        else notes.push({ tone: "success", text: `Under the ${money(limit)} auto-approve limit, so it goes straight to suppliers.` })
      }
    } else {
      notes.push({ tone: "warning", text: `No ${position.title} rate card for ${metroById(venue.metro)?.label ?? venue.metro} yet, so the composer will flag it.` })
    }
  }
  if (parsed.dates?.length && parsed.startTime && parsed.endTime) {
    const first = shiftWindow([...parsed.dates].sort()[0], parsed.startTime, parsed.endTime).start
    const h = hoursOut(first, ctx.now)
    if (h <= 0) notes.push({ tone: "danger", text: "That start time has already passed. Pick a later date." })
    else if (h < ctx.data.policies.rushLeadTimeHours) notes.push({ tone: "warning", text: `Rush: starts in ${Math.max(1, Math.round(h))}h, so every supplier tier is notified at once.` })
    else notes.push({ tone: "muted", text: `Tier 1 suppliers get a ${ctx.data.policies.tier1ExclusiveMinutes}-minute head start before Tier 2 joins.` })
  }

  const base = venueRes.outOfScope ? withoutVenue(prompt.raw, venueRes.outOfScope) : prompt.raw
  const venueChoices =
    !venue && ctx.persona.id === "venue"
      ? scopeVenues(ctx).map((v) => ({ label: v.shortName, prompt: `${base.replace(/[\s.!?]+$/, "")} at ${v.shortName}`, hue: v.hue }))
      : undefined

  const chips = parsed.matched.filter((m) => m.kind !== "venue" || !!venue)
  const title = position ? `${parsed.headcount ? `${num(parsed.headcount)} × ` : ""}${position.title}` : "New staffing request"
  const summary =
    missing.length === 0
      ? `Here’s a draft for **${plural(parsed.headcount ?? 0, position?.title ?? "Pro")}** at **${venue?.name}** on ${parsed.matched.find((m) => m.kind === "date")?.label ?? ""} (${parsed.matched.find((m) => m.kind === "time")?.label ?? ""}). Review it in the composer to pick suppliers and submit.`
      : `I’ve started a draft${venue ? ` at **${venue.name}**` : ""}. ${missing.length === 1 ? `Add ${missing[0].phrase} and it’s ready for the composer.` : `Still needed: ${joinList(missing.map((m) => m.phrase))}.`}`

  return {
    intent: "draft",
    blocks: [
      text(summary),
      { type: "draft", draft: { title, chips, missing: missing.map((m) => m.label), estimate, notes, query: draftQuery(draft), venueChoices } },
    ],
    suggestions: [
      `Who are my most reliable ${position ? pluralTitle(position.title).toLowerCase() : "Pros"}${venue ? ` at ${venue.shortName}` : ""}?`,
      venue ? `Any open shifts at ${venue.shortName}?` : "Which events still have open shifts?",
    ],
  }
}

// Intent: live -----------------------------------------------------------------------

function liveNow(ctx: EngineContext): Reply {
  const live = liveSnapshot(ctx)
  return {
    intent: "live",
    blocks: [
      text(
        live.onsite
          ? `**${plural(live.onsite, "Pro")}** ${live.onsite === 1 ? "is" : "are"} checked in right now${live.late ? `, **${num(live.late)}** running late` : ""}${live.noShows ? ` and ${plural(live.noShows, "no-show")} today` : ""}.`
          : "Nobody is checked in right now."
      ),
      {
        type: "stats",
        items: [
          { label: "On site", value: num(live.onsite), tone: live.onsite ? "success" : "muted" },
          { label: "Late", value: num(live.late), tone: live.late ? "warning" : "muted" },
          { label: "No-shows today", value: num(live.noShows), tone: live.noShows ? "danger" : "muted" },
        ],
      },
      { type: "actions", items: [{ label: "Open live board", href: "/schedule?view=live", icon: "live", primary: true }] },
    ],
    suggestions: ["What needs my attention today?", "Which events still have open shifts?"],
  }
}

// Fallback ---------------------------------------------------------------------------

function fallback(ctx: EngineContext, prompt?: Prompt): Reply {
  const can =
    ctx.persona.id === "supplier"
      ? "find shifts your Pros can still fill, check disputes and scheduled payments, flag no-shows and late arrivals, and look up any of your Pros by name"
      : `summarize what needs you, break down labor spend by venue and period, find open shifts and your most reliable Pros, and draft a staffing request from a single sentence. I can also check invoices, compliance and the ${num(ctx.data.policies.contractualHoursCap)}-hour cap`
  return {
    intent: "fallback",
    blocks: [
      text(
        `${prompt && prompt.raw.trim().length > 0 ? "I’m not sure how to answer that one yet. " : ""}I work from live ${ctx.persona.org} program data and can ${can}.`
      ),
      { type: "chips", label: "Try asking", items: SUGGESTIONS[ctx.persona.id].map((s) => ({ label: s, prompt: s })) },
    ],
  }
}

// Router -----------------------------------------------------------------------------

const DRAFT_STARTER = /^(?:(?:hey |hi )?mise,? )?(?:please )?(?:(?:can|could) you )?(?:i |we )?(?:need|book|post|request|get me|staff|hire|find me)\b/
const QUESTION = /^(?:who|what|which|how|when|where|why|is|are|do|does|did|any|show|list|give|tell|can|could|should|will|was|were)\b/

export function answer(raw: string, ctx: EngineContext): Reply {
  const trimmed = raw.trim()
  const lower = ` ${trimmed.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ")} `
  const head = lower.trim()
  const parsed = parseRequestText(trimmed, { venues: ctx.data.venues, positions: ctx.data.positions, now: ctx.now })
  const question = QUESTION.test(head) || head.endsWith("?")
  const prompt: Prompt = { raw: trimmed, lower, parsed, question }
  const is = (re: RegExp) => re.test(lower)

  if (!head) return fallback(ctx)
  if (/^(hi|hey|hello|yo|good (morning|afternoon|evening))\b[\s!.]*$/.test(head)) {
    return {
      intent: "greeting",
      blocks: [text(`Hi ${ctx.persona.firstName}, what can I pull up for you?`), { type: "chips", items: SUGGESTIONS[ctx.persona.id].map((s) => ({ label: s, prompt: s })) }],
    }
  }
  if (/^(thanks|thank you|thx|cheers|great|perfect|nice)\b/.test(head)) return { intent: "thanks", blocks: [text("Anytime. Anything else?")], suggestions: SUGGESTIONS[ctx.persona.id].slice(0, 2) }
  if (/^(help|what can you do|\?)/.test(head)) return fallback(ctx)

  const record = recordReply(prompt, ctx)
  if (record) return record

  const explicitDraft = DRAFT_STARTER.test(head) && (!!parsed.positionId || !!parsed.headcount)
  const implicitDraft = !question && !!parsed.positionId && (!!parsed.headcount || !!parsed.dates?.length)
  if (explicitDraft || implicitDraft) return draftRequest(prompt, ctx)

  const worker = findWorker(prompt, ctx)
  if (worker) return proProfile(worker, ctx)

  if (is(/disput|contest/)) return disputes(ctx)
  if (is(/approv|sign.?off|waiting (on|for) (me|my)|pending (requests?|approvals?)/)) return approvals(ctx)
  if (is(/invoice|payment|\bpaid\b|remit|payout|\bowe[sd]?\b|\bpay run\b/)) return invoices(prompt, ctx)
  if (is(/\b390\b|\bcap\b|conversion|temp.to.hire|contractual|hours? limit/)) return hoursCap(ctx)
  if (is(/complian|\bcoi\b|insurance|certif|expir|\bsuppliers?\b|\bmsa\b/)) return compliance(ctx)
  if (is(/no.?shows?|\blate\b|tardy|attendance|didn'?t show|call.?outs?/)) return attendance(prompt, ctx)
  if (is(/spen[dt]|\bcosts?\b|labor|budget|how much|\bbill(ed|ings)?\b|revenue|earn/)) return spend(prompt, ctx)
  if (is(/reliab|dependab|\bbest\b|\btop\b|favou?rite|go.to|recommend|who should/)) return reliablePros(prompt, ctx)
  if (is(/on site|checked in|who'?s working|right now|\blive\b/)) return liveNow(ctx)
  if (is(/\bopen\b|unfilled|\bfill\b|still need|staffed|\bgaps?\b|short.?staffed|coverage/)) return openShifts(prompt, ctx)
  if (is(/attention|to.?do|needs? (me|my)|inbox|urgent|priorit|catch me up|summary|what'?s (up|new|going on)|\btoday\b/)) return attention(ctx)
  if (parsed.positionId && question) return reliablePros(prompt, ctx)
  return fallback(ctx, prompt)
}
