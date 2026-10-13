"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow } from "@/hooks/use-demo"
import { daysFromToday, formatDate, formatDateTime, parseLocal, relativeDay, timeAgo } from "@/lib/dates"
import type { InboxItem } from "@/lib/selectors"
import { cn } from "@/lib/utils"

/**
 * Inbox timestamps mix moments ("2026-10-12T16:37") with plain dates, a COI's expiry can even be in the
 * future, so they need their own wording instead of a bare "time ago".
 */
export function describeInboxTime(item: Pick<InboxItem, "kind" | "at">, now: Date): { label: string; full: string } {
  if (item.kind === "supplier-coi") {
    const days = daysFromToday(item.at, now)
    return {
      label: days === 0 ? "Today" : days < 0 ? `${-days}d ago` : `in ${days}d`,
      full: `${days < 0 ? "Expired" : "Expires"} ${formatDate(item.at, "EEE, MMM d, yyyy")}`,
    }
  }
  if (item.at.length <= 10) return { label: relativeDay(item.at, now), full: formatDate(item.at, "EEEE, MMM d") }
  if (parseLocal(item.at) > now) return { label: formatDate(item.at.slice(0, 10), "MMM d"), full: formatDateTime(item.at) }
  return { label: timeAgo(item.at, now), full: formatDateTime(item.at) }
}

export function InboxTime({ item, className }: { item: Pick<InboxItem, "kind" | "at">; className?: string }) {
  const now = useNow()
  const { label, full } = describeInboxTime(item, now)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={item.at} className={cn("shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular", className)}>
          {label}
        </time>
      </TooltipTrigger>
      <TooltipContent>{full}</TooltipContent>
    </Tooltip>
  )
}
