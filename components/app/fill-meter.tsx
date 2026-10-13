import type { FillStats } from "@/lib/selectors"
import { cn } from "@/lib/utils"

interface FillMeterProps {
  fill: Pick<FillStats, "total" | "filled" | "checkedIn" | "completed">
  className?: string
  showLabel?: boolean
  live?: boolean
}

/** Segmented staffing bar: confirmed (primary) with on-site/completed (success) layered in. */
export function FillMeter({ fill, className, showLabel = true, live = false }: FillMeterProps) {
  const total = Math.max(0, fill.total)
  const filledPct = total ? Math.min(100, (fill.filled / total) * 100) : 0
  const onsite = live ? fill.checkedIn + fill.completed : 0
  const onsitePct = total ? Math.min(filledPct, (onsite / total) * 100) : 0
  const complete = total > 0 && fill.filled >= total
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div
        className="relative h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={fill.filled}
        aria-label={`${fill.filled} of ${total} filled`}
      >
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", complete ? "bg-success" : "bg-primary")}
          style={{ width: `${filledPct}%` }}
        />
        {live && onsitePct > 0 ? (
          <div className="absolute inset-y-0 left-0 rounded-full bg-success transition-[width] duration-500" style={{ width: `${onsitePct}%` }} />
        ) : null}
      </div>
      {showLabel ? (
        <span className="shrink-0 text-xs font-medium text-muted-foreground tabular">
          <span className="text-foreground">{fill.filled}</span>/{total}
        </span>
      ) : null}
    </div>
  )
}
