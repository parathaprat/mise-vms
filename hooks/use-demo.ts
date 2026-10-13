"use client"

import { useMemo, useSyncExternalStore } from "react"
import { useShallow } from "zustand/react/shallow"

import type { DemoData } from "@/lib/data"
import { PERSONAS } from "@/lib/reference"
import {
  buildInbox,
  buildLookups,
  buildRequestView,
  requestInScope,
  type InboxItem,
  type Lookups,
  type RequestView,
} from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { Persona } from "@/lib/types"

/** Subscribe to a slice of the demo data. Prefer narrow selectors to limit re-renders. */
export function useData<T>(selector: (data: DemoData) => T): T {
  return useStore((s) => selector(s.data))
}

export function usePersona(): Persona {
  const id = useStore((s) => s.persona)
  return PERSONAS[id]
}

export function usePolicies() {
  return useStore((s) => s.data.policies)
}

// A single shared clock so every relative time / live status re-renders together.
let clockNow = Date.now()
const clockListeners = new Set<() => void>()
let clockTimer: ReturnType<typeof setInterval> | null = null

function subscribeClock(listener: () => void) {
  clockListeners.add(listener)
  if (!clockTimer) {
    clockTimer = setInterval(() => {
      clockNow = Date.now()
      clockListeners.forEach((l) => l())
    }, 15_000)
  }
  return () => {
    clockListeners.delete(listener)
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer)
      clockTimer = null
    }
  }
}

export function bumpClock() {
  clockNow = Date.now()
  clockListeners.forEach((l) => l())
}

const getClock = () => clockNow

export function useNow(): Date {
  const value = useSyncExternalStore(subscribeClock, getClock, getClock)
  return useMemo(() => new Date(value), [value])
}

export function useLookups(): Lookups {
  const slices = useStore(
    useShallow((s) => ({
      venues: s.data.venues,
      costCenters: s.data.costCenters,
      positions: s.data.positions,
      workers: s.data.workers,
      suppliers: s.data.suppliers,
      requests: s.data.requests,
      shifts: s.data.shifts,
      timeEntries: s.data.timeEntries,
    }))
  )
  return useMemo(
    () => buildLookups(slices as unknown as DemoData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slices.venues, slices.costCenters, slices.positions, slices.workers, slices.suppliers, slices.requests, slices.shifts, slices.timeEntries]
  )
}

/** All requests visible to the active persona, with fill + status computed. */
export function useRequestViews(): RequestView[] {
  const lookups = useLookups()
  const persona = usePersona()
  const now = useNow()
  return useMemo(() => {
    const out: RequestView[] = []
    for (const req of lookups.requests.values()) {
      if (!requestInScope(req, persona)) continue
      const view = buildRequestView(req, lookups, now)
      if (view) out.push(view)
    }
    return out
  }, [lookups, persona, now])
}

export function useRequestView(id: string): RequestView | null {
  const lookups = useLookups()
  const now = useNow()
  return useMemo(() => {
    const req = lookups.requests.get(id)
    return req ? buildRequestView(req, lookups, now) : null
  }, [lookups, id, now])
}

export function useInbox(): InboxItem[] {
  const data = useStore((s) => s.data)
  const lookups = useLookups()
  const persona = usePersona()
  const now = useNow()
  return useMemo(() => buildInbox(data, lookups, persona, now), [data, lookups, persona, now])
}
