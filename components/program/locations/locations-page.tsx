"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { addDays } from "date-fns"
import { CalendarDaysIcon, MapPinIcon, PencilIcon, SearchIcon, SearchXIcon, StarIcon, XIcon } from "lucide-react"

import { DataTable, SortHeader, type ColumnDef } from "@/components/app/data-table"
import { VenueMark } from "@/components/app/identity"
import { EmptyState } from "@/components/app/misc"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import { Badge } from "@/components/ui/badge"
import { BlurFade } from "@/components/ui/blur-fade"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useData, usePersona } from "@/hooks/use-demo"
import { formatDate, parseLocal } from "@/lib/dates"
import { compactMoney, money, plural } from "@/lib/format"
import { venueInScope } from "@/lib/selectors"
import type { CostCenter, Venue } from "@/lib/types"
import { cn } from "@/lib/utils"

import {
  budgetTone,
  costCenterEditable,
  upcomingByVenue,
  weeklySpendByCostCenter,
  weekWindow,
  type CostCenterSpend,
  type WeekWindow,
} from "../program-data"
import { BudgetBar, RestrictedState, SectionHeading, useToday } from "../shared"
import { CostCenterSheet } from "./cost-center-sheet"

type WeekKey = "this" | "next"

interface CostCenterRow {
  cc: CostCenter
  venue?: Venue
  spend: CostCenterSpend
  ratio: number
}

export function LocationsPage() {
  const persona = usePersona()
  if (persona.id === "supplier") {
    return (
      <>
        <PageHeader title="Locations" />
        <RestrictedState
          title="Locations are managed by Compass"
          description="Check-in, parking and attire details are attached to every request you're staffing, so your Pros always have them."
          href="/requests"
          cta="View requests"
        />
      </>
    )
  }
  return <LocationsView key={persona.id} />
}

function weekLabelFor(week: WeekWindow): string {
  const start = parseLocal(week.start)
  const end = parseLocal(week.end)
  const sameMonth = start.getMonth() === end.getMonth()
  return `${formatDate(start, "MMM d")} – ${formatDate(end, sameMonth ? "d" : "MMM d")}`
}

function LocationsView() {
  const persona = usePersona()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ccParam = searchParams.get("cc")
  const venues = useData((d) => d.venues)
  const costCenters = useData((d) => d.costCenters)
  const requests = useData((d) => d.requests)
  const today = useToday()

  const [week, setWeek] = React.useState<WeekKey>("this")
  const [venueFilter, setVenueFilter] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [shownId, setShownId] = React.useState<string | null>(ccParam)

  const scopedVenues = React.useMemo(() => venues.filter((v) => venueInScope(v.id, persona)), [venues, persona])
  const venueMap = React.useMemo(() => new Map(venues.map((v) => [v.id, v])), [venues])
  const venueOrder = React.useMemo(() => new Map(venues.map((v, i) => [v.id, i])), [venues])
  const scopedCostCenters = React.useMemo(
    () =>
      costCenters
        .filter((c) => venueInScope(c.venueId, persona))
        .sort((a, b) => (venueOrder.get(a.venueId) ?? 0) - (venueOrder.get(b.venueId) ?? 0) || a.code.localeCompare(b.code)),
    [costCenters, persona, venueOrder]
  )

  const weeks = React.useMemo(() => {
    const thisWeek = weekWindow(parseLocal(today))
    const nextWeek = weekWindow(addDays(parseLocal(thisWeek.start), 7))
    return { this: thisWeek, next: nextWeek }
  }, [today])
  const spendThis = React.useMemo(() => weeklySpendByCostCenter(requests, weeks.this), [requests, weeks])
  const spendNext = React.useMemo(() => weeklySpendByCostCenter(requests, weeks.next), [requests, weeks])
  const spend = week === "this" ? spendThis : spendNext
  const upcoming = React.useMemo(() => upcomingByVenue(requests, today), [requests, today])
  const weekLabel = weekLabelFor(weeks[week])

  const venueSummaries = React.useMemo(
    () =>
      scopedVenues.map((venue) => {
        const ccs = scopedCostCenters.filter((c) => c.venueId === venue.id)
        let committed = 0
        let pending = 0
        let budget = 0
        for (const c of ccs) {
          const s = spendThis.get(c.id)
          committed += s?.committed ?? 0
          pending += s?.pending ?? 0
          if (c.active) budget += c.weeklyBudget
        }
        return { venue, costCenters: ccs.length, upcoming: upcoming.get(venue.id) ?? 0, committed, pending, budget }
      }),
    [scopedVenues, scopedCostCenters, spendThis, upcoming]
  )

  const rows = React.useMemo<CostCenterRow[]>(
    () =>
      scopedCostCenters.map((cc) => {
        const s = spend.get(cc.id) ?? { committed: 0, pending: 0, requests: 0 }
        return { cc, venue: venueMap.get(cc.venueId), spend: s, ratio: cc.weeklyBudget ? s.committed / cc.weeklyBudget : 0 }
      }),
    [scopedCostCenters, spend, venueMap]
  )
  const q = query.trim().toLowerCase()
  const filtered = React.useMemo(
    () =>
      rows.filter((r) => {
        if (venueFilter && r.cc.venueId !== venueFilter) return false
        if (!q) return true
        return [r.cc.code, r.cc.name, r.cc.glCode, r.cc.approverName, r.venue?.name ?? "", r.venue?.city ?? ""].some((s) =>
          s.toLowerCase().includes(q)
        )
      }),
    [rows, venueFilter, q]
  )

  const setCcInUrl = React.useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id) params.set("cc", id)
      else params.delete("cc")
      const qs = params.toString()
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, searchParams]
  )
  const openEditor = React.useCallback(
    (id: string) => {
      setShownId(id)
      setCcInUrl(id)
    },
    [setCcInUrl]
  )
  const onSheetOpenChange = (open: boolean) => {
    if (open) return
    setShownId(ccParam)
    setCcInUrl(null)
  }
  const displayId = ccParam ?? shownId
  const editing = displayId ? scopedCostCenters.find((c) => c.id === displayId) : undefined

  const totals = React.useMemo(() => {
    let budget = 0
    let committed = 0
    for (const r of filtered) {
      if (r.cc.active) budget += r.cc.weeklyBudget
      committed += r.spend.committed
    }
    return { budget, committed }
  }, [filtered])

  const columns = React.useMemo<ColumnDef<CostCenterRow, unknown>[]>(
    () => [
      {
        id: "code",
        accessorFn: (r) => r.cc.code,
        header: ({ column }) => <SortHeader column={column} title="Code" />,
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.cc.code}</span>,
      },
      {
        id: "name",
        accessorFn: (r) => r.cc.name,
        header: ({ column }) => <SortHeader column={column} title="Name" />,
        cell: ({ row }) => <span className="font-medium whitespace-nowrap">{row.original.cc.name}</span>,
      },
      {
        id: "venue",
        accessorFn: (r) => r.venue?.name ?? "",
        header: ({ column }) => <SortHeader column={column} title="Venue" />,
        cell: ({ row }) => (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <VenueMark venue={row.original.venue} size="xs" />
            <span className="text-sm">{row.original.venue?.shortName ?? "–"}</span>
          </span>
        ),
      },
      {
        id: "gl",
        accessorFn: (r) => r.cc.glCode,
        header: ({ column }) => <SortHeader column={column} title="GL code" />,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.cc.glCode}</span>,
      },
      {
        id: "budget",
        accessorFn: (r) => r.cc.weeklyBudget,
        sortDescFirst: true,
        header: ({ column }) => (
          <div className="flex justify-end">
            <SortHeader column={column} title="Budget / wk" className="-mr-1 ml-0" />
          </div>
        ),
        cell: ({ row }) => <div className="text-right text-sm tabular">{money(row.original.cc.weeklyBudget)}</div>,
      },
      {
        id: "committed",
        accessorFn: (r) => r.ratio,
        sortDescFirst: true,
        header: ({ column }) => <SortHeader column={column} title={week === "this" ? "Committed · this wk" : "Committed · next wk"} />,
        cell: ({ row }) => {
          const r = row.original
          const tone = budgetTone(r.ratio)
          return (
            <div className="flex min-w-36 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium tabular">{money(r.spend.committed)}</span>
                <span
                  className={cn(
                    "tabular",
                    tone === "over" && "font-medium text-destructive",
                    tone === "warning" && "font-medium text-warning-foreground dark:text-warning",
                    tone === "ok" && "text-muted-foreground"
                  )}
                >
                  {Math.round(r.ratio * 100)}%
                </span>
              </div>
              <BudgetBar committed={r.spend.committed} pending={r.spend.pending} budget={r.cc.weeklyBudget} />
              {r.spend.pending > 0 ? (
                <span className="text-xs text-muted-foreground tabular">+{compactMoney(r.spend.pending)} pending approval</span>
              ) : null}
            </div>
          )
        },
      },
      {
        id: "approver",
        accessorFn: (r) => r.cc.approverName,
        header: ({ column }) => <SortHeader column={column} title="Approver" />,
        cell: ({ row }) => <span className="text-sm whitespace-nowrap">{row.original.cc.approverName}</span>,
      },
      {
        id: "favorites",
        accessorFn: (r) => (r.cc.favoritesFirst ? 1 : 0),
        sortDescFirst: true,
        header: ({ column }) => <SortHeader column={column} title="Favorites" />,
        cell: ({ row }) =>
          row.original.cc.favoritesFirst ? (
            <span className="flex items-center gap-1.5 text-sm">
              <StarIcon className="size-3.5 fill-warning text-warning" aria-hidden />
              On
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <StarIcon className="size-3.5 text-muted-foreground/40" aria-hidden />
              Off
            </span>
          ),
      },
      {
        id: "active",
        accessorFn: (r) => (r.cc.active ? 1 : 0),
        header: ({ column }) => <SortHeader column={column} title="Status" />,
        cell: ({ row }) =>
          row.original.cc.active ? <StatusBadge tone="success">Active</StatusBadge> : <StatusBadge tone="muted">Inactive</StatusBadge>,
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) =>
          costCenterEditable(row.original.cc, persona) === "none" ? null : (
            <div className="flex justify-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEditor(row.original.cc.id)}
                    aria-label={`Edit ${row.original.cc.code} · ${row.original.cc.name}`}
                  >
                    <PencilIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit cost center</TooltipContent>
              </Tooltip>
            </div>
          ),
      },
    ],
    [week, persona, openEditor]
  )

  const filterVenue = venueFilter ? venueMap.get(venueFilter) : undefined

  return (
    <>
      <PageHeader
        title="Locations"
        actions={
          persona.id === "venue" ? (
            <Badge variant="outline" className="h-7 px-2.5 text-muted-foreground">
              {persona.org}
            </Badge>
          ) : undefined
        }
      />

      <section aria-labelledby="venues-heading" className="flex flex-col gap-3">
        <SectionHeading
          id="venues-heading"
          title="Venues"
          description={`${plural(scopedVenues.length, "venue")} · this week's committed spend`}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {venueSummaries.map((s, i) => (
            <BlurFade key={s.venue.id} delay={0.02 + Math.min(i, 8) * 0.025} className="h-full">
              <VenueCard
                {...s}
                selected={venueFilter === s.venue.id}
                onSelect={() => setVenueFilter((cur) => (cur === s.venue.id ? null : s.venue.id))}
              />
            </BlurFade>
          ))}
        </div>
      </section>

      <section aria-labelledby="cost-centers-heading" className="flex flex-col gap-3">
        <SectionHeading
          id="cost-centers-heading"
          title="Cost centers"
          description={
            <span className="tabular">
              {plural(filtered.length, "cost center")} · {money(totals.committed)} committed of {money(totals.budget)} weekly budget ·{" "}
              {weekLabel}
            </span>
          }
          action={
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={week}
              onValueChange={(v) => v && setWeek(v as WeekKey)}
              aria-label="Budget week"
            >
              <ToggleGroupItem value="this">This week</ToggleGroupItem>
              <ToggleGroupItem value="next">Next week</ToggleGroupItem>
            </ToggleGroup>
          }
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <InputGroup className="w-full sm:w-72">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search code, name, GL or approver"
              aria-label="Search cost centers"
            />
            {query ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" onClick={() => setQuery("")} aria-label="Clear search">
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
          {filterVenue ? (
            <Button variant="secondary" size="sm" onClick={() => setVenueFilter(null)} className="self-start sm:self-auto">
              <VenueMark venue={filterVenue} size="xs" />
              {filterVenue.shortName}
              <XIcon data-icon="inline-end" />
            </Button>
          ) : null}
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(r) => r.cc.id}
          onRowClick={(r) => openEditor(r.cc.id)}
          rowClassName={(r) => cn(!r.cc.active && "text-muted-foreground", r.cc.id === displayId && ccParam && "bg-primary/5 dark:bg-primary/10")}
          empty={
            <EmptyState
              icon={SearchXIcon}
              title="No cost centers match"
              description="Try a different search or clear the venue filter."
              className="m-4 border-0"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery("")
                    setVenueFilter(null)
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          }
        />
      </section>

      <CostCenterSheet
        costCenter={editing}
        open={!!ccParam}
        onOpenChange={onSheetOpenChange}
        spend={editing ? spendThis.get(editing.id) : undefined}
        weekLabel={`this week · ${weekLabelFor(weeks.this)}`}
      />
    </>
  )
}

function VenueCard({
  venue,
  costCenters,
  upcoming,
  committed,
  pending,
  budget,
  selected,
  onSelect,
}: {
  venue: Venue
  costCenters: number
  upcoming: number
  committed: number
  pending: number
  budget: number
  selected: boolean
  onSelect: () => void
}) {
  const ratio = budget > 0 ? committed / budget : 0
  const tone = budgetTone(ratio)
  return (
    <Card
      className={cn(
        "relative h-full gap-3 transition-shadow hover:ring-foreground/20 has-focus-visible:ring-2 has-focus-visible:ring-ring/50",
        selected && "ring-2 ring-primary/60 hover:ring-primary/60"
      )}
    >
      <CardHeader className="grid-cols-[auto_1fr] items-center gap-x-3">
        <VenueMark venue={venue} size="lg" className="row-span-2" />
        <CardTitle className="truncate">
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className="text-left outline-none after:absolute after:inset-0 after:content-['']"
          >
            {venue.name}
          </button>
        </CardTitle>
        <CardDescription className="truncate text-xs">
          {venue.city}, {venue.state}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{venue.brand}</Badge>
          <Badge variant="outline" className="text-muted-foreground">
            {venue.type}
          </Badge>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPinIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="text-pretty">{venue.address}</span>
        </p>
        <dl className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Cost centers</dt>
            <dd className="font-medium tabular">{costCenters}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Upcoming requests</dt>
            <dd className="font-medium tabular">{upcoming}</dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter className="mt-auto flex-col items-stretch gap-1.5 bg-transparent">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarDaysIcon className="size-3.5" aria-hidden />
            This week
          </span>
          <span className="tabular">
            <span className={cn("font-medium", tone === "over" ? "text-destructive" : "text-foreground")}>{money(committed)}</span>
            <span className="text-muted-foreground"> of {money(budget)}</span>
          </span>
        </div>
        <BudgetBar committed={committed} pending={pending} budget={budget} />
      </CardFooter>
    </Card>
  )
}