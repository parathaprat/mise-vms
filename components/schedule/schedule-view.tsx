"use client"

import * as React from "react"

import { PageHeader } from "@/components/app/page-header"
import { useData, useLookups, useNow, usePersona, useRequestViews } from "@/hooks/use-demo"
import { toISODate } from "@/lib/dates"
import type { ISODate, PersonaId } from "@/lib/types"

import { LiveBoard } from "./live-board"
import { scopedVenues } from "./schedule-data"
import { ScheduleToolbar } from "./schedule-toolbar"
import { useScheduleParams } from "./use-schedule-params"
import { WeekView } from "./week-view"

const DESCRIPTION: Record<PersonaId, string> = {
  venue: "Every shift across your venues. Plan the week, then watch it happen live.",
  program: "Every shift across the program. Plan the week, then watch it happen live.",
  supplier: "Every shift on your Compass accounts. Plan the week, then watch it happen live.",
}

export function ScheduleView() {
  const now = useNow()
  const today = toISODate(now)
  const persona = usePersona()
  const views = useRequestViews()
  const lookups = useLookups()
  const venues = useData((d) => d.venues)
  const { view, date, venue, navigate } = useScheduleParams(today)

  const venueOptions = React.useMemo(() => scopedVenues(venues, views, persona), [venues, views, persona])
  const venueId = venue !== "all" && venueOptions.some((v) => v.id === venue) ? venue : "all"

  const openDay = React.useCallback((day: ISODate) => navigate({ view: "live", date: day }), [navigate])
  const openWeek = React.useCallback(() => navigate({ view: "week" }), [navigate])

  return (
    <>
      <PageHeader
        title="Schedule"
        description={DESCRIPTION[persona.id]}
        actions={<ScheduleToolbar view={view} date={date} today={today} venueId={venueId} venues={venueOptions} onNavigate={navigate} />}
      />
      {view === "live" ? (
        <LiveBoard date={date} today={today} now={now} venueId={venueId} persona={persona} views={views} lookups={lookups} onWeek={openWeek} />
      ) : (
        <WeekView date={date} today={today} now={now} venueId={venueId} personaId={persona.id} views={views} lookups={lookups} onOpenDay={openDay} />
      )}
    </>
  )
}
