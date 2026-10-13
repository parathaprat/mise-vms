"use client"

import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
import { ClockIcon } from "lucide-react"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatDate } from "@/lib/dates"
import { num, pct } from "@/lib/format"

import { ChartCard, TooltipRow } from "./chart-card"
import {
  formatDuration,
  formatDurationLong,
  type CyclePoint,
  type CycleStats,
} from "./compute"

const chartConfig = {
  hours: { label: "Median" },
  pre: { label: "Median", color: "var(--chart-1)" },
  post: { label: "Median", color: "var(--chart-1)" },
} satisfies ChartConfig

const AUTO_APPROVE_HOURS = 72

function durationTicks(maxHours: number): number[] {
  const steps = [1, 2, 4, 6, 12, 24, 48, 72, 96, 168]
  const step = steps.find((s) => maxHours / s <= 4) ?? 168
  const top = Math.max(step, Math.ceil(maxHours / step) * step)
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
}

function axisDuration(value: number): string {
  if (value === 0) return "0"
  if (value < 48) return `${value}h`
  return `${Math.round((value / 24) * 10) / 10}d`
}

function AutoApproveLabel({
  viewBox,
}: {
  viewBox?: { x?: number; y?: number; width?: number }
}) {
  if (
    !viewBox ||
    typeof viewBox.x !== "number" ||
    typeof viewBox.y !== "number" ||
    typeof viewBox.width !== "number"
  ) {
    return null
  }
  return (
    <text
      x={viewBox.x + viewBox.width - 4}
      y={viewBox.y - 6}
      textAnchor="end"
      className="fill-muted-foreground text-[11px]"
    >
      72h auto-approve policy
    </text>
  )
}

export function CycleTimeCard({
  cycle,
  className,
}: {
  cycle: CycleStats
  className?: string
}) {
  const data = cycle.points
  const ticks = React.useMemo(() => {
    const max = cycle.points.reduce((m, p) => Math.max(m, p.hours), 0)
    return durationTicks(Math.max(1, max * 1.2))
  }, [cycle.points])
  const top = ticks[ticks.length - 1]
  const hasPost = cycle.postMedian !== null

  return (
    <ChartCard
      className={className}
      title="Approval cycle time"
      description="Median time from clock-out to timesheet approval, by week."
      empty={
        data.length === 0
          ? {
              icon: ClockIcon,
              title: "No approved timesheets yet",
              description:
                "Cycle times appear here as soon as timesheets in this scope are approved.",
            }
          : null
      }
      contentClassName="gap-5"
      footer={
        hasPost ? (
          <>
            {cycle.within24 !== null ? (
              <span>
                <span className="font-medium text-foreground tabular">
                  {pct(cycle.within24)}
                </span>{" "}
                of timesheets approved within 24 hours
              </span>
            ) : null}
            {cycle.autoShare !== null ? (
              <span>
                <span className="font-medium text-foreground tabular">
                  {pct(cycle.autoShare)}
                </span>{" "}
                cleared by the 72-hour auto-approve policy
              </span>
            ) : null}
            <span>
              {num(cycle.preCount + cycle.postCount)} timesheets measured
            </span>
          </>
        ) : null
      }
    >
      <div className="flex flex-col gap-0.5">
        <div className="font-heading text-3xl font-semibold tracking-tight tabular">
          {formatDurationLong(hasPost ? cycle.postMedian : cycle.preMedian)}
        </div>
        <p className="text-sm text-muted-foreground">Median approval time</p>
      </div>

      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-[260px] w-full"
      >
        <BarChart
          data={data}
          margin={{ top: 34, right: 8, left: 0, bottom: 0 }}
          barCategoryGap="28%"
        >
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
            width={36}
            domain={[0, top]}
            ticks={ticks}
            tickFormatter={(value: number) => axisDuration(value)}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={
              <ChartTooltipContent
                labelFormatter={(value) =>
                  `Week of ${formatDate(String(value), "MMM d")}`
                }
                formatter={(value, _name, item) => {
                  const point = item.payload as CyclePoint
                  return (
                    <div className="flex w-full flex-col gap-1">
                      <TooltipRow
                        color="var(--chart-1)"
                        label="Median"
                        value={formatDurationLong(Number(value))}
                      />
                      <TooltipRow label="Timesheets" value={num(point.count)} />
                    </div>
                  )
                }}
              />
            }
          />
          {top > AUTO_APPROVE_HOURS ? (
            <ReferenceLine
              y={AUTO_APPROVE_HOURS}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.5}
              strokeDasharray="4 4"
              label={AutoApproveLabel}
            />
          ) : null}
          <Bar
            dataKey="hours"
            fill="var(--chart-1)"
            radius={[6, 6, 0, 0]}
            maxBarSize={64}
          >
            <LabelList
              dataKey="hours"
              position="top"
              offset={8}
              className="fill-foreground font-medium"
              fontSize={11}
              formatter={(value) => formatDuration(Number(value))}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}
