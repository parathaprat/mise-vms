"use client"

import * as React from "react"
import {
  ClockIcon,
  DollarSignIcon,
  FlaskConicalIcon,
  GitPullRequestArrowIcon,
  Grid3x3Icon,
  LockIcon,
  PencilIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from "lucide-react"

import { DataTable, SortHeader, type ColumnDef } from "@/components/app/data-table"
import { EmptyState, TimeAgo } from "@/components/app/misc"
import { PageHeader } from "@/components/app/page-header"
import { StatCard } from "@/components/app/stat-card"
import { StatusBadge } from "@/components/app/status-badge"
import { BlurFade } from "@/components/ui/blur-fade"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useData, usePersona, usePolicies } from "@/hooks/use-demo"
import { money, plural } from "@/lib/format"
import { METROS, PROGRAM_NAME } from "@/lib/reference"
import { venueInScope } from "@/lib/selectors"
import type { ChangeRequest, Position, PositionCategory, RateCardEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

import { CATEGORIES } from "../program-data"
import { PersonChip, shortDate, useDialogState, useToday } from "../shared"
import { FeeWaterfall } from "./fee-waterfall"
import { RateEditDialog, type RateEditTarget } from "./rate-edit-dialog"
import {
  cardBreakdown,
  categoryDotStyle,
  isPublishedRateActivity,
  markupLabel,
  metroLabel,
  prettyRateText,
  type RateBreakdown,
} from "./rate-format"
import { RateSimulator } from "./rate-simulator"
import { RequestRevisionDialog, RevisionDecisionDialog, type DecisionTarget, type RevisionTarget } from "./revision-dialogs"
import { MyRevisions, PendingRevisions, RateActivity, RecentDecisions } from "./revision-lists"

const SAMPLE_CARD_ID = "rc-grill-cook-chicago"

type CategoryFilter = "all" | PositionCategory

interface RateRow extends RateBreakdown {
  id: string
  card: RateCardEntry
  title: string
  category: PositionCategory
  aliases: string[]
  marketLabel: string
  marketState: string
  pendingMine?: ChangeRequest
  pendingCount: number
}

export function RatesPage() {
  const persona = usePersona()
  return <RatesView key={persona.id} />
}

function RatesView() {
  const persona = usePersona()
  const policies = usePolicies()
  const rateCards = useData((d) => d.rateCards)
  const positions = useData((d) => d.positions)
  const venues = useData((d) => d.venues)
  const changes = useData((d) => d.changeRequests)
  const activities = useData((d) => d.activities)
  const today = useToday()

  const isProgram = persona.id === "program"
  const isSupplier = persona.id === "supplier"
  const isVenue = persona.id === "venue"

  const myMetros = React.useMemo(
    () => new Set(venues.filter((v) => persona.venueIds !== "all" && venueInScope(v.id, persona)).map((v) => v.metro)),
    [venues, persona]
  )
  const homeMetro = isVenue ? [...myMetros][0] : undefined
  const defaultMarket = homeMetro ?? "all"
  const [market, setMarket] = React.useState<string>(defaultMarket)
  const [category, setCategory] = React.useState<CategoryFilter>("all")
  const [query, setQuery] = React.useState("")
  const [focusId, setFocusId] = React.useState(() =>
    homeMetro && homeMetro !== "chicago" ? `rc-grill-cook-${homeMetro}` : SAMPLE_CARD_ID
  )
  const waterfallRef = React.useRef<HTMLDivElement>(null)

  const edit = useDialogState<RateEditTarget>()
  const revise = useDialogState<RevisionTarget>()
  const decide = useDialogState<DecisionTarget>()
  const showEdit = edit.show
  const showRevise = revise.show
  const showDecide = decide.show

  const canEdit = React.useCallback(
    (metro: string) => isProgram || (isVenue && !policies.rateChangesRequireProgram && myMetros.has(metro)),
    [isProgram, isVenue, policies.rateChangesRequireProgram, myMetros]
  )
  const venueCanEdit = isVenue && !policies.rateChangesRequireProgram && myMetros.size > 0

  const positionMap = React.useMemo(() => new Map<string, Position>(positions.map((p) => [p.id, p])), [positions])
  const cardMap = React.useMemo(() => new Map(rateCards.map((r) => [r.id, r])), [rateCards])

  const pendingAll = React.useMemo(
    () =>
      changes
        .filter((c) => c.type === "Rate revision" && c.status === "Pending")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [changes]
  )
  const pendingVisible = React.useMemo(() => {
    if (isProgram) return pendingAll
    if (isSupplier) return pendingAll.filter((c) => c.requestedBy === persona.name)
    return pendingAll.filter((c) => myMetros.has(cardMap.get(c.rateCardId ?? "")?.metro ?? ""))
  }, [isProgram, isSupplier, pendingAll, persona, myMetros, cardMap])

  const rows = React.useMemo<RateRow[]>(() => {
    const pendingByCard = new Map<string, ChangeRequest[]>()
    for (const c of pendingAll) {
      if (!c.rateCardId) continue
      pendingByCard.set(c.rateCardId, [...(pendingByCard.get(c.rateCardId) ?? []), c])
    }
    return rateCards.map((card) => {
      const position = positionMap.get(card.positionId)
      const metro = METROS.find((m) => m.id === card.metro)
      const pending = pendingByCard.get(card.id) ?? []
      return {
        ...cardBreakdown(card, policies.msaFeePct, policies.overtimeMultiplier),
        id: card.id,
        card,
        title: position?.title ?? card.positionId,
        category: position?.category ?? "Support",
        aliases: position?.aliases ?? [],
        marketLabel: metro?.label ?? card.metro,
        marketState: metro?.state ?? "",
        pendingMine: pending.find((c) => c.requestedBy === persona.name),
        pendingCount: pending.length,
      }
    })
  }, [rateCards, positionMap, policies.msaFeePct, policies.overtimeMultiplier, pendingAll, persona])

  const q = query.trim().toLowerCase()
  const filtered = React.useMemo(
    () =>
      rows.filter((r) => {
        if (market !== "all" && r.card.metro !== market) return false
        if (category !== "all" && r.category !== category) return false
        if (!q) return true
        return (
          r.title.toLowerCase().includes(q) ||
          r.marketLabel.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.aliases.some((a) => a.includes(q))
        )
      }),
    [rows, market, category, q]
  )
  const filtersActive = market !== defaultMarket || category !== "all" || q !== ""

  const focusCard = cardMap.get(focusId) ?? rateCards[0]
  const focusPosition = focusCard ? positionMap.get(focusCard.positionId) : undefined

  const focusRow = React.useCallback((row: RateRow) => {
    setFocusId(row.id)
    waterfallRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [])

  const changeMarket = (next: string) => {
    setMarket(next)
    if (next === "all") return
    const pos = cardMap.get(focusId)?.positionId
    const match = rateCards.find((r) => r.positionId === pos && r.metro === next)
    if (match) setFocusId(match.id)
  }

  const clearFilters = () => {
    setMarket(defaultMarket)
    setCategory("all")
    setQuery("")
  }

  // KPIs ---------------------------------------------------------------------
  const coveredPairs = React.useMemo(() => new Set(rateCards.map((r) => `${r.positionId}|${r.metro}`)).size, [rateCards])
  const possiblePairs = positions.length * METROS.length
  const avg = React.useMemo(() => {
    if (filtered.length === 0) return null
    const bill = filtered.reduce((s, r) => s + r.bill, 0) / filtered.length
    const pay = filtered.reduce((s, r) => s + r.pay, 0) / filtered.length
    return { bill, pay }
  }, [filtered])
  const lastChange = React.useMemo(() => {
    let latest: (typeof activities)[number] | undefined
    for (const a of activities) {
      if (a.kind !== "rate" || !isPublishedRateActivity(a.text)) continue
      if (!latest || a.at > latest.at) latest = a
    }
    return latest
  }, [activities])
  const oldestPending = pendingVisible.length ? pendingVisible[pendingVisible.length - 1] : undefined

  // Columns ------------------------------------------------------------------
  const columns = React.useMemo<ColumnDef<RateRow, unknown>[]>(() => {
    const numeric = (
      id: string,
      title: string,
      get: (r: RateRow) => number,
      render: (r: RateRow) => React.ReactNode
    ): ColumnDef<RateRow, unknown> => ({
      id,
      accessorFn: get,
      sortDescFirst: true,
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortHeader column={column} title={title} className="-mr-1 ml-0" />
        </div>
      ),
      cell: ({ row }) => <div className="text-right text-sm whitespace-nowrap tabular">{render(row.original)}</div>,
    })

    const cols: ColumnDef<RateRow, unknown>[] = [
      {
        id: "position",
        accessorFn: (r) => r.title,
        header: ({ column }) => <SortHeader column={column} title="Position" />,
        cell: ({ row }) => (
          <div className="flex min-w-48 items-center gap-2">
            <span className="font-medium whitespace-nowrap">{row.original.title}</span>
            <Badge variant="outline" className="text-muted-foreground">
              <span className="hue-solid size-1.5 rounded-full" style={categoryDotStyle(row.original.category)} aria-hidden />
              {row.original.category}
            </Badge>
          </div>
        ),
      },
      {
        id: "market",
        accessorFn: (r) => r.marketLabel,
        header: ({ column }) => <SortHeader column={column} title="Market" />,
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap" title={`${row.original.marketLabel}, ${row.original.marketState}`}>
            {row.original.marketLabel}
          </span>
        ),
      },
      numeric("pay", "Pay", (r) => r.pay, (r) => money(r.pay, true)),
      numeric("markup", "Markup", (r) => r.markupPct, (r) => <span className="text-muted-foreground">{markupLabel(r.markupPct)}</span>),
      numeric("bill", "Bill", (r) => r.bill, (r) => <span className="font-semibold">{money(r.bill, true)}</span>),
      numeric("fee", `Fee ${policies.msaFeePct}%`, (r) => r.fee, (r) => <span className="text-muted-foreground">−{money(r.fee, true)}</span>),
      numeric("net", "Supplier net", (r) => r.net, (r) => money(r.net, true)),
      numeric("ot", `OT ${policies.overtimeMultiplier}×`, (r) => r.ot, (r) => <span className="text-muted-foreground">{money(r.ot, true)}</span>),
      {
        id: "version",
        accessorFn: (r) => r.card.version,
        sortDescFirst: true,
        header: ({ column }) => <SortHeader column={column} title="Ver." />,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="font-mono text-muted-foreground">
              v{row.original.card.version}
            </Badge>
            {row.original.pendingCount > 0 && !isSupplier ? (
              <span className="size-1.5 rounded-full bg-warning" title="Revision pending" aria-label="Revision pending" />
            ) : null}
          </div>
        ),
      },
      {
        id: "effective",
        accessorFn: (r) => r.card.effectiveFrom,
        sortDescFirst: true,
        header: ({ column }) => <SortHeader column={column} title="Effective" />,
        cell: ({ row }) =>
          row.original.card.effectiveFrom === today ? (
            <StatusBadge tone="primary">Today</StatusBadge>
          ) : (
            <span className="text-sm whitespace-nowrap text-muted-foreground">{shortDate(row.original.card.effectiveFrom, today)}</span>
          ),
      },
      {
        id: "updatedBy",
        accessorFn: (r) => r.card.updatedBy,
        header: ({ column }) => <SortHeader column={column} title="By" />,
        cell: ({ row }) => <PersonChip name={row.original.card.updatedBy} prefix="Updated by" />,
      },
    ]

    if (isProgram || venueCanEdit || isSupplier) {
      cols.push({
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const r = row.original
          if (canEdit(r.card.metro)) {
            return (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => showEdit({ cardId: r.id })}>
                  <PencilIcon data-icon="inline-start" />
                  Edit
                </Button>
              </div>
            )
          }
          if (isSupplier) {
            return (
              <div className="flex justify-end">
                {r.pendingMine ? (
                  <StatusBadge tone="warning" className="whitespace-nowrap">
                    Pending
                  </StatusBadge>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => showRevise({ cardId: r.id })}
                        aria-label={`Request a rate revision for ${r.title} in ${r.marketLabel}`}
                      >
                        <GitPullRequestArrowIcon data-icon="inline-start" />
                        Revise
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Request a rate revision</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )
          }
          return null
        },
      })
    }
    return cols
  }, [policies.msaFeePct, policies.overtimeMultiplier, isProgram, isSupplier, venueCanEdit, canEdit, showEdit, showRevise, today])

  const marketScopeLabel = market === "all" ? "all markets" : metroLabel(market)

  return (
    <>
      <PageHeader
        title="Rate cards"
        actions={
          <>
            {isVenue && !venueCanEdit ? (
              <Badge variant="outline" className="h-7 gap-1.5 px-2.5 text-muted-foreground">
                <LockIcon />
                View only
              </Badge>
            ) : null}
            <Button variant="outline" asChild>
              <a href="#simulator">
                <FlaskConicalIcon data-icon="inline-start" />
                {isSupplier ? "Model a revision" : "Rate simulator"}
              </a>
            </Button>
            {isProgram && pendingAll.length > 0 ? (
              <Button asChild>
                <a href="#revisions">
                  <GitPullRequestArrowIcon data-icon="inline-start" />
                  Review {plural(pendingAll.length, "revision")}
                </a>
              </Button>
            ) : null}
          </>
        }
      />

      <BlurFade delay={0.02}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Positions × markets"
            icon={Grid3x3Icon}
            value={coveredPairs.toLocaleString()}
            hint={`${positions.length} positions × ${METROS.length} markets · ${coveredPairs >= possiblePairs ? "full coverage" : `${Math.round((coveredPairs / Math.max(1, possiblePairs)) * 100)}% covered`}`}
          />
          <StatCard
            label="Avg bill rate"
            icon={DollarSignIcon}
            value={
              avg ? (
                <>
                  {money(avg.bill, true)}
                  <span className="text-base font-normal text-muted-foreground">/hr</span>
                </>
              ) : (
                "–"
              )
            }
            hint={avg ? `Pay avg ${money(avg.pay, true)} · ${plural(filtered.length, "card")} in ${marketScopeLabel}` : "No cards match the filters"}
          />
          <StatCard
            label={isSupplier ? "Your pending revisions" : "Pending revisions"}
            icon={GitPullRequestArrowIcon}
            value={pendingVisible.length}
            href={isProgram && pendingVisible.length > 0 ? "#revisions" : undefined}
            hint={
              pendingVisible.length === 0 ? (
                "All caught up"
              ) : isProgram && oldestPending ? (
                <>
                  Oldest waiting <TimeAgo value={oldestPending.createdAt} />
                </>
              ) : (
                `Awaiting the ${PROGRAM_NAME} program office`
              )
            }
          />
          <StatCard
            label="Last change"
            icon={ClockIcon}
            value={lastChange ? <TimeAgo value={lastChange.at} /> : "–"}
            hint={lastChange ? <span className="line-clamp-1">{prettyRateText(lastChange.text)}</span> : "No published changes yet"}
          />
        </div>
      </BlurFade>

      {isProgram && pendingAll.length > 0 ? (
        <BlurFade delay={0.05}>
          <PendingRevisions pending={pendingAll} onDecide={(changeId, approve) => showDecide({ changeId, approve })} />
        </BlurFade>
      ) : null}

      {focusCard ? (
        <BlurFade delay={0.08}>
          <div ref={waterfallRef} className="scroll-mt-20">
            <FeeWaterfall
              card={focusCard}
              position={focusPosition}
              feePct={policies.msaFeePct}
              overtimeMultiplier={policies.overtimeMultiplier}
            />
          </div>
        </BlurFade>
      ) : null}

      <section aria-labelledby="rate-table-heading" className="flex flex-col gap-3">
        <h2 id="rate-table-heading" className="sr-only">
          Rate cards
        </h2>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={market} onValueChange={changeMarket}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Market">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All markets</SelectItem>
                  {METROS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                      <span className="text-muted-foreground">{m.state}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <div className="-mx-1 overflow-x-auto px-1 pb-1 sm:pb-0">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={category}
                onValueChange={(v) => v && setCategory(v as CategoryFilter)}
                aria-label="Position category"
              >
                <ToggleGroupItem value="all">All</ToggleGroupItem>
                {CATEGORIES.map((c) => (
                  <ToggleGroupItem key={c} value={c}>
                    {c}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs whitespace-nowrap text-muted-foreground tabular xl:inline">
              {filtered.length === rows.length ? plural(rows.length, "card") : `${filtered.length} of ${rows.length} cards`}
            </span>
            <InputGroup className="w-full lg:w-64">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search positions or markets"
                aria-label="Search rate cards"
              />
              {query ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-xs" onClick={() => setQuery("")} aria-label="Clear search">
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(r) => r.id}
          onRowClick={focusRow}
          pageSize={15}
          dense
          rowClassName={(r) => cn(r.id === focusCard?.id && "bg-primary/5 hover:bg-primary/8 dark:bg-primary/10")}
          empty={
            <EmptyState
              icon={SearchXIcon}
              title="No rate cards match"
              description="Try another market or category, or clear the search."
              className="m-4 border-0"
              action={
                filtersActive ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <RateSimulator
          className="lg:col-span-3"
          defaultMetro={homeMetro ?? "chicago"}
          onEdit={isProgram || venueCanEdit ? (cardId, pay) => showEdit({ cardId, initialPay: pay }) : undefined}
          canEdit={canEdit}
          onRevise={isSupplier ? (cardId, pay) => showRevise({ cardId, initialPay: pay }) : undefined}
        />
        <div className="flex flex-col gap-4 lg:col-span-2">
          {isProgram ? <RecentDecisions /> : null}
          {isSupplier ? <MyRevisions /> : null}
          <RateActivity publishedOnly={!isProgram} />
        </div>
      </div>

      <RateEditDialog target={edit.value} open={edit.open} nonce={edit.nonce} onOpenChange={edit.onOpenChange} onPublished={setFocusId} />
      <RequestRevisionDialog target={revise.value} open={revise.open} nonce={revise.nonce} onOpenChange={revise.onOpenChange} />
      <RevisionDecisionDialog target={decide.value} open={decide.open} nonce={decide.nonce} onOpenChange={decide.onOpenChange} />
    </>
  )
}
