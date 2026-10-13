"use client"

import { usePathname, useSearchParams } from "next/navigation"
import * as React from "react"
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  DownloadIcon,
  FilePenLineIcon,
  FileSpreadsheetIcon,
  FilterXIcon,
  HandCoinsIcon,
  HourglassIcon,
  PlusIcon,
  ReceiptTextIcon,
  SearchIcon,
  SearchXIcon,
  TimerIcon,
  Undo2Icon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { VenueMark } from "@/components/app/identity"
import { EmptyState } from "@/components/app/misc"
import { PageHeader } from "@/components/app/page-header"
import { StatCard } from "@/components/app/stat-card"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNow, usePersona } from "@/hooks/use-demo"
import { formatDate, timeAgo } from "@/lib/dates"
import { hours as formatHours, money, num, plural, rate } from "@/lib/format"
import type { TipBatchStatus } from "@/lib/types"

import { BatchSheet } from "./batch-sheet"
import { TipComposer, type ComposerTarget } from "./tip-composer"
import { formatTurnaround, nextInvoiceRun, TIP_STATUS_LABEL } from "./tip-utils"
import { TipsTable } from "./tips-table"
import { EVENT_WINDOW_DAYS, useTipEvents, type TipEvent } from "./use-tip-events"
import { KPI_WINDOW_DAYS, TAB_STATUS, tipKpis, useTips, type TipKpis, type TipRow, type TipTab, type TipsModel } from "./use-tips"

const STATUS_TAB = Object.fromEntries(Object.entries(TAB_STATUS).map(([tab, status]) => [status, tab])) as Record<
  TipBatchStatus,
  Exclude<TipTab, "all">
>

export function TipsPage() {
  const persona = usePersona()
  return <TipsView key={persona.id} />
}

function TipsView() {
  const model = useTips()
  const now = useNow()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const batchParam = searchParams.get("batch")
  const wantsNew = searchParams.get("new") === "1"
  const { persona, rows, rowsById, venuesById, canCreate, canApprove, today } = model

  const [tab, setTab] = React.useState<TipTab>("all")
  const [query, setQuery] = React.useState("")
  const [venueFilter, setVenueFilter] = React.useState("all")
  const [composer, setComposer] = React.useState<ComposerTarget | null>(null)
  const [newParamSeen, setNewParamSeen] = React.useState(false)

  // `?new=1` opens the composer once per visit; the effect below strips it from the URL.
  if (wantsNew !== newParamSeen) {
    setNewParamSeen(wantsNew)
    if (wantsNew && canCreate) setComposer({ kind: "new" })
  }

  React.useEffect(() => {
    if (!wantsNew) return
    const params = new URLSearchParams(window.location.search)
    params.delete("new")
    const qs = params.toString()
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
    if (!canCreate) {
      toast("Venue managers enter tips", {
        id: "tips-new",
        description: "Switch to the venue persona to enter a tip batch.",
      })
    }
  }, [wantsNew, pathname, canCreate])

  const setBatchParam = React.useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(window.location.search)
      if (id) params.set("batch", id)
      else params.delete("batch")
      const qs = params.toString()
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname]
  )
  const openBatch = React.useCallback((id: string) => setBatchParam(id), [setBatchParam])
  const closeBatch = React.useCallback(() => setBatchParam(null), [setBatchParam])

  const selected = batchParam ? (rowsById.get(batchParam) ?? null) : null
  const missingId = batchParam && !selected ? batchParam : null

  const startNew = (eventKey?: string) => {
    closeBatch()
    setComposer({ kind: "new", eventKey })
  }
  const startEdit = (batchId: string) => {
    closeBatch()
    setComposer({ kind: "edit", batchId })
  }
  const closeComposer = () => {
    const returnTo = composer?.kind === "edit" ? composer.batchId : null
    setComposer(null)
    if (returnTo) openBatch(returnTo)
  }
  const showBatch = (batchId: string) => {
    setComposer(null)
    openBatch(batchId)
  }

  const venueOptions = React.useMemo(() => {
    const ids = new Set(rows.map((r) => r.batch.venueId))
    return [...ids].flatMap((id) => venuesById.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, venuesById])
  const q = query.trim().toLowerCase()
  const filtersActive = !!q || venueFilter !== "all"
  const filtered = React.useMemo(
    () => rows.filter((r) => (venueFilter === "all" || r.batch.venueId === venueFilter) && (!q || r.haystack.includes(q))),
    [rows, venueFilter, q]
  )
  const byTab = React.useMemo(() => {
    const map: Record<TipTab, TipRow[]> = { all: filtered, pending: [], drafts: [], approved: [], paid: [], returned: [] }
    for (const row of filtered) map[STATUS_TAB[row.batch.status]].push(row)
    return map
  }, [filtered])
  const kpis = React.useMemo(() => tipKpis(rows, today), [rows, today])
  const events = useTipEvents(model)
  const ready = React.useMemo(() => (canCreate ? events.filter((e) => !e.existing) : []), [canCreate, events])

  const clearFilters = () => {
    setQuery("")
    setVenueFilter("all")
  }

  const tabs: { value: TipTab; label: string }[] = [
    { value: "all", label: "All" },
    { value: "pending", label: canApprove ? "Needs approval" : "Pending" },
    ...(canCreate || kpis.drafts ? [{ value: "drafts" as const, label: "Drafts" }] : []),
    { value: "approved", label: "Approved" },
    { value: "paid", label: "Paid" },
    { value: "returned", label: "Returned" },
  ]

  return (
    <>
      <PageHeader
        title="Tips"
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv(byTab[tab], model)} disabled={!byTab[tab].length}>
              <DownloadIcon data-icon="inline-start" />
              Export CSV
            </Button>
            {canCreate ? (
              <Button onClick={() => startNew()}>
                <PlusIcon data-icon="inline-start" />
                New tip batch
              </Button>
            ) : null}
          </>
        }
      />

      {missingId ? (
        <Alert>
          <SearchXIcon />
          <AlertTitle>{missingId} isn&apos;t available</AlertTitle>
          <AlertDescription>It may have been deleted, or it isn&apos;t shared with {persona.org}.</AlertDescription>
          <AlertAction>
            <Button variant="ghost" size="xs" onClick={closeBatch}>
              Dismiss
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <TipsKpiCards kpis={kpis} model={model} now={now} />

      {ready.length ? <ReadyForTips events={ready} onEnter={startNew} /> : null}

      <TipsJourney turnaround={kpis.turnaroundHours} />

      <Tabs value={tab} onValueChange={(value) => setTab(value as TipTab)} className="gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label} <TabCount value={byTab[t.value].length} />
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="w-full sm:w-64">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Event, Pro, batch ID…"
                aria-label="Search tip batches"
              />
            </InputGroup>
            {venueOptions.length > 1 ? (
              <Select value={venueFilter} onValueChange={setVenueFilter}>
                <SelectTrigger className="w-full sm:w-48" aria-label="Filter by venue">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="end">
                  <SelectGroup>
                    <SelectItem value="all">All venues</SelectItem>
                    {venueOptions.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.shortName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
            {filtersActive ? (
              <Button variant="ghost" onClick={clearFilters}>
                <FilterXIcon data-icon="inline-start" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            <TipsTable
              model={model}
              rows={byTab[t.value]}
              onOpen={openBatch}
              empty={<TipsEmpty tab={t.value} model={model} filtered={filtersActive} onClear={clearFilters} onNew={() => startNew()} />}
            />
          </TabsContent>
        ))}
      </Tabs>

      <BatchSheet
        row={selected}
        model={model}
        onOpenChange={(open) => {
          if (!open) closeBatch()
        }}
        onEdit={startEdit}
        onDeleted={closeBatch}
      />
      {canCreate ? <TipComposer model={model} target={composer} onClose={closeComposer} onOpenBatch={showBatch} /> : null}
    </>
  )
}

function TabCount({ value }: { value: number }) {
  return <span className="text-xs text-muted-foreground tabular">{num(value)}</span>
}

function TipsKpiCards({ kpis, model, now }: { kpis: TipKpis; model: TipsModel; now: Date }) {
  const { persona, canApprove } = model
  const isSupplier = persona.id === "supplier"
  const { pending, recent, awaiting, turnaroundHours } = kpis
  const nextRun = formatDate(nextInvoiceRun(now), "EEE, MMM d")

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tips summary">
      <StatCard
        label={canApprove ? "Needs your approval" : isSupplier ? "Waiting on venues" : "Pending venue approval"}
        value={num(pending.count)}
        icon={HourglassIcon}
        hint={
          pending.count
            ? `${money(pending.amount, true)}${pending.oldest ? ` · oldest ${timeAgo(pending.oldest, now)}` : ""}`
            : canApprove
              ? "You're all caught up"
              : "Nothing waiting"
        }
      />
      <StatCard
        label={isSupplier ? `Your Pros' tips · ${KPI_WINDOW_DAYS} days` : `Tips approved · ${KPI_WINDOW_DAYS} days`}
        value={money(recent.total)}
        icon={HandCoinsIcon}
        hint={
          recent.events
            ? `${plural(recent.pros, "Pro")} · ${plural(recent.events, "event")}${recent.hours ? ` · ${rate(recent.total / recent.hours)} avg` : ""}`
            : "No approved tips in this window"
        }
      />
      <StatCard
        label={isSupplier ? "To be reimbursed" : "Billing at cost"}
        value={money(awaiting.amount)}
        icon={ReceiptTextIcon}
        hint={
          awaiting.count
            ? `${plural(awaiting.count, "approved batch", "approved batches")}${awaiting.invoiced ? ` · ${num(awaiting.invoiced)} invoiced` : ""} · next run ${nextRun}`
            : "Nothing waiting to bill"
        }
      />
      <StatCard
        label="Approval turnaround"
        value={turnaroundHours !== undefined ? formatTurnaround(turnaroundHours) : "–"}
        icon={TimerIcon}
        hint="Median from entry to approval"
      />
    </section>
  )
}

function ReadyForTips({ events, onEnter }: { events: TipEvent[]; onEnter: (eventKey?: string) => void }) {
  const visible = events.slice(0, 3)
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Ready for tips</CardTitle>
        <CardDescription>
          {plural(events.length, "event")} from the last {EVENT_WINDOW_DAYS} days {events.length === 1 ? "has" : "have"} hours on
          timesheets but no tip batch yet.
        </CardDescription>
        {events.length > visible.length ? (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => onEnter()}>
              See all
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {visible.map((event) => (
            <li key={event.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <VenueMark venue={event.venue} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{event.eventName}</span>
                <span className="truncate text-xs text-muted-foreground tabular">
                  {formatDate(event.date, "EEE, MMM d")} · {event.venue?.shortName ?? "Venue"} · {plural(event.pros, "Pro")} ·{" "}
                  {formatHours(event.hours)}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => onEnter(event.key)}>
                Enter tips
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

interface JourneyStep {
  icon: LucideIcon
  step: string
  detail: (turnaround?: number) => string
}

const JOURNEY: JourneyStep[] = [
  {
    icon: FileSpreadsheetIcon,
    step: "Enter",
    detail: () => "Hours come from timesheets, so a pool splits in one step.",
  },
  {
    icon: BadgeCheckIcon,
    step: "Approve",
    detail: (turnaround) =>
      turnaround !== undefined
        ? `One click from the inbox, ${formatTurnaround(turnaround)} median here.`
        : "One click from the inbox.",
  },
  {
    icon: HandCoinsIcon,
    step: "Pay Pros",
    detail: () => "Suppliers pay Pros the next business day after approval.",
  },
  {
    icon: ReceiptTextIcon,
    step: "Bill",
    detail: () => "At cost on the weekly invoice, tied to the batch, with no program fee.",
  },
]

function TipsJourney({ turnaround }: { turnaround?: number }) {
  const headingId = React.useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-sm font-medium">
          From the event to the Pro&apos;s pocket
        </h2>
        <p className="text-xs text-muted-foreground">How tips move in Mise</p>
      </div>
      <ol className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {JOURNEY.map((item, i) => {
          const Icon = item.icon
          return (
            <li key={item.step} className="flex flex-col gap-3 bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-foreground/80">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="text-sm font-medium">{item.step}</span>
                <span className="ml-auto text-xs text-muted-foreground tabular">
                  {i + 1}/{JOURNEY.length}
                </span>
              </div>
              <p className="text-xs text-pretty text-muted-foreground">{item.detail(turnaround)}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

interface TipsEmptyProps {
  tab: TipTab
  model: TipsModel
  filtered: boolean
  onClear: () => void
  onNew: () => void
}

function TipsEmpty({ tab, model, filtered, onClear, onNew }: TipsEmptyProps) {
  if (filtered) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title="No batches match"
        description="Try another search or venue."
        className="rounded-none border-0"
        action={
          <Button variant="outline" onClick={onClear}>
            <FilterXIcon data-icon="inline-start" />
            Clear filters
          </Button>
        }
      />
    )
  }
  const { persona, canCreate, canApprove } = model
  const isSupplier = persona.id === "supplier"
  const content: Record<TipTab, { icon: LucideIcon; title: string; description: string }> = {
    all: {
      icon: HandCoinsIcon,
      title: isSupplier ? "No tips for your Pros yet" : "No tip batches yet",
      description: canCreate
        ? "Enter tips for an event and Mise splits them by the hours on timesheets."
        : isSupplier
          ? "When a venue enters tips for your Pros, they show up here with the date to pay them."
          : "Tip batches from Compass venues show up here once they're entered.",
    },
    pending: {
      icon: BadgeCheckIcon,
      title: canApprove ? "Nothing waiting on you" : "Nothing pending approval",
      description: "Submitted batches wait here until a venue manager approves them.",
    },
    drafts: {
      icon: FilePenLineIcon,
      title: "No drafts",
      description: "Save a batch as a draft to finish it later.",
    },
    approved: {
      icon: HandCoinsIcon,
      title: "No approved batches",
      description: "Approved tips stay here until the supplier invoice that bills them is paid.",
    },
    paid: {
      icon: WalletIcon,
      title: "No paid batches yet",
      description: "Batches land here once the supplier invoice that bills them is paid.",
    },
    returned: {
      icon: Undo2Icon,
      title: "Nothing returned",
      description: "Batches sent back for changes show up here until they're resubmitted.",
    },
  }
  const { icon, title, description } = content[tab]
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      className="rounded-none border-0"
      action={
        tab === "all" && canCreate ? (
          <Button onClick={onNew}>
            <PlusIcon data-icon="inline-start" />
            New tip batch
          </Button>
        ) : undefined
      }
    />
  )
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function exportCsv(rows: TipRow[], model: TipsModel) {
  const isSupplier = model.persona.id === "supplier"
  const header = [
    "Batch",
    "Event",
    "Venue",
    "Event date",
    "Status",
    "Method",
    isSupplier ? "Your Pros" : "Pros",
    "Hours",
    isSupplier ? "Your Pros' tips" : "Total tips",
    "Entered by",
    "Entered at",
    "Approved by",
    "Approved at",
    "Invoices",
  ]
  const lines = rows.map((r) => [
    r.id,
    r.batch.eventName,
    r.venue?.name ?? r.batch.venueId,
    r.batch.date,
    TIP_STATUS_LABEL[r.batch.status],
    r.batch.method,
    r.lines.length,
    r.hours,
    r.total.toFixed(2),
    r.batch.createdBy,
    r.batch.createdAt,
    r.batch.approvedBy ?? "",
    r.batch.approvedAt ?? "",
    r.invoices.map((i) => i.id).join("; "),
  ])
  const csv = [header, ...lines].map((cols) => cols.map(csvCell).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = `mise-tips-${model.today}.csv`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  toast.success(`Exported ${plural(rows.length, "batch", "batches")}`, { description: link.download })
}
