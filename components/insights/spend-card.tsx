"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { WalletIcon } from "lucide-react"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatDate } from "@/lib/dates"
import { compactMoney, money } from "@/lib/format"

import { ChartCard, TooltipRow } from "./chart-card"
import type { Insights, SpendRow } from "./compute"

interface SpendCardProps {
  spend: Insights["spend"]
  isSupplier: boolean
  currentWeek: string
}

export function SpendCard({ spend, isSupplier, currentWeek }: SpendCardProps) {
  const config = React.useMemo<ChartConfig>(
    () => Object.fromEntries(spend.series.map((s) => [s.key, { label: s.label, color: s.color }])),
    [spend.series]
  )
  const by = spend.dimension === "venue" ? "venue" : "cost center"
  const lastKey = spend.series[spend.series.length - 1]?.key

  return (
    <ChartCard
      title={isSupplier ? "Weekly billings" : "Weekly spend"}
      description={`Labor at bill rate plus approved tips, by ${by}.`}
      action={
        spend.total > 0 ? (
          <div className="flex flex-col items-end">
            <span className="font-heading text-lg font-semibold tabular">{compactMoney(spend.total)}</span>
            <span className="text-xs text-muted-foreground tabular">
              {spend.tips > 0 ? `incl. ${compactMoney(spend.tips)} tips` : "in range"}
            </span>
          </div>
        ) : null
      }
      empty={
        spend.total <= 0
          ? {
              icon: WalletIcon,
              title: "No spend in this range",
              description: "Spend appears as soon as Pros clock out of shifts in this scope.",
            }
          : null
      }
    >
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <BarChart data={spend.rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="week"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value: string) => formatDate(value, "MMM d")}
          />
          <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(value: number) => compactMoney(value)} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={
              <ChartTooltipContent
                className="min-w-48"
                labelFormatter={(_value, payload) => {
                  const row = payload?.[0]?.payload as SpendRow | undefined
                  if (!row) return null
                  return (
                    <div className="flex items-center justify-between gap-4">
                      <span>
                        Week of {formatDate(row.week, "MMM d")}
                        {row.week === currentWeek ? <span className="font-normal text-muted-foreground"> · to date</span> : null}
                      </span>
                      <span className="tabular">{money(row.total)}</span>
                    </div>
                  )
                }}
                formatter={(value, name, item) => (
                  <TooltipRow
                    color={item.color}
                    label={config[String(name)]?.label ?? String(name)}
                    value={money(Number(value))}
                  />
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
          {spend.series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="spend"
              fill={`var(--color-${s.key})`}
              radius={s.key === lastKey ? [4, 4, 0, 0] : 0}
              maxBarSize={56}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}
