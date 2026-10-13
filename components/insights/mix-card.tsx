"use client"

import * as React from "react"
import { Label, Pie, PieChart } from "recharts"
import { PieChartIcon } from "lucide-react"

import { SupplierMark, VenueMark } from "@/components/app/identity"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { hours, num, pct } from "@/lib/format"
import type { Lookups } from "@/lib/selectors"

import { ChartCard, TooltipRow } from "./chart-card"
import type { Insights, MixSlice } from "./compute"

const COPY: Record<Insights["mix"]["dimension"], string> = {
  supplier: "Supplier mix",
  venue: "Where your Pros work",
  costCenter: "Where your Pros work",
}

export function MixCard({ mix, lookups }: { mix: Insights["mix"]; lookups: Lookups }) {
  const config = React.useMemo<ChartConfig>(
    () => Object.fromEntries(mix.slices.map((s) => [s.key, { label: s.label, color: s.color }])),
    [mix.slices]
  )
  const title = COPY[mix.dimension]
  const leader = mix.slices[0]

  return (
    <ChartCard
      title={title}
      empty={
        mix.slices.length === 0
          ? {
              icon: PieChartIcon,
              title: "No hours worked yet",
              description: "The mix fills in as Pros clock out of shifts in this range.",
            }
          : null
      }
      contentClassName="justify-center"
      footer={
        leader && mix.dimension === "supplier" && mix.slices.length > 1 ? (
          <span>
            <span className="font-medium text-foreground">{leader.label}</span> worked{" "}
            <span className="tabular">{pct(leader.share)}</span> of hours across {mix.slices.length} suppliers.
          </span>
        ) : null
      }
    >
      <div className="grid items-center gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
        <ChartContainer config={config} className="mx-auto aspect-square h-[220px] w-full max-w-[220px]">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, _name, item) => {
                    const slice = item.payload as MixSlice
                    return (
                      <div className="flex w-full flex-col gap-1">
                        <TooltipRow color={slice.color} label={slice.label} value={hours(Number(value))} />
                        <TooltipRow label="Share" value={pct(slice.share, 1)} />
                      </div>
                    )
                  }}
                />
              }
            />
            <Pie
              data={mix.slices}
              dataKey="hours"
              nameKey="key"
              innerRadius={66}
              outerRadius={96}
              paddingAngle={mix.slices.length > 1 ? 2 : 0}
              cornerRadius={4}
              strokeWidth={0}
            >
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox) || typeof viewBox.cx !== "number" || typeof viewBox.cy !== "number") {
                    return null
                  }
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy - 6} className="fill-foreground font-heading text-2xl font-semibold">
                        {num(Math.round(mix.total))}
                      </tspan>
                      <tspan x={viewBox.cx} y={viewBox.cy + 16} className="fill-muted-foreground text-xs">
                        hours
                      </tspan>
                    </text>
                  )
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="flex flex-col gap-2.5">
          {mix.slices.map((slice) => (
            <li key={slice.key} className="flex items-center gap-3">
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: slice.color }} aria-hidden />
              <SliceMark slice={slice} dimension={mix.dimension} lookups={lookups} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{slice.label}</span>
                <span className="text-xs text-muted-foreground tabular">{hours(Math.round(slice.hours))}</span>
              </div>
              <span className="text-sm font-medium tabular">{pct(slice.share, slice.share < 0.1 ? 1 : 0)}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  )
}

function SliceMark({ slice, dimension, lookups }: { slice: MixSlice; dimension: Insights["mix"]["dimension"]; lookups: Lookups }) {
  if (dimension === "supplier") {
    const supplier = lookups.suppliers.get(slice.key)
    return supplier ? <SupplierMark supplier={supplier} size="sm" /> : null
  }
  if (dimension === "venue") {
    const venue = lookups.venues.get(slice.key)
    return venue ? <VenueMark venue={venue} size="sm" /> : null
  }
  return null
}
