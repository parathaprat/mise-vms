"use client"

import Link from "next/link"
import * as React from "react"
import { BellIcon, RadioTowerIcon } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { EmptyState, LiveDot, TimeAgo } from "@/components/app/misc"
import { ACTIVITY_ICON } from "@/components/shell/notifications"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatClock } from "@/lib/dates"
import type { Lookups } from "@/lib/selectors"
import type { Activity, ActivityKind } from "@/lib/types"
import { cn } from "@/lib/utils"

type FeedFilter = "all" | "arrivals" | "staffing"

const FILTER_KINDS: Record<Exclude<FeedFilter, "all">, ReadonlySet<ActivityKind>> = {
  arrivals: new Set<ActivityKind>(["checkin", "noshow"]),
  staffing: new Set<ActivityKind>(["fill", "request", "approval"]),
}

const KIND_TONE: Partial<Record<ActivityKind, string>> = {
  checkin: "bg-success/12 text-success dark:bg-success/18",
  noshow: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  fill: "bg-primary/10 text-primary dark:bg-primary/20",
  approval: "bg-info/12 text-info dark:bg-info/18",
  request: "bg-muted text-muted-foreground",
}

interface LiveActivityProps {
  activities: Activity[]
  lookups: Lookups
  isToday: boolean
  dayLabel: string
  className?: string
}

export function LiveActivity({ activities, lookups, isToday, dayLabel, className }: LiveActivityProps) {
  const [filter, setFilter] = React.useState<FeedFilter>("all")
  const reduceMotion = useReducedMotion()
  const items = React.useMemo(
    () => (filter === "all" ? activities : activities.filter((a) => FILTER_KINDS[filter].has(a.kind))).slice(0, 40),
    [activities, filter]
  )

  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="border-b py-4">
        <CardTitle className="flex items-center gap-2">
          Live activity
          {isToday ? <LiveDot /> : null}
        </CardTitle>
        <CardDescription>{isToday ? "Check-ins, no-shows and staffing as they happen" : `Everything logged ${dayLabel}`}</CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            spacing={0}
            value={filter}
            onValueChange={(v) => {
              if (v === "all" || v === "arrivals" || v === "staffing") setFilter(v)
            }}
            aria-label="Filter activity"
          >
            <ToggleGroupItem value="all" className="text-xs">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="arrivals" className="text-xs">
              Arrivals
            </ToggleGroupItem>
            <ToggleGroupItem value="staffing" className="text-xs">
              Staffing
            </ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        {items.length === 0 ? (
          <EmptyState
            icon={RadioTowerIcon}
            title="Quiet so far"
            description={isToday ? "Check-ins and staffing updates will stream in here." : "Nothing in this category for the day."}
            className="m-4 border-0"
          />
        ) : (
          <ol className="flex max-h-[36rem] flex-col overflow-y-auto overscroll-contain py-1" aria-live={isToday ? "polite" : undefined}>
            <AnimatePresence initial={false}>
              {items.map((a) => (
                <motion.li
                  key={a.id}
                  layout={reduceMotion ? false : "position"}
                  initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                >
                  <FeedItem activity={a} lookups={lookups} isToday={isToday} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function FeedItem({ activity: a, lookups, isToday }: { activity: Activity; lookups: Lookups; isToday: boolean }) {
  const Icon = ACTIVITY_ICON[a.kind] ?? BellIcon
  const req = a.requestId ? lookups.requests.get(a.requestId) : undefined
  const venue = lookups.venues.get(req?.venueId ?? a.venueId ?? "")
  const body = (
    <>
      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", KIND_TONE[a.kind] ?? "bg-muted text-muted-foreground")}>
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm leading-snug text-pretty">{a.text}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isToday ? <TimeAgo value={a.at} /> : <time dateTime={a.at} className="tabular">{formatClock(a.at)}</time>}
          {venue ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{venue.shortName}</span>
            </>
          ) : null}
        </span>
      </span>
    </>
  )
  const className = "flex gap-3 px-4 py-2.5 outline-none transition-colors"
  if (req) {
    return (
      <Link href={`/requests/${req.id}`} className={cn(className, "hover:bg-muted/50 focus-visible:bg-muted/60")}>
        {body}
      </Link>
    )
  }
  return <div className={className}>{body}</div>
}
