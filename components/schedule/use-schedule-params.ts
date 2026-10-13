"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import * as React from "react"

import type { ISODate } from "@/lib/types"

import { isISODate, type ScheduleMode } from "./schedule-data"

export interface ScheduleNavigation {
  view?: ScheduleMode
  /** `null` jumps back to today. */
  date?: ISODate | null
  venue?: string
}

export function useScheduleParams(today: ISODate) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const view: ScheduleMode = params.get("view") === "live" ? "live" : "week"
  const rawDate = params.get("date")
  const date: ISODate = isISODate(rawDate) ? rawDate : today
  const venue = params.get("venue") ?? "all"

  const navigate = React.useCallback(
    (patch: ScheduleNavigation) => {
      const next = new URLSearchParams(params.toString())
      if (patch.view) {
        if (patch.view === "live") next.set("view", "live")
        else next.delete("view")
      }
      if (patch.date !== undefined) {
        if (patch.date === null || patch.date === today) next.delete("date")
        else next.set("date", patch.date)
      }
      if (patch.venue !== undefined) {
        if (patch.venue === "all") next.delete("venue")
        else next.set("venue", patch.venue)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [params, pathname, router, today]
  )

  return { view, date, venue, navigate }
}
