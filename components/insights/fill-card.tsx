"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"
import { UsersRoundIcon } from "lucide-react"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatDate } from "@/lib/dates"
import { num, pct } from "@/lib/format"

import { ChartCard, LegendSwatch, TooltipRow } from "./chart-card"
import { FILL_TARGET, type FillPoint, type Insights } from "./compute"

const chartConfig = {
  rate: { label: "Fill rate", color: "var(--chart-3)" },
} satisfies ChartConfig

function CutoverTick({ viewBox }: { viewBox?: { x?: number; y?: number } }) {
  if (!viewBox || typeof viewBox.x !== "number" || typeof viewBox.y !== "number") return null
  return (
    <text x={viewBox.x + 4} y={viewBox.y + 12} className="fill-primary text-[11px] font-medium">
      Mise
    </text>
  )
}

export function FillCard({ fill }: { fill: Insights["fill"] }) {
  const gradientId = `fill-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const measured = fill.points.filter((p) => p.rate !== null)
  const min = measured.reduce((m, p) => Math.min(m, p.rate ?? 100), 100)
  const rawFloor = Math.max(0, Math.min(80, min - 4))
  const step = 100 - rawFloor <= 25 ? 5 : 10
  const floor = Math.floor(rawFloor / step) * step
  const ticks = Array.from({ length: Math.round((100 - floor) / step) + 1 }, (_, i) => floor + i * step)
  const below = measured.filter((p) => (p.rate ?? 0) < FILL_TARGET * 100).length

  return (
    <ChartCard
      title="Fill rate"
      contentClassName="gap-3"
      action={
        fill.rate !== null ? (
          <div className="flex flex-col items-end">
            <span className="font-heading text-lg font-semibold tabular">{pct(fill.rate, 1)}</span>
            <span className="text-xs text-muted-foreground">in range</span>
          </div>
        ) : null
      }
      empty={
        measured.length === 0
          ? {
              icon: UsersRoundIcon,
              title: "No shifts in this range",
              description: "Fill rate is measured once shifts in this scope reach their start date.",
            }
          : null
      }
      footer={
        <>
          <span>
            {below === 0
              ? `At or above the ${Math.round(FILL_TARGET * 100)}% target every week`
              : `Below the ${Math.round(FILL_TARGET * 100)}% target in ${below} of ${measured.length} ${measured.length === 1 ? "week" : "weeks"}`}
          </span>
          {fill.laggard ? (
            <span>
              Lowest: <span className="font-medium text-foreground">{fill.laggard.label}</span> at{" "}
              <span className="tabular">{pct(fill.laggard.rate)}</span> · {num(fill.laggard.open)} unfilled{" "}
              {fill.laggard.open === 1 ? "slot" : "slots"}
            </span>
          ) : null}
        </>
      }
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
        <AreaChart data={fill.points} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-rate)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-rate)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="week"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value: string) => formatDate(value, "MMM d")}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            domain={[floor, 100]}
            ticks={ticks}
            tickFormatter={(value: number) => `${value}%`}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--border)" }}
            content={
              <ChartTooltipContent
                labelFormatter={(_value, payload) => {
                  const point = payload?.[0]?.payload as FillPoint | undefined
                  if (!point) return null
                  return `Week of ${formatDate(point.week, "MMM d")}${point.current ? " · so far" : ""}`
                }}
                formatter={(value, _name, item) => {
                  const point = item.payload as FillPoint
                  return (
                    <div className="flex w-full flex-col gap-1">
                      <TooltipRow color="var(--color-rate)" label="Fill rate" value={`${Number(value).toFixed(1)}%`} />
                      <TooltipRow label="Slots filled" value={`${num(point.filled)} of ${num(point.slots)}`} />
                    </div>
                  )
                }}
              />
            }
          />
          <ReferenceLine y={FILL_TARGET * 100} stroke="var(--success)" strokeDasharray="4 4" strokeOpacity={0.8} />
          {fill.markerWeek ? (
            <ReferenceLine x={fill.markerWeek} stroke="var(--primary)" strokeOpacity={0.5} strokeDasharray="3 3" label={CutoverTick} />
          ) : null}
          <Area
            dataKey="rate"
            type="monotone"
            stroke="var(--color-rate)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            connectNulls
            dot={{ r: 3, fill: "var(--card)", stroke: "var(--color-rate)", strokeWidth: 2 }}
            activeDot={{ r: 4.5, fill: "var(--color-rate)", stroke: "var(--card)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ChartContainer>
      <div className="flex flex-wrap items-center gap-4">
        <LegendSwatch color="var(--chart-3)" label="Fill rate by week" />
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-4 border-t-2 border-dashed border-success" aria-hidden />
          {Math.round(FILL_TARGET * 100)}% target
        </span>
      </div>
    </ChartCard>
  )
}
