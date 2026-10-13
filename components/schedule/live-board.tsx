"use client"

import * as React from "react"
import { CalendarRangeIcon, CalendarX2Icon, CircleCheckIcon, CircleDashedIcon, ClockAlertIcon, UserCheckIcon, UserRoundXIcon, UsersRoundIcon } from "lucide-react"

import { EmptyState, LiveDot } from "@/components/app/misc"
import { StatCard } from "@/components/app/stat-card"
import { Button } from "@/components/ui/button"
import { useData } from "@/hooks/use-demo"
import { num, plural } from "@/lib/format"
import type { Lookups, RequestView } from "@/lib/selectors"
import type { ISODate, Persona } from "@/lib/types"

import { LiveActivity } from "./live-activity"
import { LiveTimeline } from "./live-timeline"
import { NeedsAttention } from "./needs-attention"
import { attentionItems, dayActivities, dayLabel, dayRequests, liveRows, liveTotals, type LiveTotals } from "./schedule-data"

interface LiveBoardProps {
  date: ISODate
  today: ISODate
  now: Date
  venueId: string
  persona: Persona
  views: RequestView[]
  lookups: Lookups
  onWeek: () => void
}

export function LiveBoard({ date, today, now, venueId, persona, views, lookups, onWeek }: LiveBoardProps) {
  const activities = useData((d) => d.activities)
  const isToday = date === today
  const label = dayLabel(date, now)

  const rows = React.useMemo(() => liveRows(dayRequests(views, lookups, date, { venueId, includeTentative: false }), now), [views, lookups, date, venueId, now])
  const totals = React.useMemo(() => liveTotals(rows, lookups, persona, now), [rows, lookups, persona, now])
  const attention = React.useMemo(() => attentionItems(rows, lookups, persona, now), [rows, lookups, persona, now])
  const feed = React.useMemo(() => dayActivities(activities, date, lookups, persona, venueId), [activities, date, lookups, persona, venueId])
  const nextGap = React.useMemo(
    () => rows.filter((r) => r.counts.open > 0 && r.start > now).sort((a, b) => a.start.getTime() - b.start.getTime())[0],
    [rows, now]
  )

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarX2Icon}
        title={`No shifts ${isToday ? "today" : `on ${label}`}`}
        description={
          venueId !== "all"
            ? "Nothing is scheduled at this venue for the day. Try all venues or jump to the week to find the next event."
            : "There’s nothing on the board for this day. The week view shows what’s coming up next."
        }
        action={
          <Button variant="outline" onClick={onWeek}>
            <CalendarRangeIcon data-icon="inline-start" />
            Open week view
          </Button>
        }
        className="py-16"
      />
    )
  }

  return (
    <>
      <LiveStats totals={totals} isToday={isToday} past={date < today} supplier={persona.id === "supplier"} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <LiveTimeline rows={rows} date={date} now={now} isToday={isToday} />
        </div>
        <NeedsAttention
          items={attention}
          personaId={persona.id}
          isToday={isToday}
          nextGap={nextGap}
          className="order-first min-w-0 xl:order-none xl:col-start-1 xl:row-start-2"
        />
        <LiveActivity
          activities={feed}
          lookups={lookups}
          isToday={isToday}
          dayLabel={label}
          className="min-w-0 xl:sticky xl:top-20 xl:col-start-2 xl:row-span-2 xl:row-start-1"
        />
      </div>
    </>
  )
}

function LiveStats({ totals, isToday, past, supplier }: { totals: LiveTotals; isToday: boolean; past: boolean; supplier: boolean }) {
  const waiting = totals.confirmed + totals.enroute
  const scope = supplier ? "Your Pros, not yet arrived" : null
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="Confirmed"
        icon={UsersRoundIcon}
        value={num(waiting)}
        hint={totals.enroute ? `Incl. ${plural(totals.enroute, "backfill")} en route` : (scope ?? "Scheduled, not yet arrived")}
      />
      <StatCard
        label="Checked in"
        icon={UserCheckIcon}
        value={num(totals.onsite)}
        hint={
          isToday && totals.onsite > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <LiveDot />
              On site right now
            </span>
          ) : (
            "On site right now"
          )
        }
      />
      <StatCard
        label="Late"
        icon={ClockAlertIcon}
        value={<span className={totals.late ? "text-warning-foreground dark:text-warning" : undefined}>{num(totals.late)}</span>}
        hint={
          totals.late ? (
            <span className="inline-flex items-center gap-1.5">
              <LiveDot tone="warning" />
              No check-in 15+ min after start
            </span>
          ) : (
            "No check-in 15+ min after start"
          )
        }
      />
      <StatCard
        label="No-shows"
        icon={UserRoundXIcon}
        value={<span className={totals.noshow ? "text-destructive" : undefined}>{num(totals.noshow)}</span>}
        hint={totals.noshow ? (totals.backfilled ? `${plural(totals.backfilled, "backfill")} dispatched` : "No backfills yet") : "Everyone showed up"}
      />
      <StatCard label="Completed" icon={CircleCheckIcon} value={num(totals.completed)} hint="Clocked out, timesheet captured" />
      <StatCard
        label="Open slots"
        icon={CircleDashedIcon}
        value={<span className={totals.openSoon ? "text-warning-foreground dark:text-warning" : undefined}>{num(totals.open)}</span>}
        hint={
          totals.openSoon
            ? `${num(totals.openSoon)} start within 3 hours`
            : totals.openAhead
              ? "Still out with suppliers"
              : totals.open
                ? "Went unfilled"
                : past
                  ? "Every slot was covered"
                  : "Fully staffed"
        }
      />
    </div>
  )
}
