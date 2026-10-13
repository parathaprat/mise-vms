"use client"

import { useMemo } from "react"
import { addDays } from "date-fns"
import { useShallow } from "zustand/react/shallow"

import { parseLocal, toISODate } from "@/lib/dates"
import { round2 } from "@/lib/format"
import { hashString } from "@/lib/random"
import { certStatus, entryHours, payableShiftHours, requiredCertsFor, type CertState } from "@/lib/rules"
import { requestInScope, venueInScope } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type {
  Activity,
  ActivityKind,
  CertType,
  CostCenter,
  Position,
  PositionCategory,
  RateCardEntry,
  Shift,
  StaffingRequest,
  TimeEntry,
  Venue,
  Worker,
} from "@/lib/types"

import { eligibleVenuesFor, useWorkforce, type ProRow, type WorkforceModel } from "./use-workforce"

export interface ShiftItem {
  shift: Shift
  request: StaffingRequest
  venue?: Venue
  position?: Position
  costCenter?: CostCenter
  hours: number
}

export interface WorkItem {
  entry: TimeEntry
  request: StaffingRequest
  venue?: Venue
  position?: Position
  hours: number
}

export interface CertRow {
  type: CertType
  state: CertState
  expires?: string
  verified?: boolean
  requiredFor: Position[]
}

export interface PositionItem {
  position: Position
  rateCard?: RateCardEntry
  missing: CertType[]
  shifts: number
}

export interface HoursProjection {
  used: number
  cap: number
  warnPct: number
  booked: number
  bookedShifts: number
  weeklyPace: number
  crossing?: { date: string; via: "booked" | "pace" }
}

export interface CaptainNote {
  id: string
  text: string
  author: string
  venue?: Venue
  date: string
  tone: "praise" | "coaching"
}

export type TimelineKind = ActivityKind | "shift" | "joined"

export interface TimelineItem {
  id: string
  at: string
  kind: TimelineKind
  text: string
  href?: string
}

export interface ProProfileData {
  model: WorkforceModel
  row: ProRow
  eligibleVenues: Venue[]
  upcoming: ShiftItem[]
  recent: WorkItem[]
  certs: CertRow[]
  positions: PositionItem[]
  hours: HoursProjection
  notes: CaptainNote[]
  timeline: TimelineItem[]
}

export type ProfileAccess =
  | { kind: "missing" }
  | { kind: "other-supplier"; worker: Worker }
  | { kind: "out-of-market"; worker: Worker }
  | { kind: "ok"; profile: ProProfileData }

const CERT_RANK: Record<CertState, number> = { expired: 0, missing: 1, expiring: 2, valid: 3 }

const PRAISE: Record<PositionCategory | "General", string[]> = {
  General: [
    "Early for line-up and took the busiest station without being asked.",
    "Calm under pressure: kept the line moving through the peak rush.",
    "Station was spotless at close and restocked before anyone asked.",
    "Friendly with guests and quick to learn our setup. Would book again.",
    "Helped two first-time Pros get set up before doors opened.",
    "Stayed past schedule to help with breakdown. Great teammate.",
  ],
  Bar: [
    "Checked every ID and still kept waits under five minutes.",
    "Fast, consistent pours with no variance on the bar count at close.",
    "Guests asked for them by name at the club bar. Book them for premium events.",
  ],
  Concessions: [
    "Picked up the POS immediately; drawer balanced to the penny.",
    "Kept the stand stocked and moving all night without a single 86.",
  ],
  Service: [
    "Polished suite service: the suite holder asked for them back.",
    "Anticipated guest needs and communicated well with the kitchen.",
  ],
  Culinary: [
    "Clean station; labels and temp logs done without reminders.",
    "Kept tickets moving on the line through the busiest stretch.",
  ],
  Leadership: [
    "Ran a sharp pre-shift line-up and kept the team on schedule.",
    "Clear communicator: the client noticed how organized service was.",
  ],
  Support: [
    "Kept the dish pit ahead all night; never ran short on smallwares.",
    "Commissary pulls were accurate and on time. Thorough and reliable.",
  ],
}

const COACHING = [
  "Solid shift. Needed a reminder about the uniform policy at check-in.",
  "Good effort: a little slow on the POS at peak. Pair with a veteran next time.",
  "Arrived a few minutes after line-up; strong once on the floor.",
]

function captainNotes(worker: Worker, completed: ShiftItem[]): CaptainNote[] {
  const notes: CaptainNote[] = []
  const used = new Set<string>()
  for (const item of completed) {
    if (notes.length === 3) break
    const h = hashString(`note:${item.shift.id}`)
    if (h % 3 === 0) continue
    const coaching = worker.rating < 4.6 && h % 7 === 1
    const category = item.position?.category
    const pool = coaching ? COACHING : [...(category ? PRAISE[category] : []), ...PRAISE.General]
    const text = pool[(h >>> 3) % pool.length]
    if (used.has(text)) continue
    used.add(text)
    notes.push({
      id: item.shift.id,
      text,
      author: item.costCenter?.approverName ?? "Venue captain",
      venue: item.venue,
      date: item.shift.date,
      tone: coaching ? "coaching" : "praise",
    })
  }
  return notes
}

interface ProfileInput {
  id: string
  model: WorkforceModel
  workers: Worker[]
  positions: Position[]
  requests: StaffingRequest[]
  shifts: Shift[]
  timeEntries: TimeEntry[]
  activities: Activity[]
  costCenters: CostCenter[]
  rateCards: RateCardEntry[]
}

function buildProfile(input: ProfileInput): ProfileAccess {
  const { id, model } = input
  const { persona, today, policies, venuesById, scopeVenues } = model
  const worker = input.workers.find((w) => w.id === id)
  if (!worker) return { kind: "missing" }
  const row = model.rowsById.get(id)
  if (!row) return persona.id === "supplier" ? { kind: "other-supplier", worker } : { kind: "out-of-market", worker }

  const requestMap = new Map(input.requests.map((r) => [r.id, r]))
  const positionMap = new Map(input.positions.map((p) => [p.id, p]))
  const costCenterMap = new Map(input.costCenters.map((c) => [c.id, c]))
  const venueVisible = (venueId: string) => persona.id === "supplier" || venueInScope(venueId, persona)

  const upcoming: ShiftItem[] = []
  const completed: ShiftItem[] = []
  const noShows: ShiftItem[] = []
  const bookedAll: { date: string; hours: number }[] = []
  for (const shift of input.shifts) {
    if (shift.workerId !== id) continue
    const request = requestMap.get(shift.requestId)
    if (!request) continue
    const item: ShiftItem = {
      shift,
      request,
      venue: venuesById.get(request.venueId),
      position: positionMap.get(request.positionId),
      costCenter: costCenterMap.get(request.costCenterId),
      hours: payableShiftHours(request),
    }
    const live = (shift.status === "Confirmed" || shift.status === "Checked in") && shift.date >= today
    if (live) bookedAll.push({ date: shift.date, hours: item.hours })
    if (!requestInScope(request, persona)) continue
    if (live) upcoming.push(item)
    else if (shift.status === "Completed") completed.push(item)
    else if (shift.status === "No-show") noShows.push(item)
  }
  upcoming.sort((a, b) => a.shift.date.localeCompare(b.shift.date) || a.request.startTime.localeCompare(b.request.startTime))
  completed.sort((a, b) => b.shift.date.localeCompare(a.shift.date))

  const cap = policies.contractualHoursCap
  const used = worker.compassHours
  bookedAll.sort((a, b) => a.date.localeCompare(b.date))
  let crossing: HoursProjection["crossing"]
  let running = used
  for (const b of bookedAll) {
    running += b.hours
    if (used < cap && running >= cap) {
      crossing = { date: b.date, via: "booked" }
      break
    }
  }
  const windowStart = toISODate(addDays(parseLocal(today), -28))
  let paceHours = 0
  const recent: WorkItem[] = []
  for (const entry of input.timeEntries) {
    if (entry.workerId !== id) continue
    if (entry.date >= windowStart && entry.date < today) paceHours += entryHours(entry)
    const request = requestMap.get(entry.requestId)
    if (!request || !venueVisible(request.venueId)) continue
    recent.push({
      entry,
      request,
      venue: venuesById.get(request.venueId),
      position: positionMap.get(request.positionId),
      hours: entryHours(entry),
    })
  }
  recent.sort((a, b) => b.entry.clockIn.localeCompare(a.entry.clockIn))
  const weeklyPace = round2(paceHours / 4)
  if (!crossing && used < cap && weeklyPace > 0) {
    const days = Math.ceil(((cap - used) / weeklyPace) * 7)
    if (days <= 182) crossing = { date: toISODate(addDays(parseLocal(today), days)), via: "pace" }
  }
  const hours: HoursProjection = {
    used,
    cap,
    warnPct: policies.contractualHoursWarnPct,
    booked: round2(bookedAll.reduce((sum, b) => sum + b.hours, 0)),
    bookedShifts: bookedAll.length,
    weeklyPace,
    crossing,
  }

  const metroVenue = [...venuesById.values()].find((v) => v.metro === worker.metro)
  const requiredFor = (p: Position): CertType[] => (metroVenue ? requiredCertsFor(p, metroVenue) : p.requiredCerts)
  const required = new Map<CertType, Position[]>()
  for (const p of row.positions) {
    for (const cert of requiredFor(p)) {
      const list = required.get(cert)
      if (list) list.push(p)
      else required.set(cert, [p])
    }
  }
  const certTypes = new Set<CertType>([...worker.certs.map((c) => c.type), ...required.keys()])
  const certs: CertRow[] = [...certTypes]
    .map((type) => {
      const held = worker.certs.find((c) => c.type === type)
      return {
        type,
        state: certStatus(worker, type, today),
        expires: held?.expires,
        verified: held?.verified,
        requiredFor: required.get(type) ?? [],
      }
    })
    .sort((a, b) => CERT_RANK[a.state] - CERT_RANK[b.state] || b.requiredFor.length - a.requiredFor.length || a.type.localeCompare(b.type))

  const shiftsByPosition = new Map<string, number>()
  for (const item of completed) {
    shiftsByPosition.set(item.request.positionId, (shiftsByPosition.get(item.request.positionId) ?? 0) + 1)
  }
  const positions: PositionItem[] = row.positions.map((position) => ({
    position,
    rateCard: input.rateCards.find((r) => r.positionId === position.id && r.metro === worker.metro),
    missing: requiredFor(position).filter((cert) => {
      const state = certStatus(worker, cert, today)
      return state === "missing" || state === "expired"
    }),
    shifts: shiftsByPosition.get(position.id) ?? 0,
  }))

  const timeline: TimelineItem[] = []
  const logged = new Set<string>()
  for (const a of input.activities) {
    if (a.workerId !== id || (a.venueId && !venueVisible(a.venueId))) continue
    if (a.requestId) logged.add(`${a.kind}|${a.requestId}`)
    timeline.push({ id: a.id, at: a.at, kind: a.kind, text: a.text, href: a.requestId ? `/requests/${a.requestId}` : undefined })
  }
  for (const item of completed.slice(0, 8)) {
    const where = item.venue?.shortName ?? "venue"
    timeline.push({
      id: `shift:${item.shift.id}`,
      at: item.shift.checkOutAt ?? item.shift.date,
      kind: "shift",
      text: `Worked ${item.position?.title ?? "a shift"} at ${where}${item.request.eventName ? ` · ${item.request.eventName}` : ""}`,
      href: `/requests/${item.request.id}`,
    })
  }
  for (const item of noShows) {
    if (logged.has(`noshow|${item.request.id}`)) continue
    timeline.push({
      id: `noshow:${item.shift.id}`,
      at: item.shift.date,
      kind: "noshow",
      text: `No-show · ${item.position?.title ?? "shift"} at ${item.venue?.shortName ?? "venue"}`,
      href: `/requests/${item.request.id}`,
    })
  }
  timeline.push({
    id: "joined",
    at: worker.joinedAt,
    kind: "joined",
    text: `Joined FlexForce via ${row.supplier?.name ?? "a supplier"}`,
  })
  timeline.sort((a, b) => b.at.localeCompare(a.at))

  return {
    kind: "ok",
    profile: {
      model,
      row,
      eligibleVenues: eligibleVenuesFor(worker, scopeVenues),
      upcoming,
      recent,
      certs,
      positions,
      hours,
      notes: captainNotes(worker, completed),
      timeline,
    },
  }
}

export function useProProfile(id: string): ProfileAccess {
  const model = useWorkforce()
  const { workers, positions, requests, shifts, timeEntries, activities, costCenters, rateCards } = useStore(
    useShallow((s) => ({
      workers: s.data.workers,
      positions: s.data.positions,
      requests: s.data.requests,
      shifts: s.data.shifts,
      timeEntries: s.data.timeEntries,
      activities: s.data.activities,
      costCenters: s.data.costCenters,
      rateCards: s.data.rateCards,
    }))
  )
  return useMemo(
    () => buildProfile({ id, model, workers, positions, requests, shifts, timeEntries, activities, costCenters, rateCards }),
    [id, model, workers, positions, requests, shifts, timeEntries, activities, costCenters, rateCards]
  )
}
