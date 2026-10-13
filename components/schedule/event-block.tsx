"use client"

import { CircleCheckIcon, CircleDashedIcon, ClockIcon, HourglassIcon, SquarePenIcon } from "lucide-react"

import { FillMeter } from "@/components/app/fill-meter"
import { hueStyle } from "@/components/app/identity"
import { LiveDot } from "@/components/app/misc"
import { num, plural } from "@/lib/format"
import { cn } from "@/lib/utils"

import { blockPhase, compactTimeRange, type BlockPhase, type EventBlock } from "./schedule-data"

export function BlockStatus({ block, phase, className }: { block: EventBlock; phase: BlockPhase; className?: string }) {
  const base = cn("inline-flex min-w-0 items-center gap-1 text-xs font-medium [&_svg]:size-3 [&_svg]:shrink-0", className)
  switch (phase) {
    case "tentative":
      return block.draftOnly ? (
        <span className={cn(base, "text-muted-foreground")}>
          <SquarePenIcon aria-hidden />
          Draft
        </span>
      ) : (
        <span className={cn(base, "text-warning-foreground dark:text-warning")}>
          <HourglassIcon aria-hidden />
          Pending approval
        </span>
      )
    case "done":
      return <span className={cn(base, "text-muted-foreground")}>Completed</span>
    case "live":
      return (
        <span className={cn(base, "text-success")}>
          <LiveDot className="mr-0.5" />
          <span className="truncate tabular">{num(block.fill.checkedIn)} on site</span>
        </span>
      )
    case "open":
      return (
        <span className={cn(base, "text-warning-foreground dark:text-warning")}>
          <CircleDashedIcon aria-hidden />
          <span className="truncate tabular">{plural(block.fill.open, "open shift")}</span>
        </span>
      )
    case "filled":
      return (
        <span className={cn(base, "text-success")}>
          <CircleCheckIcon aria-hidden />
          Filled
        </span>
      )
  }
}

interface EventBlockCardProps {
  block: EventBlock
  now: Date
  past: boolean
  layout?: "stack" | "row"
  onOpen: () => void
}

export function EventBlockCard({ block, now, past, layout = "stack", onOpen }: EventBlockCardProps) {
  const phase = blockPhase(block, now)
  const positions = block.requests.length
  const tentativeSlots = block.requests.filter((r) => r.tentative).reduce((sum, r) => sum + r.fill.total, 0)
  const mixedPending = !block.tentative && block.pendingCount > 0

  const meter = block.tentative ? (
    <span className="text-xs text-muted-foreground tabular">{plural(tentativeSlots, "Pro")} requested</span>
  ) : (
    <FillMeter fill={block.fill} live={phase === "live" || phase === "done"} />
  )

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${block.name} at ${block.venue.shortName}, ${compactTimeRange(block.start, block.end)}`}
      className={cn(
        "group/block relative flex w-full min-w-0 overflow-hidden rounded-lg border bg-card text-left shadow-xs transition-[box-shadow,border-color,opacity] outline-none hover:border-foreground/15 hover:shadow-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        block.tentative && "border-dashed border-foreground/20 bg-muted/40 shadow-none dark:border-foreground/25",
        past && "opacity-75 hover:opacity-100",
        layout === "stack" ? "flex-col gap-2 py-2.5 pr-2.5 pl-3.5" : "flex-col gap-2 py-3 pr-3 pl-4 sm:flex-row sm:items-center sm:gap-4"
      )}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-1 hue-solid", block.tentative && "opacity-45")}
        style={hueStyle(block.venue.hue)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-sm leading-snug font-medium", layout === "stack" ? "line-clamp-2" : "truncate")}>{block.name}</span>
        {layout === "stack" ? (
          <span className="flex flex-col text-xs text-muted-foreground">
            <span className="tabular">{compactTimeRange(block.start, block.end)}</span>
            <span className="truncate">{block.venue.shortName}</span>
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{block.venue.shortName}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex shrink-0 items-center gap-1 tabular">
              <ClockIcon className="size-3" aria-hidden />
              {compactTimeRange(block.start, block.end)}
            </span>
          </span>
        )}
      </div>
      <div className={cn("flex min-w-0 flex-col gap-1.5", layout === "row" && "sm:w-56 sm:shrink-0")}>
        {meter}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <span className="text-xs text-muted-foreground tabular">
            {plural(positions, "position")}
            {mixedPending ? <span className="text-warning-foreground dark:text-warning"> · {num(block.pendingCount)} pending</span> : null}
          </span>
          <BlockStatus block={block} phase={phase} />
        </div>
      </div>
    </button>
  )
}
