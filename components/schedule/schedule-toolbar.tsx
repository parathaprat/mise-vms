"use client"

import * as React from "react"
import { addDays } from "date-fns"
import { CalendarIcon, CalendarRangeIcon, ChevronLeftIcon, ChevronRightIcon, LayersIcon, RadioIcon } from "lucide-react"

import { VenueMark } from "@/components/app/identity"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDate, parseLocal, toISODate, weekStartOf } from "@/lib/dates"
import type { ISODate, Venue } from "@/lib/types"

import { weekDates, type ScheduleMode } from "./schedule-data"
import type { ScheduleNavigation } from "./use-schedule-params"

interface ScheduleToolbarProps {
  view: ScheduleMode
  date: ISODate
  today: ISODate
  venueId: string
  venues: Venue[]
  onNavigate: (patch: ScheduleNavigation) => void
}

function weekLabel(date: ISODate): string {
  const days = weekDates(date)
  const first = parseLocal(days[0])
  const last = parseLocal(days[6])
  if (first.getMonth() === last.getMonth()) return `${formatDate(first, "MMM d")} – ${formatDate(last, "d")}`
  return `${formatDate(first, "MMM d")} – ${formatDate(last, "MMM d")}`
}

export function ScheduleToolbar({ view, date, today, venueId, venues, onNavigate }: ScheduleToolbarProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false)
  const isWeek = view === "week"
  const step = isWeek ? 7 : 1
  const unit = isWeek ? "week" : "day"
  const atToday = isWeek ? weekDates(date).includes(today) : date === today
  const selected = parseLocal(date)
  const weekStart = weekStartOf(selected)

  const shift = (direction: 1 | -1) => onNavigate({ date: toISODate(addDays(selected, direction * step)) })

  const switchView = (next: string) => {
    if (next !== "week" && next !== "live") return
    if (next === "live") onNavigate({ view: "live", date: weekDates(date).includes(today) ? null : date })
    else onNavigate({ view: "week" })
  }

  return (
    <>
      <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={view} onValueChange={switchView} aria-label="Schedule view">
        <ToggleGroupItem value="week" aria-label="Week view">
          <CalendarRangeIcon data-icon="inline-start" />
          Week
        </ToggleGroupItem>
        <ToggleGroupItem value="live" aria-label="Live board">
          <RadioIcon data-icon="inline-start" />
          Live
        </ToggleGroupItem>
      </ToggleGroup>

      <Select value={venueId} onValueChange={(value) => onNavigate({ venue: value })}>
        <SelectTrigger size="sm" className="w-44" aria-label="Filter by venue">
          <SelectValue placeholder="All venues" />
        </SelectTrigger>
        <SelectContent position="popper" align="end" className="min-w-52">
          <SelectGroup>
            <SelectItem value="all">
              <LayersIcon className="text-muted-foreground" />
              All venues
            </SelectItem>
          </SelectGroup>
          {venues.length > 0 ? (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Venues</SelectLabel>
                {venues.map((venue) => (
                  <SelectItem key={venue.id} value={venue.id}>
                    <VenueMark venue={venue} size="xs" />
                    {venue.shortName}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          ) : null}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onNavigate({ date: null })} disabled={atToday}>
          Today
        </Button>
        <ButtonGroup aria-label={`Change ${unit}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" onClick={() => shift(-1)} aria-label={`Previous ${unit}`}>
                <ChevronLeftIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous {unit}</TooltipContent>
          </Tooltip>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-36 justify-start tabular" aria-label="Pick a date">
                <CalendarIcon data-icon="inline-start" className="text-muted-foreground" />
                {isWeek ? weekLabel(date) : formatDate(date, "EEE, MMM d")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                required
                selected={selected}
                defaultMonth={selected}
                weekStartsOn={1}
                today={parseLocal(today)}
                modifiers={isWeek ? { selectedWeek: { from: weekStart, to: addDays(weekStart, 6) } } : undefined}
                modifiersClassNames={{ selectedWeek: "bg-accent first:rounded-l-(--cell-radius) last:rounded-r-(--cell-radius)" }}
                onSelect={(day) => {
                  onNavigate({ date: toISODate(day) })
                  setCalendarOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" onClick={() => shift(1)} aria-label={`Next ${unit}`}>
                <ChevronRightIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next {unit}</TooltipContent>
          </Tooltip>
        </ButtonGroup>
      </div>
    </>
  )
}
