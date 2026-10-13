"use client"

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts"
import { ChefHatIcon } from "lucide-react"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { hours, num, pct } from "@/lib/format"

import { ChartCard, TooltipRow } from "./chart-card"
import type { PositionPoint } from "./compute"

const chartConfig = {
  hours: { label: "Hours", color: "var(--chart-2)" },
} satisfies ChartConfig

function truncate(value: string, max = 24): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function PositionTick({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value?: unknown } }) {
  const label = String(payload?.value ?? "")
  return (
    <text x={x} y={y} dy="0.35em" textAnchor="end" className="fill-muted-foreground text-xs">
      <title>{label}</title>
      {truncate(label)}
    </text>
  )
}

export function PositionsCard({ positions, totalHours }: { positions: PositionPoint[]; totalHours: number }) {
  const shown = positions.reduce((s, p) => s + p.hours, 0)

  return (
    <ChartCard
      title="Hours by position"
      description={positions.length >= 8 ? "Top 8 positions by hours worked in range." : "Hours worked in range, by position."}
      empty={
        positions.length === 0
          ? {
              icon: ChefHatIcon,
              title: "No hours worked yet",
              description: "Positions appear once Pros clock out of shifts in this range.",
            }
          : null
      }
      footer={
        totalHours > 0 ? (
          <span>
            {positions.length >= 8 ? "Top 8 cover " : "Covers "}
            <span className="font-medium text-foreground tabular">{pct(shown / totalHours)}</span> of {num(Math.round(totalHours))}{" "}
            hours worked
          </span>
        ) : null
      }
    >
      <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
        <BarChart data={positions} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap="22%">
          <XAxis type="number" dataKey="hours" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            width={160}
            tickMargin={6}
            tick={PositionTick}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={
              <ChartTooltipContent
                formatter={(value, _name, item) => {
                  const point = item.payload as PositionPoint
                  return (
                    <div className="flex w-full flex-col gap-1">
                      <TooltipRow color="var(--color-hours)" label="Hours" value={hours(Number(value))} />
                      <TooltipRow label="Share of hours" value={pct(point.share, 1)} />
                    </div>
                  )
                }}
              />
            }
          />
          <Bar dataKey="hours" fill="var(--color-hours)" radius={4} maxBarSize={22}>
            <LabelList
              dataKey="hours"
              position="right"
              offset={8}
              className="fill-foreground"
              fontSize={11}
              formatter={(value) => `${num(Math.round(Number(value)))}h`}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}
