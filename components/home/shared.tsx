"use client"

import Link from "next/link"
import * as React from "react"
import { addMinutes, format } from "date-fns"
import { AnimatePresence, motion } from "motion/react"
import {
  ActivityIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  type LucideIcon,
} from "lucide-react"

import { FillMeter } from "@/components/app/fill-meter"
import { VenueMark } from "@/components/app/identity"
import { EmptyState, LiveDot, TimeAgo } from "@/components/app/misc"
import { StatusBadge } from "@/components/app/status-badge"
import { ACTIVITY_ICON } from "@/components/shell/notifications"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { primaryActionFor } from "@/components/inbox/actions"
import { useData, useLookups, useNow, usePersona } from "@/hooks/use-demo"
import { useStore } from "@/lib/store"
import {
  formatDate,
  formatTimeRange,
  shiftWindow,
  toISODate,
} from "@/lib/dates"
import {
  requestInScope,
  venueInScope,
  type InboxItem,
  type Lookups,
  type RequestView,
} from "@/lib/selectors"
import type { Activity, Persona, Venue } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface EventGroup {
  key: string
  venue: Venue
  eventName: string
  date: string
  start: Date
  end: Date
  startTime: string
  endTime: string
  views: RequestView[]
  stats: {
    total: number
    filled: number
    checkedIn: number
    completed: number
    noShows: number
    open: number
    late: number
  }
}

export function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 5) return "Working late"
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

/** Groups requests on a date into venue events with per-date staffing stats. */
export function eventGroupsForDate(
  views: RequestView[],
  lookups: Lookups,
  date: string,
  now: Date
): EventGroup[] {
  const map = new Map<string, EventGroup>()
  for (const v of views) {
    if (v.req.state !== "active" || !v.req.dates.includes(date)) continue
    const name =
      v.req.eventName ??
      (v.venue.type === "Campus" ? "Dining service" : "Shifts")
    const key = `${v.venue.id}|${date}|${name}`
    const { start, end } = shiftWindow(date, v.req.startTime, v.req.endTime)
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        venue: v.venue,
        eventName: name,
        date,
        start,
        end,
        startTime: v.req.startTime,
        endTime: v.req.endTime,
        views: [],
        stats: {
          total: 0,
          filled: 0,
          checkedIn: 0,
          completed: 0,
          noShows: 0,
          open: 0,
          late: 0,
        },
      }
      map.set(key, g)
    }
    if (start < g.start) {
      g.start = start
      g.startTime = v.req.startTime
    }
    if (end > g.end) {
      g.end = end
      g.endTime = v.req.endTime
    }
    g.views.push(v)
    for (const s of lookups.shiftsByRequest.get(v.req.id) ?? []) {
      if (s.date !== date || s.status === "Cancelled") continue
      if (s.status === "Checked in") g.stats.checkedIn++
      if (s.status === "Completed") g.stats.completed++
      if (s.status === "No-show") {
        g.stats.noShows++
        if (!s.backfillFor) g.stats.total++
        continue
      }
      if (!s.backfillFor) g.stats.total++
      if (s.workerId) g.stats.filled++
      else g.stats.open++
      if (s.status === "Confirmed" && now > addMinutes(start, 15))
        g.stats.late++
    }
  }
  for (const g of map.values())
    g.stats.filled = Math.min(g.stats.filled, g.stats.total)
  return [...map.values()].sort((a, b) => a.start.getTime() - b.start.getTime())
}

export function eventPhase(
  g: EventGroup,
  now: Date
): {
  label: string
  tone: "success" | "primary" | "muted" | "warning"
  live: boolean
} {
  if (now >= g.end) return { label: "Wrapped", tone: "muted", live: false }
  if (now >= g.start) return { label: "Live", tone: "success", live: true }
  const mins = Math.round((g.start.getTime() - now.getTime()) / 60000)
  if (mins <= 90)
    return { label: `Starts in ${mins}m`, tone: "warning", live: false }
  if (mins < 60 * 24)
    return {
      label: `Starts ${format(g.start, "h:mm a")}`,
      tone: "primary",
      live: false,
    }
  return {
    label: formatDate(g.date, "EEE MMM d"),
    tone: "primary",
    live: false,
  }
}

export function TodayEventRow({
  group,
  now,
}: {
  group: EventGroup
  now: Date
}) {
  const phase = eventPhase(group, now)
  const href =
    group.views.length === 1
      ? `/requests/${group.views[0].req.id}`
      : `/schedule?view=live&date=${group.date}`
  const onSite = group.stats.checkedIn
  return (
    <Link
      href={href}
      className="group/event flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/15 hover:bg-muted/30 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <VenueMark venue={group.venue} size="lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{group.eventName}</span>
            <StatusBadge tone={phase.tone} pulse={phase.live}>
              {phase.label}
            </StatusBadge>
          </div>
          <span className="truncate text-xs text-muted-foreground">
            {group.venue.name} ·{" "}
            {formatTimeRange(group.startTime, group.endTime)} ·{" "}
            {group.views.length}{" "}
            {group.views.length === 1 ? "position" : "positions"}
          </span>
        </div>
      </div>
      <div className="flex w-full flex-col gap-1.5 sm:w-64">
        <FillMeter
          fill={{
            total: group.stats.total,
            filled: group.stats.filled,
            checkedIn: group.stats.checkedIn,
            completed: group.stats.completed,
          }}
          live={phase.live || now >= group.end}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {phase.live ? (
            <span className="flex items-center gap-1.5">
              <LiveDot className="size-1.5" />
              <span className="text-foreground tabular">{onSite}</span> on site
            </span>
          ) : now >= group.end ? (
            <span className="tabular">{group.stats.completed} worked</span>
          ) : (
            <span className="tabular">{group.stats.filled} confirmed</span>
          )}
          {group.stats.late > 0 && phase.live ? (
            <span className="text-warning-foreground tabular dark:text-warning">
              {group.stats.late} late
            </span>
          ) : null}
          {group.stats.noShows > 0 ? (
            <span className="text-destructive tabular">
              {group.stats.noShows} no-show
            </span>
          ) : null}
          {group.stats.open > 0 && now < group.end ? (
            <span className="text-warning-foreground tabular dark:text-warning">
              {group.stats.open} open
            </span>
          ) : null}
        </div>
      </div>
      <ArrowRightIcon className="hidden size-4 text-muted-foreground opacity-0 transition-opacity group-hover/event:opacity-100 sm:block" />
    </Link>
  )
}

export function UpcomingEventRow({ group }: { group: EventGroup }) {
  const href =
    group.views.length === 1
      ? `/requests/${group.views[0].req.id}`
      : `/schedule?date=${group.date}`
  const pct = group.stats.total
    ? Math.round((group.stats.filled / group.stats.total) * 100)
    : 0
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
    >
      <div className="flex w-12 shrink-0 flex-col items-center rounded-lg border bg-background py-1 leading-none">
        <span className="text-[10px] font-medium text-muted-foreground uppercase">
          {formatDate(group.date, "EEE")}
        </span>
        <span className="text-base font-semibold tabular">
          {formatDate(group.date, "d")}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{group.eventName}</span>
        <span className="truncate text-xs text-muted-foreground">
          {group.venue.shortName} ·{" "}
          {formatTimeRange(group.startTime, group.endTime)}
        </span>
      </div>
      <div className="flex w-28 shrink-0 flex-col items-end gap-1 sm:w-40">
        <FillMeter
          fill={{
            total: group.stats.total,
            filled: group.stats.filled,
            checkedIn: 0,
            completed: 0,
          }}
        />
        {group.stats.open > 0 ? (
          <span
            className={cn(
              "text-[11px] tabular",
              pct < 70
                ? "text-warning-foreground dark:text-warning"
                : "text-muted-foreground"
            )}
          >
            {group.stats.open} open
          </span>
        ) : (
          <span className="text-[11px] text-success">Fully staffed</span>
        )}
      </div>
    </Link>
  )
}

export function useScopedActivities(limit = 12): Activity[] {
  const activities = useData((d) => d.activities)
  const persona = usePersona()
  const lookups = useLookups()
  return React.useMemo(
    () => scopeActivities(activities, lookups, persona).slice(0, limit),
    [activities, lookups, persona, limit]
  )
}

export function scopeActivities(
  activities: Activity[],
  lookups: Lookups,
  persona: Persona
): Activity[] {
  const out: Activity[] = []
  for (let i = activities.length - 1; i >= 0; i--) {
    const a = activities[i]
    if (a.requestId) {
      const req = lookups.requests.get(a.requestId)
      if (!req || !requestInScope(req, persona)) continue
    } else if (a.venueId) {
      if (!venueInScope(a.venueId, persona)) continue
    } else if (
      persona.id === "supplier" &&
      (a.kind === "policy" || a.kind === "invoice")
    ) {
      continue
    }
    out.push(a)
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

export function ActivityFeed({
  items: all,
  className,
  limit = 5,
}: {
  items: Activity[]
  className?: string
  limit?: number
}) {
  const items = all.slice(0, limit)
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ActivityIcon}
        title="Quiet so far"
        description="Check-ins, fills and approvals stream in here as they happen."
        className="border-none"
      />
    )
  }
  return (
    <ol className={cn("relative flex flex-col", className)}>
      {items.map((a, i) => {
        const Icon = ACTIVITY_ICON[a.kind] ?? ActivityIcon
        return (
          <li
            key={a.id}
            className="relative flex gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            {i < items.length - 1 ? (
              <span
                className="absolute top-8 bottom-0 left-[13px] w-px bg-border/70"
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground",
                a.kind === "checkin" &&
                  "border-success/25 bg-success/8 text-success",
                a.kind === "noshow" &&
                  "border-destructive/25 bg-destructive/8 text-destructive",
                a.kind === "fill" &&
                  "border-foreground/10 bg-muted text-foreground/70"
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
              <span className="text-[13px] leading-snug text-pretty text-foreground/85">
                {a.text}
              </span>
              <TimeAgo
                value={a.at}
                className="text-[11px] text-muted-foreground"
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export const INBOX_ICON_TONE: Record<InboxItem["priority"], string> = {
  high: "bg-destructive/10 text-destructive dark:bg-destructive/18",
  normal:
    "bg-foreground/6 text-foreground/75 dark:bg-foreground/10 dark:text-foreground/85",
  low: "bg-muted text-muted-foreground",
}

function AttentionRow({
  item,
  icons,
}: {
  item: InboxItem
  icons: Partial<Record<string, LucideIcon>>
}) {
  const Icon = icons[item.kind] ?? ActivityIcon
  const data = useStore((s) => s.data)
  const persona = usePersona()
  const now = useNow()
  const action = React.useMemo(
    () => primaryActionFor(item, data, persona, toISODate(now)),
    [item, data, persona, now]
  )
  const [busy, setBusy] = React.useState(false)
  return (
    <div className="group/row flex items-center gap-1 rounded-lg transition-colors hover:bg-muted/55">
      <Link
        href={item.href}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            INBOX_ICON_TONE[item.priority]
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] leading-snug font-medium">
            {item.title}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {item.subtitle}
          </span>
        </span>
        {action.type === "run" ? null : (
          <ArrowRightIcon className="size-3.5 shrink-0 -translate-x-0.5 text-muted-foreground opacity-0 transition-all group-hover/row:translate-x-0 group-hover/row:opacity-100" />
        )}
      </Link>
      {action.type === "run" ? (
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          className="mr-1 shrink-0 bg-card"
          onClick={() => {
            setBusy(true)
            action.run()
            window.setTimeout(() => setBusy(false), 600)
          }}
        >
          <action.icon data-icon="inline-start" />
          <span className="max-w-28 truncate">{action.label}</span>
        </Button>
      ) : null}
    </div>
  )
}

export function AttentionList({
  items,
  icons,
  emptyText,
  limit = 3,
}: {
  items: InboxItem[]
  icons: Partial<Record<string, LucideIcon>>
  emptyText: string
  limit?: number
}) {
  const [expanded, setExpanded] = React.useState(false)
  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-2 px-2 py-7 text-center"
        data-tour="todo"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-success/12 text-success">
          <CheckIcon className="size-4" />
        </span>
        <p className="max-w-[16rem] text-sm text-pretty text-muted-foreground">
          {emptyText}
        </p>
      </div>
    )
  }
  const head = items.slice(0, limit)
  const rest = items.slice(limit)
  return (
    <div className="flex flex-col" data-tour="todo">
      <ul className="flex flex-col divide-y divide-border/60">
        <AnimatePresence initial={false}>
          {head.map((item) => (
            <motion.li
              key={item.id}
              layout="position"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 12, transition: { duration: 0.2 } }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <AttentionRow item={item} icons={icons} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <AnimatePresence initial={false}>
        {expanded && rest.length ? (
          <motion.ul
            key="more"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col divide-y divide-border/60 overflow-hidden border-t border-border/60"
          >
            {rest.map((item) => (
              <li key={item.id}>
                <AttentionRow item={item} icons={icons} />
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
      {rest.length ? (
        <div className="relative mt-1">
          {!expanded ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-card to-transparent"
            />
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="group/expand relative flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            {expanded ? "Show less" : `${rest.length} more`}
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                expanded && "rotate-180"
              )}
            />
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** One quiet line of recent activity, soft crossfade, no ticker noise. */
function LatestLine({ items, now }: { items: Activity[]; now: Date }) {
  const [index, setIndex] = React.useState(0)
  const reduceMotion = React.useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
      mq.addEventListener("change", onStoreChange)
      return () => mq.removeEventListener("change", onStoreChange)
    },
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  )
  const count = Math.min(items.length, 5)
  React.useEffect(() => {
    if (count < 2 || reduceMotion) return
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), 7000)
    return () => window.clearInterval(id)
  }, [count, reduceMotion])
  const current = items[index % count]
  const Icon = ACTIVITY_ICON[current.kind] ?? ActivityIcon
  return (
    <div className="relative flex items-center gap-3 border-t border-border/70 bg-muted/25 px-5 py-2.5 md:px-8">
      <span className="flex shrink-0 items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <LiveDot className="size-1.5" calm />
        Live
      </span>
      <span aria-hidden className="h-3 w-px shrink-0 bg-border/80" />
      <div
        className="relative h-5 min-w-0 flex-1 overflow-hidden"
        aria-live="polite"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={current.id}
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex items-center gap-2 text-[13px] text-muted-foreground"
          >
            <Icon
              className={cn(
                "size-3.5 shrink-0 opacity-70",
                current.kind === "checkin" && "text-success opacity-100",
                current.kind === "noshow" && "text-destructive opacity-100"
              )}
            />
            <span className="truncate text-foreground/80">{current.text}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground/80">
              {timeAgoShort(current.at, now)}
            </span>
          </motion.span>
        </AnimatePresence>
      </div>
      <Link
        href="/schedule?view=live"
        className="hidden shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground/90 transition-colors hover:text-foreground sm:flex"
      >
        Board
        <ArrowRightIcon className="size-3" />
      </Link>
    </div>
  )
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  )
}

export function HomeSection({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className="mt-1.5 h-8 w-0.5 shrink-0 rounded-full bg-brand"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {eyebrow}
            </span>
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {description ? (
              <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0 pl-3">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function ViewAllButton({
  href,
  label = "View all",
}: {
  href: string
  label?: string
}) {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link href={href}>
        {label}
        <ArrowRightIcon data-icon="inline-end" />
      </Link>
    </Button>
  )
}

export function todayISO(now: Date) {
  return toISODate(now)
}

export interface HeroStat {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  href?: string
  live?: boolean
  progress?: number
}

/** Landing band: greeting, actions, headline KPIs and a live activity ticker. */
export function HomeHero({
  eyebrow,
  title,
  description,
  actions,
  stats,
  ticker,
}: {
  eyebrow: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
  actions?: React.ReactNode
  stats: HeroStat[]
  ticker: Activity[]
}) {
  const now = new Date()
  const items = ticker.slice(0, 14)
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card shadow-[0_1px_0_color-mix(in_oklch,var(--foreground)_4%,transparent)]">
      <div
        aria-hidden
        className="absolute inset-0 bg-dotted [mask-image:radial-gradient(ellipse_at_100%_0%,black,transparent_65%)] opacity-70 dark:opacity-40"
      />
      <div
        aria-hidden
        className="absolute -top-24 -right-24 size-72 rounded-full bg-brand/20 blur-3xl dark:bg-brand/10"
      />
      <div className="relative grid gap-8 p-6 md:p-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex stagger flex-col justify-between gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {eyebrow}
            </span>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl">
              {title}
            </h1>
            <p className="max-w-xl text-sm text-pretty text-muted-foreground md:text-base">
              {description}
            </p>
          </div>
          {actions ? (
            <div className="flex flex-wrap gap-2">{actions}</div>
          ) : null}
        </div>
        <div
          className={cn(
            "grid stagger gap-px self-end overflow-hidden rounded-xl border bg-border/80 dark:bg-border",
            stats.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"
          )}
        >
          {stats.map((s) => {
            const body = (
              <div className="flex h-full flex-col gap-2 bg-card p-4 transition-colors hover:bg-muted/35 md:p-5">
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {s.live ? <LiveDot className="size-1.5" calm /> : null}
                  {s.label}
                </span>
                <span className="font-heading text-3xl font-semibold tracking-tight tabular md:text-4xl">
                  {s.value}
                </span>
                {s.progress !== undefined ? (
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-foreground"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min(100, Math.max(0, s.progress * 100))}%`,
                      }}
                      transition={{
                        duration: 0.9,
                        ease: [0.22, 1, 0.36, 1],
                        delay: 0.2,
                      }}
                    />
                  </div>
                ) : null}
                {s.hint ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {s.hint}
                  </span>
                ) : null}
              </div>
            )
            return s.href ? (
              <Link
                key={s.label}
                href={s.href}
                className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {body}
              </Link>
            ) : (
              <div key={s.label}>{body}</div>
            )
          })}
        </div>
      </div>
      {items.length ? <LatestLine items={items} now={now} /> : null}
    </section>
  )
}

function timeAgoShort(at: string, now: Date) {
  const mins = Math.max(
    0,
    Math.round((now.getTime() - new Date(at).getTime()) / 60000)
  )
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const h = Math.round(mins / 60)
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`
}
