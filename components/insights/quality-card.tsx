"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ShieldCheckIcon } from "lucide-react"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatDate } from "@/lib/dates"
import { num, pct } from "@/lib/format"

import { ChartCard, TooltipRow } from "./chart-card"
import type { Insights, QualityPoint } from "./compute"

const chartConfig = {
  noShows: { label: "No-shows", color: "var(--chart-5)" },
  late: { label: "Late arrivals", color: "var(--chart-4)" },
  disputes: { label: "Disputes", color: "var(--chart-2)" },
} satisfies ChartConfig

const SERIES = ["noShows", "late", "disputes"] as const

interface QualityCardProps {
  quality: Insights["quality"]
  noShowRate: number | null
  shifts: number
  currentWeek: string
}

export function QualityCard({ quality, noShowRate, shifts, currentWeek }: QualityCardProps) {
  const { totals } = quality
  const events = totals.noShows + totals.late + totals.disputes
  const hasWeeks = quality.points.length > 0 && shifts > 0

  return (
    <ChartCard
      title="Quality"
      empty={
        !hasWeeks
          ? {
              icon: ShieldCheckIcon,
              title: "Nothing to measure yet",
              description: "Quality signals appear once shifts in this range have been worked.",
            }
          : null
      }
      footer={
        hasWeeks ? (
          <>
            <span>
              <span className="font-medium text-foreground tabular">{num(totals.noShows)}</span> no-shows
              {noShowRate !== null ? <span className="tabular"> ({pct(noShowRate, 1)} of shifts)</span> : null}
            </span>
            <span>
              <span className="font-medium text-foreground tabular">{num(totals.late)}</span> late arrivals
              {shifts > 0 ? <span className="tabular"> ({pct(totals.late / shifts, 1)})</span> : null}
            </span>
            <span>
              <span className="font-medium text-foreground tabular">{num(totals.disputes)}</span> disputes
            </span>
          </>
        ) : null
      }
    >
      {events === 0 ? (
        <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-lg bg-success/8 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-success/12 text-success">
            <ShieldCheckIcon className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-medium">A clean run</p>
          <p className="max-w-64 text-xs text-muted-foreground">No no-shows, late arrivals or disputes in this range.</p>
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
          <LineChart data={quality.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value: string) => formatDate(value, "MMM d")}
            />
            <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
            <ChartTooltip
              cursor={{ stroke: "var(--border)" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_value, payload) => {
                    const point = payload?.[0]?.payload as QualityPoint | undefined
                    if (!point) return null
                    return `Week of ${formatDate(point.week, "MMM d")}${point.week === currentWeek ? " · so far" : ""}`
                  }}
                  formatter={(value, name, item) => (
                    <TooltipRow
                      color={item.color}
                      label={chartConfig[name as (typeof SERIES)[number]]?.label ?? String(name)}
                      value={num(Number(value))}
                    />
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {SERIES.map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--card)", stroke: `var(--color-${key})`, strokeWidth: 2 }}
                activeDot={{ r: 4.5 }}
              />
            ))}
          </LineChart>
        </ChartContainer>
      )}
    </ChartCard>
  )
}
