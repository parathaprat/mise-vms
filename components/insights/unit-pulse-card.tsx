"use client"

import { ArrowDownIcon, ArrowUpIcon, GaugeIcon } from "lucide-react"

import { StatusBadge } from "@/components/app/status-badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useData, usePersona } from "@/hooks/use-demo"
import { weekStartOf } from "@/lib/dates"
import { compactMoney, money, num, pct } from "@/lib/format"
import { hashString } from "@/lib/random"
import { venueInScope } from "@/lib/selectors"

interface UnitPulseCardProps {
  start: string
  end: string
  venueId: string
}

interface PulseRow {
  week: string
  spend: number
  volume: number
  perHundred: number
}

export function UnitPulseCard({
  start,
  end,
  venueId,
}: UnitPulseCardProps) {
  const data = useData((value) => value)
  const persona = usePersona()
  const requestById = new Map(
    data.requests.map((request) => [request.id, request])
  )
  const venueById = new Map(data.venues.map((venue) => [venue.id, venue]))
  const rows = new Map<string, PulseRow>()

  for (const entry of data.timeEntries) {
    if (entry.date < start || entry.date > end) continue
    const request = requestById.get(entry.requestId)
    if (!request) continue
    if (venueId !== "all" && request.venueId !== venueId) continue
    if (!venueInScope(request.venueId, persona)) continue
    const venue = venueById.get(request.venueId)
    if (!venue) continue

    const week = weekStartOf(new Date(`${entry.date}T12:00:00`))
      .toISOString()
      .slice(0, 10)
    const hours = entry.regularHours + entry.overtimeHours
    const base =
      venue.type === "Campus"
        ? 13
        : venue.type === "Arena"
          ? 18
          : venue.type === "Ballpark" || venue.type === "Stadium"
            ? 20
            : 16
    const variation =
      0.86 + (hashString(`${request.venueId}|${entry.date}`) % 29) / 100
    const volume = Math.round(hours * base * variation)
    const current = rows.get(week) ?? {
      week,
      spend: 0,
      volume: 0,
      perHundred: 0,
    }
    current.spend += entry.amount
    current.volume += volume
    rows.set(week, current)
  }

  const series = [...rows.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((row) => ({
      ...row,
      perHundred: row.volume ? (row.spend / row.volume) * 100 : 0,
    }))
  const current = series.at(-1)
  const previous = series.slice(0, -1).filter((row) => row.perHundred > 0)
  const baseline = previous.length
    ? previous.reduce((sum, row) => sum + row.perHundred, 0) / previous.length
    : current?.perHundred ?? 0
  const variance =
    current && baseline ? (current.perHundred - baseline) / baseline : 0
  const onTrack = variance <= 0.08
  const max = Math.max(...series.map((row) => row.perHundred), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GaugeIcon className="size-4" aria-hidden />
          Unit pulse
        </CardTitle>
        <CardDescription>
          Temp labor against guest activity, compared with this unit&apos;s own
          recent weeks.
        </CardDescription>
        <CardAction>
          <StatusBadge tone={onTrack ? "success" : "warning"}>
            {onTrack ? "On track" : "Needs a look"}
          </StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {current ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">
                  Labor per 100 guests
                </span>
                <span className="font-heading text-3xl font-semibold tracking-tight tabular">
                  {money(current.perHundred)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {variance > 0 ? (
                  <ArrowUpIcon className="size-4 text-warning" aria-hidden />
                ) : (
                  <ArrowDownIcon className="size-4 text-success" aria-hidden />
                )}
                <span className="font-medium tabular">
                  {pct(Math.abs(variance))} {variance > 0 ? "above" : "below"}{" "}
                  baseline
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {series.slice(-4).map((row) => (
                <div
                  key={row.week}
                  className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs"
                >
                  <span className="text-muted-foreground tabular">
                    {new Date(`${row.week}T12:00:00`).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric" }
                    )}
                  </span>
                  <Progress
                    value={(row.perHundred / max) * 100}
                    aria-label={`${money(row.perHundred)} labor per 100 guests`}
                  />
                  <span className="font-medium tabular">
                    {money(row.perHundred)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              This week: {num(current.volume)} guest transactions ·{" "}
              {compactMoney(current.spend)} temp labor. Demo POS feed.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No completed work in this range yet.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
