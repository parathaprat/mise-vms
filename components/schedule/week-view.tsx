"use client"

import * as React from "react"
import { CalendarRangeIcon, CircleDashedIcon, DollarSignIcon, UserCheckIcon } from "lucide-react"

import { StatCard } from "@/components/app/stat-card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDate } from "@/lib/dates"
import { money, num, pct, plural } from "@/lib/format"
import type { Lookups, RequestView } from "@/lib/selectors"
import type { ISODate, PersonaId } from "@/lib/types"
import { cn } from "@/lib/utils"

import { EventBlockCard } from "./event-block"
import { EventSheet } from "./event-sheet"
import { dayRequests, groupEvents, summarizeWeek, weekDates, type DayRequest, type EventBlock, type WeekSummary } from "./schedule-data"

interface WeekViewProps {
  date: ISODate
  today: ISODate
  now: Date
  venueId: string
  personaId: PersonaId
  views: RequestView[]
  lookups: Lookups
  onOpenDay: (date: ISODate) => void
}

interface WeekDay {
  date: ISODate
  requests: DayRequest[]
  blocks: EventBlock[]
  slots: number
}

export function WeekView({ date, today, now, venueId, personaId, views, lookups, onOpenDay }: WeekViewProps) {
  const includeTentative = personaId !== "supplier"
  const days = React.useMemo<WeekDay[]>(
    () =>
      weekDates(date).map((d) => {
        const requests = dayRequests(views, lookups, d, { venueId, includeTentative })
        return {
          date: d,
          requests,
          blocks: groupEvents(requests),
          slots: requests.reduce((sum, r) => sum + (r.tentative ? 0 : r.fill.total), 0),
        }
      }),
    [views, lookups, date, venueId, includeTentative]
  )
  const summary = React.useMemo(() => summarizeWeek(days, now), [days, now])

  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const selected = React.useMemo(() => {
    if (!selectedKey) return null
    for (const day of days) {
      const found = day.blocks.find((b) => b.key === selectedKey)
      if (found) return found
    }
    return null
  }, [days, selectedKey])

  const open = (block: EventBlock) => {
    setSelectedKey(block.key)
    setSheetOpen(true)
  }

  const empty = days.every((d) => d.blocks.length === 0)

  return (
    <>
      <WeekSummaryStrip summary={summary} personaId={personaId} />

      <section aria-label={`Week of ${formatDate(days[0].date, "MMMM d")}`} className="@container">
        <div className="hidden overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10 @4xl:grid @4xl:grid-cols-7 @4xl:gap-px">
          {days.map((day) => (
            <DayColumn key={day.date} day={day} today={today} now={now} onOpen={open} onOpenDay={onOpenDay} />
          ))}
        </div>

        <div className="flex flex-col gap-5 @4xl:hidden">
          {days.map((day) => (
            <AgendaDay key={day.date} day={day} today={today} now={now} onOpen={open} onOpenDay={onOpenDay} />
          ))}
        </div>

        {empty ? (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Nothing scheduled this week{venueId !== "all" ? " at this venue" : ""}. Try another week or venue.
          </p>
        ) : null}
      </section>

      <EventSheet block={selected} open={sheetOpen} onOpenChange={setSheetOpen} now={now} today={today} personaId={personaId} onOpenDay={onOpenDay} />
    </>
  )
}

function WeekSummaryStrip({ summary, personaId }: { summary: WeekSummary; personaId: PersonaId }) {
  const fillRate = summary.slots ? summary.filled / summary.slots : 0
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Shifts this week"
        icon={CalendarRangeIcon}
        value={num(summary.slots)}
        hint={summary.slots ? `${plural(summary.events, "event")} · ${plural(summary.venues, "venue")}` : "Nothing scheduled yet"}
      />
      <StatCard
        label="Filled"
        icon={UserCheckIcon}
        value={summary.slots ? pct(fillRate) : "–"}
        hint={summary.slots ? `${num(summary.filled)} of ${num(summary.slots)} slots confirmed` : "No slots to fill"}
      >
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", fillRate >= 1 ? "bg-success" : "bg-primary")}
            style={{ width: `${Math.min(100, fillRate * 100)}%` }}
          />
        </div>
      </StatCard>
      <StatCard
        label="Open shifts"
        icon={CircleDashedIcon}
        value={<span className={summary.open > 0 ? "text-warning-foreground dark:text-warning" : undefined}>{num(summary.open)}</span>}
        hint={summary.open > 0 ? "Still unfilled before shift start" : "Every upcoming slot is covered"}
      />
      <StatCard
        label={personaId === "supplier" ? "Est. billings" : "Est. labor cost"}
        icon={DollarSignIcon}
        value={money(summary.cost)}
        hint={summary.pendingCost > 0 ? `+${money(summary.pendingCost)} awaiting approval` : "Scheduled hours × bill rate"}
      />
    </div>
  )
}

interface DayProps {
  day: WeekDay
  today: ISODate
  now: Date
  onOpen: (block: EventBlock) => void
  onOpenDay: (date: ISODate) => void
}

function DayColumn({ day, today, now, onOpen, onOpenDay }: DayProps) {
  const isToday = day.date === today
  const past = day.date < today
  return (
    <div className={cn("relative flex min-h-72 min-w-0 flex-col bg-card", past && "bg-muted/40 dark:bg-muted/25")}>
      {isToday ? <span aria-hidden className="pointer-events-none absolute inset-0 z-10 ring-2 ring-primary/70 ring-inset" /> : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onOpenDay(day.date)}
            className="flex items-center justify-between gap-2 border-b px-3 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/60"
          >
            <span className="flex items-center gap-2">
              <span className={cn("text-xs font-medium tracking-wide text-muted-foreground uppercase", isToday && "text-primary")}>
                {formatDate(day.date, "EEE")}
              </span>
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular",
                  isToday ? "bg-primary text-primary-foreground" : past ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {formatDate(day.date, "d")}
              </span>
            </span>
            {day.slots > 0 ? <span className="text-[11px] text-muted-foreground tabular">{plural(day.slots, "shift")}</span> : null}
          </button>
        </TooltipTrigger>
        <TooltipContent>Open the {formatDate(day.date, "EEE, MMM d")} live board</TooltipContent>
      </Tooltip>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {day.blocks.length ? (
          day.blocks.map((block) => <EventBlockCard key={block.key} block={block} now={now} past={past} onOpen={() => onOpen(block)} />)
        ) : (
          <div className="flex h-16 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">No shifts</div>
        )}
      </div>
    </div>
  )
}

function AgendaDay({ day, today, now, onOpen, onOpenDay }: DayProps) {
  const isToday = day.date === today
  const past = day.date < today
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => onOpenDay(day.date)}
        className="flex items-center gap-3 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          className={cn(
            "flex size-9 shrink-0 flex-col items-center justify-center rounded-lg text-sm leading-none font-semibold tabular ring-1 ring-foreground/10",
            isToday ? "bg-primary text-primary-foreground ring-primary" : past ? "bg-muted text-muted-foreground" : "bg-card"
          )}
        >
          {formatDate(day.date, "d")}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className={cn("text-sm font-medium", past && "text-muted-foreground")}>{formatDate(day.date, "EEEE")}</span>
          <span className="text-xs text-muted-foreground">
            {formatDate(day.date, "MMM d")}
            {day.slots ? ` · ${plural(day.slots, "shift")}` : ""}
          </span>
        </span>
        {isToday ? (
          <Badge variant="secondary" className="ml-auto">
            Today
          </Badge>
        ) : null}
      </button>
      {day.blocks.length ? (
        <div className="flex flex-col gap-2 pl-12">
          {day.blocks.map((block) => (
            <EventBlockCard key={block.key} block={block} now={now} past={past} layout="row" onOpen={() => onOpen(block)} />
          ))}
        </div>
      ) : (
        <p className="pl-12 text-xs text-muted-foreground">No shifts</p>
      )}
    </div>
  )
}
