"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ClockIcon,
  UserRoundCheckIcon,
  UserRoundXIcon,
  WalletIcon,
} from "lucide-react"

import { PageHeader } from "@/components/app/page-header"
import { StatCard } from "@/components/app/stat-card"
import { NumberTicker } from "@/components/ui/number-ticker"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useData, useLookups, useNow, usePersona } from "@/hooks/use-demo"
import { formatDate, toISODate, weekKey } from "@/lib/dates"
import { compactMoney, num, plural } from "@/lib/format"
import type { Persona } from "@/lib/types"

import {
  computeInsights,
  isRangeKey,
  RANGE_OPTIONS,
  venueOptionsFor,
  type Insights,
  type RangeKey,
  type VenueOption,
} from "./compute"
import { CycleTimeCard } from "./cycle-time-card"
import { FillCard } from "./fill-card"
import { MixCard } from "./mix-card"
import { PositionsCard } from "./positions-card"
import { QualityCard } from "./quality-card"
import { SpendCard } from "./spend-card"
import { TopTableCard } from "./top-table-card"
import { UnitPulseCard } from "./unit-pulse-card"

export function InsightsView() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const persona = usePersona()
  const lookups = useLookups()
  const now = useNow()
  const shifts = useData((d) => d.shifts)
  const timeEntries = useData((d) => d.timeEntries)
  const tipBatches = useData((d) => d.tipBatches)
  const invoices = useData((d) => d.invoices)
  const activities = useData((d) => d.activities)
  const rateCards = useData((d) => d.rateCards)
  const cutoverDate = useData((d) => d.cutoverDate)

  const today = toISODate(now)
  const rangeParam = searchParams.get("range")
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : "4w"
  const venueOptions = React.useMemo(
    () => venueOptionsFor(persona, lookups),
    [persona, lookups]
  )
  const venueParam = searchParams.get("venue")
  const venueId =
    venueParam && venueOptions.some((v) => v.id === venueParam)
      ? venueParam
      : "all"

  const setParams = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key)
        else next.set(key, value)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const insights = React.useMemo(
    () =>
      computeInsights({
        persona,
        lookups,
        shifts,
        timeEntries,
        tipBatches,
        invoices,
        activities,
        rateCards,
        cutoverDate,
        today,
        range,
        venueId,
      }),
    [
      persona,
      lookups,
      shifts,
      timeEntries,
      tipBatches,
      invoices,
      activities,
      rateCards,
      cutoverDate,
      today,
      range,
      venueId,
    ]
  )

  const currentWeek = weekKey(today)
  const isSupplier = persona.id === "supplier"
  const selectVenue = React.useCallback(
    (id: string) => {
      setParams({ venue: id === "all" ? null : id })
      window.scrollTo({ top: 0, behavior: "smooth" })
    },
    [setParams]
  )

  return (
    <>
      <PageHeader
        title="Insights"
        description="Spend, fill, quality and cycle times for your scope, updated live as shifts are worked."
        actions={
          <InsightsFilters
            persona={persona}
            insights={insights}
            range={range}
            onRangeChange={(value) =>
              setParams({ range: value === "4w" ? null : value })
            }
            venueId={venueId}
            venueOptions={venueOptions}
            onVenueChange={(value) =>
              setParams({ venue: value === "all" ? null : value })
            }
          />
        }
      />

      <KpiGrid insights={insights} isSupplier={isSupplier} />

      <CycleTimeCard cycle={insights.cycle} />

      <div className="grid gap-4 lg:grid-cols-2">
        {!isSupplier ? (
          <UnitPulseCard
            start={insights.range.start}
            end={insights.range.end}
            venueId={venueId}
          />
        ) : null}
        <SpendCard
          spend={insights.spend}
          isSupplier={isSupplier}
          currentWeek={currentWeek}
        />
        <FillCard fill={insights.fill} isSupplier={isSupplier} />
        <PositionsCard
          positions={insights.positions}
          totalHours={insights.kpis.hours}
        />
        <MixCard mix={insights.mix} lookups={lookups} />
        <QualityCard
          quality={insights.quality}
          noShowRate={insights.kpis.noShowRate}
          shifts={insights.kpis.shifts}
          currentWeek={currentWeek}
        />
        <TopTableCard
          top={insights.top}
          onSelectVenue={venueOptions.length > 1 ? selectVenue : undefined}
        />
      </div>
    </>
  )
}

interface InsightsFiltersProps {
  persona: Persona
  insights: Insights
  range: RangeKey
  onRangeChange: (value: RangeKey) => void
  venueId: string
  venueOptions: VenueOption[]
  onVenueChange: (value: string) => void
}

function InsightsFilters({
  persona,
  insights,
  range,
  onRangeChange,
  venueId,
  venueOptions,
  onVenueChange,
}: InsightsFiltersProps) {
  const groups = React.useMemo(() => {
    const map = new Map<string, VenueOption[]>()
    for (const option of venueOptions) {
      const list = map.get(option.brand)
      if (list) list.push(option)
      else map.set(option.brand, [option])
    }
    return [...map.entries()]
  }, [venueOptions])
  const allLabel =
    persona.id === "venue"
      ? `All my venues (${venueOptions.length})`
      : persona.id === "supplier"
        ? "All venues served"
        : "All venues"
  const { start, end, clipped, historyStart } = insights.range
  const caption = `${formatDate(start, "MMM d")} – ${formatDate(end, "MMM d")}`

  return (
    <>
      <span
        className="text-xs text-muted-foreground tabular"
        title={
          clipped
            ? `History starts ${formatDate(historyStart, "MMM d")}`
            : undefined
        }
      >
        {caption}
        {clipped ? " · all history" : null}
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={range}
        onValueChange={(value) => {
          if (isRangeKey(value)) onRangeChange(value)
        }}
        aria-label="Date range"
      >
        {RANGE_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="px-3"
            aria-label={`Last ${option.weeks} weeks`}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {venueOptions.length > 1 ? (
        <Select value={venueId} onValueChange={onVenueChange}>
          <SelectTrigger size="sm" className="w-56" aria-label="Venue">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectGroup>
              <SelectItem value="all">{allLabel}</SelectItem>
            </SelectGroup>
            {groups.map(([brand, options]) => (
              <SelectGroup key={brand}>
                <SelectLabel>{brand}</SelectLabel>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </>
  )
}

function KpiGrid({
  insights,
  isSupplier,
}: {
  insights: Insights
  isSupplier: boolean
}) {
  const { kpis } = insights

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label={isSupplier ? "Billed" : "Spend"}
        icon={WalletIcon}
        value={
          <>
            $<NumberTicker value={Math.round(kpis.spend)} />
          </>
        }
        hint={
          kpis.tips > 0
            ? `${compactMoney(kpis.labor)} labor · ${compactMoney(kpis.tips)} tips`
            : "Labor at bill rate"
        }
        trend={kpis.trends.spend}
      />
      <StatCard
        label="Hours worked"
        icon={ClockIcon}
        value={
          <>
            <NumberTicker value={Math.round(kpis.hours)} />h
          </>
        }
        hint={`${plural(kpis.shifts, "shift")} · ${plural(kpis.pros, "Pro")}`}
        trend={kpis.trends.hours}
      />
      <StatCard
        label="Fill rate"
        icon={UserRoundCheckIcon}
        value={
          kpis.fillRate !== null ? (
            <>
              <NumberTicker
                value={Math.round(kpis.fillRate * 1000) / 10}
                decimalPlaces={1}
              />
              %
            </>
          ) : (
            "–"
          )
        }
        hint={
          kpis.slots > 0
            ? `${num(kpis.filled)} of ${plural(kpis.slots, "slot")} filled`
            : "No slots in range yet"
        }
        trend={kpis.trends.fill}
      />
      <StatCard
        label="No-show rate"
        icon={UserRoundXIcon}
        value={
          kpis.noShowRate !== null ? (
            <>
              <NumberTicker
                value={Math.round(kpis.noShowRate * 1000) / 10}
                decimalPlaces={1}
              />
              %
            </>
          ) : (
            "–"
          )
        }
        hint={
          kpis.worked > 0
            ? `${plural(kpis.noShows, "no-show")} in ${plural(kpis.worked, "shift")}${kpis.backfilled > 0 ? ` · ${num(kpis.backfilled)} backfilled` : ""}`
            : "No shifts worked yet"
        }
        trend={kpis.trends.noShow}
      />
    </div>
  )
}
