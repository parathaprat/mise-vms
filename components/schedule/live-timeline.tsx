"use client"

import Link from "next/link"
import * as React from "react"

import { hueStyle, VenueMark } from "@/components/app/identity"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { num, plural } from "@/lib/format"
import type { ISODate } from "@/lib/types"
import { cn } from "@/lib/utils"

import {
  compactClock,
  compactTimeRange,
  hourLabel,
  minutesFromMidnight,
  SERVICE_LABEL,
  timelineAxis,
  type LiveCounts,
  type LiveRow,
  type LiveState,
} from "./schedule-data"

const MIN_HOUR_PX = 64

const SEGMENTS: { state: LiveState; label: string; className: string }[] = [
  { state: "completed", label: "Done", className: "bg-success/55" },
  { state: "onsite", label: "On site", className: "bg-success" },
  { state: "confirmed", label: "Confirmed", className: "bg-primary" },
  { state: "enroute", label: "Backfill en route", className: "bg-info" },
  { state: "late", label: "Late", className: "bg-warning" },
  { state: "noshow", label: "No-show", className: "bg-destructive" },
  { state: "open", label: "Open", className: "bg-foreground/15" },
]

const LEGEND = SEGMENTS.filter((s) => s.state !== "enroute")

function assigned(c: LiveCounts) {
  return c.confirmed + c.enroute + c.late + c.onsite + c.completed
}

function barCount(row: LiveRow): string {
  const n = row.phase === "upcoming" ? assigned(row.counts) : row.phase === "live" ? row.counts.onsite : row.counts.completed
  return `${num(n)}/${num(row.slots.length)}`
}

function barLabel(row: LiveRow): string {
  return `${barCount(row)} ${row.phase === "upcoming" ? "confirmed" : row.phase === "live" ? "on site" : "worked"}`
}

function breakdown(c: LiveCounts): string {
  const parts: string[] = []
  if (c.onsite) parts.push(`${num(c.onsite)} on site`)
  if (c.completed) parts.push(`${num(c.completed)} done`)
  if (c.confirmed) parts.push(`${num(c.confirmed)} confirmed`)
  if (c.enroute) parts.push(`${num(c.enroute)} backfill en route`)
  if (c.late) parts.push(`${num(c.late)} late`)
  if (c.noshow) parts.push(`${plural(c.noshow, "no-show")}`)
  if (c.open) parts.push(`${num(c.open)} open`)
  return parts.join(" · ") || "No shifts"
}

interface LiveTimelineProps {
  rows: LiveRow[]
  date: ISODate
  now: Date
  isToday: boolean
}

export function LiveTimeline({ rows, date, now, isToday }: LiveTimelineProps) {
  const ordered = React.useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ea = `${a.view.venue.shortName}|${a.view.req.eventName ?? ""}`
        const eb = `${b.view.venue.shortName}|${b.view.req.eventName ?? ""}`
        return a.start.getTime() - b.start.getTime() || ea.localeCompare(eb) || a.view.position.title.localeCompare(b.view.position.title)
      }),
    [rows]
  )
  const axis = React.useMemo(() => timelineAxis(rows, date), [rows, date])
  const spanHours = (axis.endMin - axis.startMin) / 60

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [visibleTrack, setVisibleTrack] = React.useState(0)
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      const label = el.querySelector<HTMLElement>("[data-timeline-label]")
      setVisibleTrack(Math.max(0, el.clientWidth - (label?.offsetWidth ?? 0)))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const hourPx = Math.max(MIN_HOUR_PX, spanHours > 0 ? Math.floor(visibleTrack / spanHours) : MIN_HOUR_PX)
  const trackWidth = Math.round(spanHours * hourPx)
  const x = (minutes: number) => ((minutes - axis.startMin) / 60) * hourPx
  const nowMin = minutesFromMidnight(date, now)
  const nowX = nowMin >= axis.startMin && nowMin <= axis.endMin ? x(nowMin) : null
  const columns = { gridTemplateColumns: `var(--label-w) ${trackWidth}px` }

  const nowXRef = React.useRef<number | null>(nowX)
  React.useEffect(() => {
    nowXRef.current = nowX
  }, [nowX])
  React.useEffect(() => {
    const el = scrollRef.current
    const target = nowXRef.current
    if (!el) return
    if (target === null) {
      el.scrollLeft = 0
      return
    }
    const label = el.querySelector<HTMLElement>("[data-timeline-label]")?.offsetWidth ?? 0
    el.scrollTo({ left: Math.max(0, target - (el.clientWidth - label) * 0.4), behavior: "smooth" })
  }, [date, axis.startMin, axis.endMin, hourPx])

  const totalSlots = rows.reduce((sum, r) => sum + r.slots.length, 0)
  const first = rows.reduce<Date | null>((min, r) => (!min || r.start < min ? r.start : min), null)
  const last = rows.reduce<Date | null>((max, r) => (!max || r.end > max ? r.end : max), null)

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Timeline</CardTitle>
        <CardDescription className="tabular">
          {plural(rows.length, "position")} · {plural(totalSlots, "shift")}
          {first && last ? ` · ${compactTimeRange(first, last)}` : ""}
        </CardDescription>
        <CardAction className="hidden lg:block">
          <ul className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {LEGEND.map((s) => (
              <li key={s.state} className="flex items-center gap-1.5">
                <span aria-hidden className={cn("size-2 rounded-full", s.className)} />
                {s.label}
              </li>
            ))}
          </ul>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain [--label-w:10.5rem] sm:[--label-w:15rem]">
          <div className="relative" style={{ width: `calc(var(--label-w) + ${trackWidth}px)` }}>
            <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 left-(--label-w)">
              {axis.hours.map((m) => (
                <span key={m} className={cn("absolute inset-y-0 w-px", m % 1440 === 0 ? "bg-foreground/15" : "bg-border/70")} style={{ left: x(m) }} />
              ))}
            </div>

            <div className="grid h-9 border-b" style={columns}>
              <div data-timeline-label className="sticky left-0 z-10 flex items-center border-r bg-card px-4 text-xs font-medium text-muted-foreground">
                Position
              </div>
              <div className="relative" aria-hidden>
                {axis.hours.slice(0, -1).map((m) => (
                  <span key={m} className="absolute top-1/2 -translate-y-1/2 pl-1.5 text-[11px] whitespace-nowrap text-muted-foreground tabular" style={{ left: x(m) }}>
                    {hourLabel(m)}
                    {m >= 1440 && m % 1440 === 0 ? <span className="ml-1 text-muted-foreground/70">+1</span> : null}
                  </span>
                ))}
              </div>
            </div>

            {ordered.map((row) => {
              const left = x(minutesFromMidnight(date, row.start))
              return <TimelineRow key={row.key} row={row} now={now} columns={columns} left={left} width={x(minutesFromMidnight(date, row.end)) - left} />
            })}

            {nowX !== null ? (
              <div aria-hidden className="pointer-events-none absolute inset-y-0 z-[5]" style={{ left: `calc(var(--label-w) + ${nowX}px)` }}>
                <span className="absolute top-9 bottom-0 w-px -translate-x-1/2 bg-primary" />
                <span className="absolute top-2 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none font-semibold whitespace-nowrap text-primary-foreground tabular shadow-sm">
                  {isToday ? "Now" : "This time"} · {compactClock(now)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface TimelineRowProps {
  row: LiveRow
  now: Date
  columns: React.CSSProperties
  left: number
  width: number
}

function TimelineRow({ row, now, columns, left, width }: TimelineRowProps) {
  const { req, venue, position } = row.view
  const total = row.slots.length
  const elapsed = row.phase === "done" ? 1 : row.phase === "live" ? (now.getTime() - row.start.getTime()) / (row.end.getTime() - row.start.getTime()) : 0
  return (
    <Link
      href={`/requests/${req.id}`}
      className="group/row grid h-12 border-b outline-none last:border-b-0 focus-visible:bg-muted/60"
      style={columns}
      aria-label={`${position.title} at ${venue.shortName}: ${breakdown(row.counts)}`}
    >
      <div className="sticky left-0 z-10 flex min-w-0 items-center gap-2.5 border-r bg-card px-4 transition-colors group-hover/row:bg-[color-mix(in_oklch,var(--muted)_70%,var(--card))] group-focus-visible/row:bg-[color-mix(in_oklch,var(--muted)_70%,var(--card))]">
        <VenueMark venue={venue} size="xs" className="max-sm:hidden" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm leading-tight font-medium">{position.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {venue.shortName} · {req.eventName ?? SERVICE_LABEL}
          </span>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground tabular max-sm:hidden">{barCount(row)}</span>
      </div>
      <div className="relative transition-colors group-hover/row:bg-muted/30">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn("absolute top-2 bottom-2 overflow-clip rounded-md hue-chip ring-1 ring-foreground/5 ring-inset", row.phase === "done" && "opacity-75")}
              style={{ ...hueStyle(venue.hue), left, width: Math.max(width, 8) }}
            >
              {elapsed > 0 ? <span aria-hidden className="absolute inset-y-0 left-0 hue-solid opacity-20" style={{ width: `${Math.min(1, Math.max(0, elapsed)) * 100}%` }} /> : null}
              <span className="sticky left-[calc(var(--label-w)+0.25rem)] block w-fit max-w-full truncate px-2 text-xs leading-7 font-medium tabular">
                {barLabel(row)}
                {row.counts.late ? <span className="font-normal opacity-80"> · {num(row.counts.late)} late</span> : null}
              </span>
              <span aria-hidden className="absolute inset-x-0 bottom-0 flex h-1">
                {SEGMENTS.map((s) =>
                  row.counts[s.state] ? <span key={s.state} className={s.className} style={{ width: `${(row.counts[s.state] / Math.max(1, total)) * 100}%` }} /> : null
                )}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="flex-col items-start gap-0.5">
            <span className="font-medium">
              {position.title} · {venue.shortName}
            </span>
            <span className="tabular opacity-80">
              {compactTimeRange(row.start, row.end)} · {req.id}
            </span>
            <span className="tabular">{breakdown(row.counts)}</span>
          </TooltipContent>
        </Tooltip>
      </div>
    </Link>
  )
}
