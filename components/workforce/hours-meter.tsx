import type { Tone } from "@/components/app/status-badge"
import { num } from "@/lib/format"
import { cn } from "@/lib/utils"

export type HoursLevel = "ok" | "warn" | "cap"

export function hoursLevel(hours: number, cap: number, warnPct: number): HoursLevel {
  if (hours >= cap) return "cap"
  if (hours >= cap * (warnPct / 100)) return "warn"
  return "ok"
}

export const HOURS_BAR: Record<HoursLevel, string> = {
  ok: "bg-primary",
  warn: "bg-warning",
  cap: "bg-destructive",
}

export const HOURS_TEXT: Record<HoursLevel, string> = {
  ok: "text-foreground",
  warn: "text-warning-foreground dark:text-warning",
  cap: "text-destructive",
}

export const HOURS_TONE: Record<HoursLevel, Tone> = {
  ok: "success",
  warn: "warning",
  cap: "danger",
}

export const HOURS_LABEL: Record<HoursLevel, string> = {
  ok: "Within cap",
  warn: "Approaching cap",
  cap: "At cap",
}

interface HoursMeterProps {
  hours: number
  cap: number
  warnPct: number
  showLabel?: boolean
  className?: string
}

/** Compact contractual-hours bar with a tick at the warning threshold. */
export function HoursMeter({ hours, cap, warnPct, showLabel = true, className }: HoursMeterProps) {
  const level = hoursLevel(hours, cap, warnPct)
  const pct = cap > 0 ? Math.min(100, (hours / cap) * 100) : 0
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div
        className="relative h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={hours}
        aria-label={`${hours} of ${cap} contractual hours`}
      >
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", HOURS_BAR[level])}
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-y-0 w-px bg-foreground/25" style={{ left: `${warnPct}%` }} aria-hidden />
      </div>
      {showLabel ? (
        <span className="shrink-0 text-xs text-muted-foreground tabular">
          <span className={cn("font-medium", HOURS_TEXT[level])}>{num(hours)}</span>/{num(cap)}h
        </span>
      ) : null}
    </div>
  )
}
