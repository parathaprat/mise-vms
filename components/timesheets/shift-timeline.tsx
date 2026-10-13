"use client"

import type * as React from "react"
import { addHours, differenceInMinutes, format, startOfHour } from "date-fns"

import { formatClock, parseLocal } from "@/lib/dates"
import { cn } from "@/lib/utils"

import { formatDuration, type EntryRow } from "./model"

const MINUTE = 60_000

function ceilHour(d: Date): Date {
  const floor = startOfHour(d)
  return floor.getTime() === d.getTime() ? d : addHours(floor, 1)
}

interface Segment {
  key: string
  from: Date
  to: Date
  className: string
  label?: string
}

/** Scheduled vs. clocked window on one shared time axis. */
export function ShiftTimeline({ row, className }: { row: EntryRow; className?: string }) {
  const { entry, scheduledStart: start, scheduledEnd: end } = row
  if (!start || !end) return null

  const clockIn = parseLocal(entry.clockIn)
  const clockOut = entry.clockOut ? parseLocal(entry.clockOut) : undefined
  const minT = Math.min(start.getTime(), clockIn.getTime())
  const maxT = Math.max(end.getTime(), clockOut?.getTime() ?? 0)
  const axisStart = startOfHour(new Date(minT - 15 * MINUTE))
  const axisEnd = ceilHour(new Date(maxT + 15 * MINUTE))
  const span = Math.max(MINUTE, axisEnd.getTime() - axisStart.getTime())
  const pos = (d: Date) => ((d.getTime() - axisStart.getTime()) / span) * 100

  const spanHours = span / (60 * MINUTE)
  const step = spanHours <= 9 ? 1 : spanHours <= 16 ? 2 : 3
  const ticks: Date[] = []
  for (let t = axisStart; t <= axisEnd; t = addHours(t, step)) ticks.push(t)

  const segments: Segment[] = []
  const gaps: Segment[] = []
  if (clockIn > start) {
    gaps.push({ key: "late", from: start, to: clockIn, className: "bg-warning/20 ring-1 ring-inset ring-warning/50" })
  }
  if (clockOut) {
    if (clockIn < start) segments.push({ key: "early-in", from: clockIn, to: start, className: "bg-primary/40" })
    const mainFrom = clockIn > start ? clockIn : start
    const mainTo = clockOut < end ? clockOut : end
    if (mainTo > mainFrom) {
      segments.push({
        key: "main",
        from: mainFrom,
        to: mainTo,
        className: "bg-primary text-primary-foreground",
        label: `${formatClock(entry.clockIn)} – ${formatClock(entry.clockOut)}`,
      })
    } else {
      segments.push({ key: "main", from: clockIn, to: clockOut, className: "bg-primary" })
    }
    if (clockOut > end) segments.push({ key: "over", from: end, to: clockOut, className: "bg-warning text-warning-foreground" })
    if (clockOut < end) {
      gaps.push({ key: "early-out", from: clockOut, to: end, className: "bg-destructive/12 ring-1 ring-inset ring-destructive/40" })
    }
  } else {
    segments.push({
      key: "open",
      from: clockIn,
      to: end > clockIn ? end : addHours(clockIn, 1),
      className: "border border-dashed border-destructive/60 bg-destructive/8 text-destructive",
      label: "No clock-out",
    })
  }

  const worked = clockOut ? differenceInMinutes(clockOut, clockIn) : 0
  const scheduled = differenceInMinutes(end, start)

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
        <span className="text-xs text-muted-foreground">Scheduled</span>
        <Track guides={[pos(start), pos(end)]}>
          <Bar left={pos(start)} right={pos(end)} className="bg-foreground/8 text-foreground ring-1 ring-inset ring-foreground/15">
            {formatClock(formatLocal(start))} – {formatClock(formatLocal(end))}
          </Bar>
        </Track>
        <span className="text-xs text-muted-foreground">Clocked</span>
        <Track guides={[pos(start), pos(end)]}>
          {gaps.map((g) => (
            <Bar key={g.key} left={pos(g.from)} right={pos(g.to)} className={g.className} />
          ))}
          {segments.map((s) => (
            <Bar key={s.key} left={pos(s.from)} right={pos(s.to)} className={s.className}>
              {s.label}
            </Bar>
          ))}
        </Track>
        <span aria-hidden />
        <div className="relative h-4" aria-hidden>
          {ticks.map((t, i) => (
            <span
              key={t.getTime()}
              className={cn(
                "absolute top-0 text-[10px] whitespace-nowrap text-muted-foreground tabular",
                i === 0 ? "translate-x-0" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
              )}
              style={{ left: `${pos(t)}%` }}
            >
              {format(t, "h a")}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <LegendDot className="bg-foreground/15 ring-1 ring-inset ring-foreground/20">Scheduled · {formatDuration(scheduled)}</LegendDot>
        <LegendDot className="bg-primary">{clockOut ? `On the clock · ${formatDuration(worked)}` : "Clocked in, never out"}</LegendDot>
        {gaps.length ? <LegendDot className="bg-warning/30 ring-1 ring-inset ring-warning/60">Missed scheduled time</LegendDot> : null}
        {clockOut && clockOut > end ? <LegendDot className="bg-warning">Past scheduled end</LegendDot> : null}
      </div>
    </div>
  )
}

function formatLocal(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

function Track({ guides, children }: { guides: number[]; children: React.ReactNode }) {
  return (
    <div className="relative h-7 overflow-hidden rounded-md bg-muted/60">
      {guides.map((g, i) => (
        <span key={i} aria-hidden className="absolute inset-y-0 border-l border-dashed border-foreground/25" style={{ left: `${g}%` }} />
      ))}
      {children}
    </div>
  )
}

function Bar({ left, right, className, children }: { left: number; right: number; className?: string; children?: React.ReactNode }) {
  const l = Math.max(0, Math.min(100, left))
  const w = Math.max(0.8, Math.min(100, right) - l)
  return (
    <div
      className={cn("absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-[5px] px-1.5", className)}
      style={{ left: `${l}%`, width: `${w}%` }}
    >
      {children ? <span className="truncate text-[11px] font-medium tabular">{children}</span> : null}
    </div>
  )
}

function LegendDot({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-[3px]", className)} aria-hidden />
      {children}
    </span>
  )
}
