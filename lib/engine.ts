import { addMinutes, differenceInCalendarDays, differenceInMinutes } from "date-fns"

import type { DemoData } from "@/lib/data"
import { makeIdFactory } from "@/lib/data"
import { parseLocal, shiftWindow, toISODate, toLocal } from "@/lib/dates"
import { workerName } from "@/lib/format"
import { stableUnit } from "@/lib/random"
import { certStatus, detectAnomalies, recomputeEntries, requiredCertsFor } from "@/lib/rules"
import type {
  Activity,
  AppNotification,
  ISODate,
  PersonaId,
  Position,
  Shift,
  ShiftFate,
  StaffingRequest,
  TimeEntry,
  Venue,
  Worker,
} from "@/lib/types"

type Ids = ReturnType<typeof makeIdFactory>

export interface EngineResult {
  data: DemoData
  changed: boolean
}

function unit(key: string): number {
  return stableUnit(key)
}

export function fateFor(key: string): ShiftFate {
  const roll = unit(`${key}:fate`)
  if (roll < 0.04) return "late"
  if (roll < 0.06) return "no_show"
  if (roll < 0.08) return "early_leave"
  if (roll < 0.095) return "missing_clockout"
  if (roll < 0.1) return "short_tap"
  if (roll < 0.11) return "long_break"
  if (roll < 0.125) return "overtime"
  return "normal"
}

export function jitterFor(key: string): number {
  return Math.round(unit(`${key}:jitter`) * 18) - 14
}

export function plannedCheckIn(shift: Shift, start: Date): Date {
  if (shift.backfillFor && shift.assignedAt) {
    const assigned = parseLocal(shift.assignedAt)
    return addMinutes(assigned, 24 + Math.round(unit(`${shift.id}:bf`) * 14))
  }
  if (shift.fate === "late") return addMinutes(start, 18 + Math.round(unit(`${shift.id}:late`) * 32))
  return addMinutes(start, shift.jitter)
}

export function plannedCheckOut(shift: Shift, checkIn: Date, end: Date): Date {
  switch (shift.fate) {
    case "early_leave":
      return addMinutes(end, -(95 + Math.round(unit(`${shift.id}:early`) * 70)))
    case "short_tap":
      return addMinutes(checkIn, 3 + Math.round(unit(`${shift.id}:tap`) * 4))
    case "overtime":
      return addMinutes(end, 70 + Math.round(unit(`${shift.id}:ot`) * 35))
    default:
      return addMinutes(end, Math.round(unit(`${shift.id}:out`) * 14) - 4)
  }
}

export function bookedByDate(shifts: Shift[]): Map<ISODate, Set<string>> {
  const map = new Map<ISODate, Set<string>>()
  for (const s of shifts) {
    if (!s.workerId || s.status === "Cancelled" || s.status === "No-show") continue
    let set = map.get(s.date)
    if (!set) {
      set = new Set()
      map.set(s.date, set)
    }
    set.add(s.workerId)
  }
  return map
}

export interface PickOptions {
  data: Pick<DemoData, "workers" | "rosters" | "suppliers" | "policies">
  request: StaffingRequest
  venue: Venue
  position: Position
  booked: Set<string>
  today: ISODate
  rand: () => number
  exclude?: Set<string>
}

export function candidateWorkers(opts: PickOptions): Worker[] {
  const { data, request, venue, position, booked, today } = opts
  const roster = data.rosters.find((r) => r.venueId === venue.id)
  const blocked = new Set(roster?.blocked.map((b) => b.workerId) ?? [])
  const activeSuppliers = new Set(
    data.suppliers.filter((s) => s.active && s.coiExpires >= today).map((s) => s.id)
  )
  const certs = requiredCertsFor(position, venue)
  return data.workers.filter((w) => {
    if (w.status !== "Active") return false
    if (w.metro !== venue.metro) return false
    if (!w.positionIds.includes(position.id)) return false
    if (!request.supplierIds.includes(w.supplierId)) return false
    if (!activeSuppliers.has(w.supplierId)) return false
    if (blocked.has(w.id) || booked.has(w.id) || opts.exclude?.has(w.id)) return false
    if (data.policies.blockOverCapWorkers && w.compassHours >= data.policies.contractualHoursCap) return false
    for (const c of certs) {
      const st = certStatus(w, c, today)
      if (st === "missing" || st === "expired") return false
    }
    return true
  })
}

export function pickWorker(opts: PickOptions): Worker | undefined {
  const candidates = candidateWorkers(opts)
  if (candidates.length === 0) return undefined
  const roster = opts.data.rosters.find((r) => r.venueId === opts.venue.id)
  const favorites = new Set(roster?.favorites ?? [])
  let best: Worker | undefined
  let bestScore = -1
  for (const w of candidates) {
    const fav = opts.request.favoritesFirst && favorites.has(w.id) ? 1.45 : 1
    const tier = opts.data.suppliers.find((s) => s.id === w.supplierId)?.tier ?? 3
    const tierBoost = tier === 1 ? 1.12 : tier === 2 ? 1 : 0.9
    const score = w.rating * w.reliability * fav * tierBoost * (0.65 + opts.rand() * 0.7)
    if (score > bestScore) {
      bestScore = score
      best = w
    }
  }
  return best
}

function pushActivity(
  list: Activity[],
  ids: Ids,
  a: Omit<Activity, "id">
) {
  list.push({ id: ids.id("activity"), ...a })
}

function pushNotification(
  list: AppNotification[],
  ids: Ids,
  n: Omit<AppNotification, "id" | "read"> & { read?: boolean }
) {
  list.push({ id: ids.id("notification"), read: false, ...n })
}

export interface TickOptions {
  seeding?: boolean
}

/**
 * Advances the live simulation to `now`: geofenced check-ins and check-outs,
 * no-show detection with automatic backfill, time entry capture, policy
 * auto-approval and progressive filling of newly posted requests.
 */
export function advance(data: DemoData, now: Date, options: TickOptions = {}): EngineResult {
  const seeding = !!options.seeding
  const ids = makeIdFactory(data.counters)
  const todayISO = toISODate(now)
  const yesterdayISO = toISODate(addMinutes(now, -24 * 60))
  const reqMap = new Map(data.requests.map((r) => [r.id, r]))
  const workerMap = new Map(data.workers.map((w) => [w.id, w]))
  const venueMap = new Map(data.venues.map((v) => [v.id, v]))
  const positionMap = new Map(data.positions.map((p) => [p.id, p]))
  const activities: Activity[] = []
  const notifications: AppNotification[] = []
  const newEntries: TimeEntry[] = []
  const newShifts: Shift[] = []
  let changed = false
  let booked: Map<ISODate, Set<string>> | null = null
  const getBooked = () => {
    if (!booked) booked = bookedByDate(data.shifts)
    return booked
  }

  const personasFor = (venueId: string): PersonaId[] =>
    ["v-wrigley", "v-soldier", "v-united"].includes(venueId)
      ? ["venue", "program", "supplier"]
      : ["program", "supplier"]

  let shifts = data.shifts.map((shift) => {
    if (!shift.workerId) return shift
    if (shift.status !== "Confirmed" && shift.status !== "Checked in") return shift
    if (shift.date > todayISO) return shift
    const req = reqMap.get(shift.requestId)
    if (!req || req.state !== "active") return shift
    const { start, end } = shiftWindow(shift.date, req.startTime, req.endTime)
    if (now < addMinutes(start, -30)) return shift
    const worker = workerMap.get(shift.workerId)
    const venue = venueMap.get(req.venueId)
    const position = positionMap.get(req.positionId)
    const name = workerName(worker)
    const isRecent = shift.date === todayISO || shift.date === yesterdayISO
    let next = shift

    if (next.status === "Confirmed") {
      if (shift.fate === "no_show" && !shift.backfillFor) {
        if (now < addMinutes(start, 20)) return shift
        next = { ...next, status: "No-show" }
        changed = true
        if (isRecent) {
          pushActivity(activities, ids, {
            at: toLocal(addMinutes(start, 20)),
            actor: "Mise",
            kind: "noshow",
            text: `${name} did not check in for ${position?.title ?? "shift"} at ${venue?.shortName ?? "venue"}`,
            requestId: req.id,
            workerId: shift.workerId,
            venueId: req.venueId,
          })
        }
        if (data.policies.autoBackfillNoShows && now < addMinutes(end, -90) && venue && position) {
          const bookedToday = getBooked().get(shift.date) ?? new Set<string>()
          const rand = (() => {
            let i = 0
            return () => unit(`${shift.id}:bfpick:${i++}`)
          })()
          const replacement = pickWorker({
            data,
            request: req,
            venue,
            position,
            booked: bookedToday,
            today: todayISO,
            rand,
          })
          if (replacement) {
            bookedToday.add(replacement.id)
            getBooked().set(shift.date, bookedToday)
            const assignedAt = addMinutes(start, 22)
            const id = ids.id("shift")
            newShifts.push({
              id,
              requestId: req.id,
              date: shift.date,
              slot: req.headcount + newShifts.length + 1,
              workerId: replacement.id,
              assignedAt: toLocal(assignedAt),
              status: "Confirmed",
              fate: "normal",
              jitter: 0,
              backfillFor: shift.id,
            })
            if (isRecent) {
              pushActivity(activities, ids, {
                at: toLocal(assignedAt),
                actor: "Mise",
                kind: "fill",
                text: `Backfilled ${name} with ${workerName(replacement)} (${position.title})`,
                requestId: req.id,
                workerId: replacement.id,
                venueId: req.venueId,
              })
            }
            if (!seeding) {
              pushNotification(notifications, ids, {
                at: toLocal(now),
                title: "No-show backfilled",
                body: `${name} didn't check in at ${venue.shortName}. ${workerName(replacement)} is on the way (ETA ~30 min).`,
                href: `/requests/${req.id}`,
                kind: "noshow",
                personas: personasFor(req.venueId),
                venueId: req.venueId,
              })
            }
          }
        }
        return next
      }
      const ci = plannedCheckIn(shift, start)
      if (now < ci) return shift
      next = { ...next, status: "Checked in", checkInAt: toLocal(ci) }
      changed = true
      if (shift.date === todayISO) {
        pushActivity(activities, ids, {
          at: toLocal(ci),
          actor: name,
          kind: "checkin",
          text: `${name} checked in at ${venue?.shortName ?? "venue"} · ${position?.title ?? ""}`.trim(),
          requestId: req.id,
          workerId: shift.workerId,
          venueId: req.venueId,
        })
      }
    }

    const checkInAt = next.checkInAt
    if (!checkInAt) return next
    const ci = parseLocal(checkInAt)
    const co = plannedCheckOut(next, ci, end)
    const closeAt = next.fate === "missing_clockout" ? addMinutes(end, 45) : co
    if (now < closeAt) return next
    const clockOut = next.fate === "missing_clockout" ? undefined : toLocal(co)
    next = { ...next, status: "Completed", checkOutAt: clockOut }
    changed = true
    const workedMins = clockOut ? differenceInMinutes(co, ci) : 0
    const breakMinutes =
      next.fate === "long_break" && clockOut
        ? workedMins
        : workedMins > 300 || !clockOut
          ? req.breakMinutes
          : 0
    const draft = {
      date: next.date,
      clockIn: checkInAt,
      clockOut,
      breakMinutes,
    }
    const entry: TimeEntry = {
      id: ids.id("timeEntry"),
      shiftId: next.id,
      requestId: req.id,
      workerId: next.workerId!,
      date: next.date,
      clockIn: checkInAt,
      clockOut,
      breakMinutes,
      regularHours: 0,
      overtimeHours: 0,
      billRate: req.billRate,
      amount: 0,
      status: "Pending",
      anomalies: detectAnomalies(draft, req, { ignoreLate: !!next.backfillFor }),
      source: unit(`${next.id}:src`) < 0.94 ? "Geofenced app" : "Kiosk",
      adjustments: [],
    }
    newEntries.push(entry)
    return next
  })

  if (newShifts.length) {
    shifts = [...shifts, ...newShifts]
  }

  let timeEntries = data.timeEntries
  if (newEntries.length) {
    timeEntries = recomputeEntries([...timeEntries, ...newEntries], data.policies)
  }

  // Policy auto-approval for clean entries.
  const autoMs = data.policies.timesheetAutoApproveHours * 60
  let autoCount = 0
  timeEntries = timeEntries.map((e) => {
    if (e.status !== "Pending" || e.anomalies.length > 0 || !e.clockOut || e.dispute) return e
    const due = addMinutes(parseLocal(e.clockOut), autoMs)
    if (now < due) return e
    autoCount++
    return { ...e, status: "Auto-approved", approvedAt: toLocal(due), approvedBy: "Policy · 72h auto-approve" }
  })
  if (autoCount > 0) changed = true

  // Progressive live fill for requests posted during this session.
  let requests = data.requests
  const liveReqs = data.requests.filter((r) => r.liveFill && r.state === "active")
  if (liveReqs.length && !seeding) {
    const bookedMap = bookedByDate(shifts)
    const reqUpdates = new Map<string, StaffingRequest>()
    for (const req of liveReqs) {
      const venue = venueMap.get(req.venueId)
      const position = positionMap.get(req.positionId)
      if (!venue || !position) continue
      const mine = shifts.filter((s) => s.requestId === req.id && s.status !== "Cancelled")
      const total = req.dates.length * req.headcount
      const filled = mine.filter((s) => s.workerId && s.status !== "No-show").length
      const firstDate = [...req.dates].sort()[0]
      const daysAhead = differenceInCalendarDays(parseLocal(firstDate), now)
      const targetRatio = daysAhead <= 7 ? 1 : daysAhead <= 14 ? 0.85 : 0.65
      const target = Math.max(1, Math.round(total * targetRatio))
      const open = mine
        .filter((s) => !s.workerId && s.status === "Open")
        .sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot)
      if (filled >= target || open.length === 0) {
        reqUpdates.set(req.id, { ...req, liveFill: false })
        pushNotification(notifications, ids, {
          at: toLocal(now),
          title: filled >= total ? `${req.id} fully staffed` : `${req.id} ${Math.round((filled / total) * 100)}% staffed`,
          body:
            filled >= total
              ? `All ${total} ${position.title} shifts at ${venue.shortName} are confirmed.`
              : `${filled} of ${total} ${position.title} shifts confirmed. Remaining slots stay open to all tiers.`,
          href: `/requests/${req.id}`,
          kind: "fill",
          personas: personasFor(req.venueId),
          venueId: req.venueId,
        })
        pushActivity(activities, ids, {
          at: toLocal(now),
          actor: "Mise",
          kind: "fill",
          text: `${req.id} reached ${filled}/${total} confirmed`,
          requestId: req.id,
          venueId: req.venueId,
        })
        changed = true
        continue
      }
      const tickKey = `${req.id}:${Math.floor(now.getTime() / 3000)}`
      const batch = 1 + Math.floor(unit(`${tickKey}:batch`) * 3)
      let assigned = 0
      let missed = 0
      for (const slot of open.slice(0, batch)) {
        const bookedSet = bookedMap.get(slot.date) ?? new Set<string>()
        let i = 0
        const worker = pickWorker({
          data,
          request: req,
          venue,
          position,
          booked: bookedSet,
          today: todayISO,
          rand: () => unit(`${tickKey}:${slot.id}:${i++}`),
        })
        if (!worker) {
          missed++
          continue
        }
        bookedSet.add(worker.id)
        bookedMap.set(slot.date, bookedSet)
        assigned++
        const idx = shifts.findIndex((s) => s.id === slot.id)
        if (idx >= 0) {
          shifts[idx] = {
            ...slot,
            workerId: worker.id,
            assignedAt: toLocal(now),
            status: "Confirmed",
            fate: fateFor(slot.id),
            jitter: jitterFor(slot.id),
          }
        }
        pushActivity(activities, ids, {
          at: toLocal(now),
          actor: workerName(worker),
          kind: "fill",
          text: `${workerName(worker)} confirmed · ${position.title} · ${venue.shortName}`,
          requestId: req.id,
          workerId: worker.id,
          venueId: req.venueId,
        })
      }
      if (assigned > 0) changed = true
      if (assigned === 0 && missed > 0) {
        const tierTwo = data.suppliers.filter(
          (s) =>
            s.active &&
            s.coiExpires >= todayISO &&
            s.metros.includes(venue.metro) &&
            !req.supplierIds.includes(s.id)
        )
        if (tierTwo.length) {
          reqUpdates.set(req.id, { ...req, supplierIds: [...req.supplierIds, ...tierTwo.map((s) => s.id)] })
          pushActivity(activities, ids, {
            at: toLocal(now),
            actor: "Mise",
            kind: "fill",
            text: `Cascaded ${req.id} to ${tierTwo.map((s) => s.shortName).join(", ")}`,
            requestId: req.id,
            venueId: req.venueId,
          })
        } else {
          reqUpdates.set(req.id, { ...req, liveFill: false })
          pushNotification(notifications, ids, {
            at: toLocal(now),
            title: `${req.id} needs attention`,
            body: `${filled} of ${total} ${position.title} shifts confirmed, no more qualified Pros available in ${venue.city}. Consider a rate boost or widening the window.`,
            href: `/requests/${req.id}`,
            kind: "fill",
            personas: personasFor(req.venueId),
            venueId: req.venueId,
          })
        }
        changed = true
      }
    }
    if (reqUpdates.size) {
      requests = data.requests.map((r) => reqUpdates.get(r.id) ?? r)
    }
  }

  if (!changed && activities.length === 0 && notifications.length === 0) {
    return { data, changed: false }
  }

  const nextActivities = activities.length
    ? [...data.activities, ...activities].slice(-900)
    : data.activities
  const nextNotifications = notifications.length
    ? [...notifications.reverse(), ...data.notifications].slice(0, 120)
    : data.notifications

  return {
    data: {
      ...data,
      requests,
      shifts,
      timeEntries,
      activities: nextActivities,
      notifications: nextNotifications,
      counters: ids.counters,
    },
    changed: true,
  }
}
