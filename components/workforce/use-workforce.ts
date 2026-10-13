"use client"

import { useMemo } from "react"
import { differenceInCalendarDays } from "date-fns"
import { useShallow } from "zustand/react/shallow"

import type { Tone } from "@/components/app/status-badge"
import { useNow, usePersona } from "@/hooks/use-demo"
import type { DemoData } from "@/lib/data"
import { formatDate, parseLocal, toISODate } from "@/lib/dates"
import { workerLegalName, workerName } from "@/lib/format"
import { metroById } from "@/lib/reference"
import {
  venueInScope,
  workerComplianceFlags,
  workerInScope,
  type ComplianceFlag,
} from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type {
  BlockedWorker,
  Persona,
  Policies,
  Position,
  Shift,
  StaffingRequest,
  Supplier,
  Venue,
  VenueRoster,
  Worker,
} from "@/lib/types"

export type WorkforceTab = "all" | "favorites" | "dnr" | "compliance"

export const WORKFORCE_TABS: WorkforceTab[] = ["all", "favorites", "dnr", "compliance"]

export function isWorkforceTab(value: string | null): value is WorkforceTab {
  return !!value && (WORKFORCE_TABS as string[]).includes(value)
}

export interface BlockEntry extends BlockedWorker {
  venueId: string
}

export interface ProRow {
  id: string
  worker: Worker
  name: string
  supplier?: Supplier
  positions: Position[]
  metroLabel: string
  favoriteVenueIds: string[]
  blocks: BlockEntry[]
  shiftsHere: number
  lastWorked?: string
  upcoming: number
  nextShift?: string
  flags: ComplianceFlag[]
  haystack: string
}

export interface WorkforceModel {
  persona: Persona
  today: string
  rows: ProRow[]
  rowsById: Map<string, ProRow>
  venuesById: Map<string, Venue>
  scopeVenues: Venue[]
  suppliers: Supplier[]
  positions: Position[]
  metros: { id: string; label: string }[]
  policies: Policies
  canManage: boolean
}

export const FLAG_TONE: Record<ComplianceFlag["kind"], Tone> = {
  "cert-expired": "danger",
  "cert-expiring": "warning",
  "hours-cap": "danger",
  "hours-warn": "warning",
  onboarding: "info",
}

const FLAG_RANK: Record<ComplianceFlag["kind"], number> = {
  "cert-expired": 0,
  "hours-cap": 1,
  "cert-expiring": 2,
  "hours-warn": 3,
  onboarding: 4,
}

export function sortFlags(flags: ComplianceFlag[]): ComplianceFlag[] {
  return [...flags].sort((a, b) => FLAG_RANK[a.kind] - FLAG_RANK[b.kind])
}

/**
 * `workerInScope` and `workerComplianceFlags` take the full dataset but only read
 * `venues` and `policies`, so a narrow slice keeps subscriptions small.
 */
export function scopeContext(venues: Venue[], policies: Policies): DemoData {
  return { venues, policies } as unknown as DemoData
}

export function metroLabel(id: string): string {
  return metroById(id)?.label ?? id
}

export function lastWorkedLabel(date: string | undefined, today: string): string {
  if (!date) return "No recent shifts"
  const diff = differenceInCalendarDays(parseLocal(today), parseLocal(date))
  if (diff <= 0) return "Today"
  if (diff === 1) return "Yesterday"
  if (diff < 7) return `${diff} days ago`
  return formatDate(date, "MMM d")
}

export function eligibleVenuesFor(worker: Worker, scopeVenues: Venue[]): Venue[] {
  return scopeVenues.filter((v) => v.metro === worker.metro)
}

interface BuildInput {
  persona: Persona
  today: string
  workers: Worker[]
  venues: Venue[]
  rosters: VenueRoster[]
  suppliers: Supplier[]
  positions: Position[]
  requests: StaffingRequest[]
  shifts: Shift[]
  policies: Policies
}

function buildWorkforce(input: BuildInput): WorkforceModel {
  const { persona, today, workers, venues, rosters, suppliers, positions, requests, shifts, policies } = input
  const ctx = scopeContext(venues, policies)
  const venuesById = new Map(venues.map((v) => [v.id, v]))
  const scopeVenues = venues.filter((v) => venueInScope(v.id, persona))
  const scopeVenueIds = new Set(scopeVenues.map((v) => v.id))
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]))
  const positionMap = new Map(positions.map((p) => [p.id, p]))
  const requestVenue = new Map(requests.map((r) => [r.id, r.venueId]))

  const favorites = new Map<string, string[]>()
  const blocks = new Map<string, BlockEntry[]>()
  for (const roster of rosters) {
    if (!scopeVenueIds.has(roster.venueId)) continue
    for (const workerId of roster.favorites) {
      const list = favorites.get(workerId)
      if (list) list.push(roster.venueId)
      else favorites.set(workerId, [roster.venueId])
    }
    for (const b of roster.blocked) {
      const entry = { ...b, venueId: roster.venueId }
      const list = blocks.get(b.workerId)
      if (list) list.push(entry)
      else blocks.set(b.workerId, [entry])
    }
  }

  const stats = new Map<string, { done: number; last?: string; upcoming: number; next?: string }>()
  for (const s of shifts) {
    if (!s.workerId) continue
    const venueId = requestVenue.get(s.requestId)
    if (!venueId || !scopeVenueIds.has(venueId)) continue
    let st = stats.get(s.workerId)
    if (!st) {
      st = { done: 0, upcoming: 0 }
      stats.set(s.workerId, st)
    }
    if (s.status === "Completed") {
      st.done++
      if (!st.last || s.date > st.last) st.last = s.date
    } else if ((s.status === "Confirmed" || s.status === "Checked in") && s.date >= today) {
      st.upcoming++
      if (!st.next || s.date < st.next) st.next = s.date
    }
  }

  const rows: ProRow[] = []
  const supplierIds = new Set<string>()
  const positionIds = new Set<string>()
  const metroIds = new Set<string>()
  for (const worker of workers) {
    if (!workerInScope(worker, ctx, persona)) continue
    const supplier = supplierMap.get(worker.supplierId)
    const pos = worker.positionIds.map((id) => positionMap.get(id)).filter((p): p is Position => !!p)
    const st = stats.get(worker.id)
    const name = workerName(worker)
    const market = metroLabel(worker.metro)
    supplierIds.add(worker.supplierId)
    metroIds.add(worker.metro)
    for (const p of pos) positionIds.add(p.id)
    rows.push({
      id: worker.id,
      worker,
      name,
      supplier,
      positions: pos,
      metroLabel: market,
      favoriteVenueIds: favorites.get(worker.id) ?? [],
      blocks: blocks.get(worker.id) ?? [],
      shiftsHere: st?.done ?? 0,
      lastWorked: st?.last,
      upcoming: st?.upcoming ?? 0,
      nextShift: st?.next,
      flags: sortFlags(workerComplianceFlags(worker, ctx, today)),
      haystack: [name, workerLegalName(worker), worker.id, supplier?.name, ...pos.map((p) => p.title), market, worker.phone, worker.email]
        .join(" ")
        .toLowerCase(),
    })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name))

  return {
    persona,
    today,
    rows,
    rowsById: new Map(rows.map((r) => [r.id, r])),
    venuesById,
    scopeVenues,
    suppliers: suppliers.filter((s) => supplierIds.has(s.id)),
    positions: positions.filter((p) => positionIds.has(p.id)).sort((a, b) => a.title.localeCompare(b.title)),
    metros: [...metroIds].map((id) => ({ id, label: metroLabel(id) })).sort((a, b) => a.label.localeCompare(b.label)),
    policies,
    canManage: persona.id !== "supplier",
  }
}

export function useWorkforce(): WorkforceModel {
  const persona = usePersona()
  const now = useNow()
  const today = toISODate(now)
  const { workers, venues, rosters, suppliers, positions, requests, shifts, policies } = useStore(
    useShallow((s) => ({
      workers: s.data.workers,
      venues: s.data.venues,
      rosters: s.data.rosters,
      suppliers: s.data.suppliers,
      positions: s.data.positions,
      requests: s.data.requests,
      shifts: s.data.shifts,
      policies: s.data.policies,
    }))
  )
  return useMemo(
    () => buildWorkforce({ persona, today, workers, venues, rosters, suppliers, positions, requests, shifts, policies }),
    [persona, today, workers, venues, rosters, suppliers, positions, requests, shifts, policies]
  )
}

export interface WorkforceFilters {
  query: string
  positionId: string
  supplierId: string
  metro: string
  status: "all" | Worker["status"]
}

export const EMPTY_FILTERS: WorkforceFilters = {
  query: "",
  positionId: "all",
  supplierId: "all",
  metro: "all",
  status: "all",
}

export function hasActiveFilters(filters: WorkforceFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.positionId !== "all" ||
    filters.supplierId !== "all" ||
    filters.metro !== "all" ||
    filters.status !== "all"
  )
}

export function applyFilters(rows: ProRow[], filters: WorkforceFilters): ProRow[] {
  if (!hasActiveFilters(filters)) return rows
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((r) => {
    if (filters.positionId !== "all" && !r.worker.positionIds.includes(filters.positionId)) return false
    if (filters.supplierId !== "all" && r.worker.supplierId !== filters.supplierId) return false
    if (filters.metro !== "all" && r.worker.metro !== filters.metro) return false
    if (filters.status !== "all" && r.worker.status !== filters.status) return false
    return terms.every((t) => r.haystack.includes(t))
  })
}
