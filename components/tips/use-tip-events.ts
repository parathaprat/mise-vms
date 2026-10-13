"use client"

import { useMemo } from "react"
import { addDays } from "date-fns"
import { useShallow } from "zustand/react/shallow"

import { useNow } from "@/hooks/use-demo"
import { parseLocal, shiftWindow, toISODate } from "@/lib/dates"
import { round2, workerName } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { Position, StaffingRequest, TimeEntry, TipBatch, Venue, Worker } from "@/lib/types"

import { TIP_ELIGIBLE_POSITIONS } from "./tip-utils"
import type { TipsModel } from "./use-tips"

/** How far back the composer offers events: tips are entered within two weeks of the event. */
export const EVENT_WINDOW_DAYS = 14

export interface EventEntry {
  workerId: string
  hours: number
  positionId: string
  requestId: string
}

export interface EventPosition {
  position: Position
  pros: number
  hours: number
  eligible: boolean
}

export interface TipEvent {
  key: string
  venueId: string
  venue?: Venue
  date: string
  eventName: string
  requestIds: string[]
  costCenterId: string
  costCenterByRequest: Record<string, string>
  entries: EventEntry[]
  positions: EventPosition[]
  pros: number
  hours: number
  /** Latest batch that already covers this event. */
  existing?: TipBatch
}

export interface ComposerLine {
  workerId: string
  worker?: Worker
  name: string
  hours: number
  positionIds: string[]
  requestIds: string[]
}

function entryHours(entry: TimeEntry): number {
  return round2(entry.regularHours + entry.overtimeHours)
}

function sortLines(lines: ComposerLine[]): ComposerLine[] {
  return lines.sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))
}

/** One line per Pro: hours from every included entry are added together. */
export function aggregateLines(
  entries: EventEntry[],
  include: (entry: EventEntry) => boolean,
  workersById: Map<string, Worker>
): ComposerLine[] {
  const map = new Map<string, ComposerLine>()
  for (const entry of entries) {
    if (!include(entry)) continue
    const line = map.get(entry.workerId)
    if (line) {
      line.hours = round2(line.hours + entry.hours)
      if (!line.positionIds.includes(entry.positionId)) line.positionIds.push(entry.positionId)
      if (!line.requestIds.includes(entry.requestId)) line.requestIds.push(entry.requestId)
      continue
    }
    const worker = workersById.get(entry.workerId)
    map.set(entry.workerId, {
      workerId: entry.workerId,
      worker,
      name: workerName(worker),
      hours: entry.hours,
      positionIds: [entry.positionId],
      requestIds: [entry.requestId],
    })
  }
  return sortLines([...map.values()])
}

interface EventInput {
  timeEntries: TimeEntry[]
  requests: StaffingRequest[]
  positions: Position[]
  model: TipsModel
  now: Date
}

function buildEvents({ timeEntries, requests, positions, model, now }: EventInput): TipEvent[] {
  const { scopeVenues, venuesById, today, rows } = model
  const scopeIds = new Set(scopeVenues.map((v) => v.id))
  const from = toISODate(addDays(parseLocal(today), -EVENT_WINDOW_DAYS))
  const requestsById = new Map(requests.map((r) => [r.id, r]))
  const positionsById = new Map(positions.map((p) => [p.id, p]))

  const events = new Map<string, TipEvent>()
  for (const entry of timeEntries) {
    if (entry.date < from || entry.date > today) continue
    const hours = entryHours(entry)
    if (hours <= 0) continue
    const request = requestsById.get(entry.requestId)
    if (!request?.eventName || !scopeIds.has(request.venueId)) continue
    const key = `${request.venueId}|${entry.date}|${request.eventName}`
    let event = events.get(key)
    if (!event) {
      event = {
        key,
        venueId: request.venueId,
        venue: venuesById.get(request.venueId),
        date: entry.date,
        eventName: request.eventName,
        requestIds: [],
        costCenterId: request.costCenterId,
        costCenterByRequest: {},
        entries: [],
        positions: [],
        pros: 0,
        hours: 0,
      }
      events.set(key, event)
    }
    if (!event.requestIds.includes(request.id)) event.requestIds.push(request.id)
    event.costCenterByRequest[request.id] = request.costCenterId
    event.entries.push({ workerId: entry.workerId, hours, positionId: request.positionId, requestId: request.id })
  }

  // Pros still on the clock haven't logged hours yet, so an event is offered only once every shift has ended.
  const ended = [...events.values()].filter((event) =>
    event.requestIds.every((id) => {
      const request = requestsById.get(id)
      return !request || shiftWindow(event.date, request.startTime, request.endTime).end <= now
    })
  )

  const batches = rows.map((r) => r.batch)
  for (const event of ended) {
    event.requestIds.sort()
    event.costCenterId = requestsById.get(event.requestIds[0])?.costCenterId ?? event.costCenterId
    const byPosition = new Map<string, { workers: Set<string>; hours: number }>()
    for (const entry of event.entries) {
      let bucket = byPosition.get(entry.positionId)
      if (!bucket) {
        bucket = { workers: new Set(), hours: 0 }
        byPosition.set(entry.positionId, bucket)
      }
      bucket.workers.add(entry.workerId)
      bucket.hours += entry.hours
    }
    event.positions = [...byPosition.entries()]
      .flatMap(([id, bucket]) => {
        const position = positionsById.get(id)
        return position
          ? [{ position, pros: bucket.workers.size, hours: round2(bucket.hours), eligible: TIP_ELIGIBLE_POSITIONS.has(id) }]
          : []
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.hours - a.hours)
    event.pros = new Set(event.entries.map((e) => e.workerId)).size
    event.hours = round2(event.entries.reduce((sum, e) => sum + e.hours, 0))
    event.existing = batches
      .filter(
        (b) =>
          b.venueId === event.venueId &&
          b.date === event.date &&
          (b.eventName === event.eventName || b.requestIds.some((id) => event.requestIds.includes(id)))
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  }

  return ended.sort(
    (a, b) =>
      Number(!!a.existing) - Number(!!b.existing) || b.date.localeCompare(a.date) || a.eventName.localeCompare(b.eventName)
  )
}

/** Completed events at the persona's venues with captured hours, newest first, un-tipped events on top. */
export function useTipEvents(model: TipsModel): TipEvent[] {
  const { timeEntries, requests, positions } = useStore(
    useShallow((s) => ({ timeEntries: s.data.timeEntries, requests: s.data.requests, positions: s.data.positions }))
  )
  const minute = Math.floor(useNow().getTime() / 60_000)
  return useMemo(
    () => buildEvents({ timeEntries, requests, positions, model, now: new Date(minute * 60_000) }),
    [timeEntries, requests, positions, model, minute]
  )
}

function buildBatchLines(
  batch: TipBatch,
  timeEntries: TimeEntry[],
  requests: StaffingRequest[],
  workersById: Map<string, Worker>
): ComposerLine[] {
  const requestIds = new Set(batch.requestIds)
  const positionOf = new Map(requests.filter((r) => requestIds.has(r.id)).map((r) => [r.id, r.positionId]))
  const recorded = new Map(batch.lines.map((l) => [l.workerId, l]))
  const entries: EventEntry[] = []
  for (const entry of timeEntries) {
    if (!requestIds.has(entry.requestId) || entry.date !== batch.date) continue
    const hours = entryHours(entry)
    const positionId = positionOf.get(entry.requestId)
    if (hours <= 0 || !positionId) continue
    if (!recorded.has(entry.workerId) && !TIP_ELIGIBLE_POSITIONS.has(positionId)) continue
    entries.push({ workerId: entry.workerId, hours, positionId, requestId: entry.requestId })
  }
  const lines = aggregateLines(entries, () => true, workersById)
  for (const line of lines) {
    const saved = recorded.get(line.workerId)
    if (saved) line.hours = saved.hours
  }
  const seen = new Set(lines.map((l) => l.workerId))
  for (const saved of batch.lines) {
    if (seen.has(saved.workerId)) continue
    const worker = workersById.get(saved.workerId)
    lines.push({ workerId: saved.workerId, worker, name: workerName(worker), hours: saved.hours, positionIds: [], requestIds: [] })
  }
  return sortLines(lines)
}

/** Lines for editing a batch: everyone already on it plus tip-eligible Pros from the same event. */
export function useBatchLines(batch: TipBatch | null, model: TipsModel): ComposerLine[] {
  const { timeEntries, requests } = useStore(
    useShallow((s) => ({ timeEntries: s.data.timeEntries, requests: s.data.requests }))
  )
  return useMemo(
    () => (batch ? buildBatchLines(batch, timeEntries, requests, model.workersById) : []),
    [batch, timeEntries, requests, model]
  )
}
