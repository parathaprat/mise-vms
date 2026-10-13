"use client"

import { usePathname, useSearchParams } from "next/navigation"
import * as React from "react"
import { subDays } from "date-fns"
import {
  CheckCheckIcon,
  ClipboardListIcon,
  DownloadIcon,
  FlagIcon,
  ListChecksIcon,
  MessageSquareWarningIcon,
  ReceiptTextIcon,
  SearchIcon,
  SearchXIcon,
  ShieldCheckIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DataTable, type RowSelectionState, type SortingState } from "@/components/app/data-table"
import { EmptyState } from "@/components/app/misc"
import { PageHeader } from "@/components/app/page-header"
import { StatCard } from "@/components/app/stat-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useData, useLookups, useNow, usePersona, usePolicies } from "@/hooks/use-demo"
import { formatDateList, parseLocal, toISODate } from "@/lib/dates"
import { hours, money, num, pct, plural, workerName } from "@/lib/format"
import { entryInScope } from "@/lib/selectors"
import type { Persona, PersonaId, Venue } from "@/lib/types"
import { cn } from "@/lib/utils"

import { approveEntriesWithToast, downloadCsv } from "./actions"
import { AdjustHoursDialog } from "./adjust-dialog"
import { BulkBar } from "./bulk-bar"
import { DisputeDialog } from "./dispute-dialog"
import { useEntryColumns } from "./entry-columns"
import { EntrySheet } from "./entry-sheet"
import {
  TIMESHEET_TABS,
  buildEntryRow,
  countByTab,
  entriesCsv,
  inTab,
  isClean,
  isPolicyApproval,
  isSelectableRow,
  parseTab,
  totalsOf,
  type DateRange,
  type EntryAction,
  type EntryRow,
  type TimesheetTab,
} from "./model"
import { ReassignDialog } from "./reassign-dialog"
import { RespondDialog } from "./respond-dialog"

const RANGES: { value: DateRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
]

const DEFAULT_RANGE: DateRange = "30d"
const INITIAL_SORT: SortingState = [{ id: "date", desc: true }]
const getRowId = (row: EntryRow) => row.id

type DialogKind = Exclude<EntryAction, "approve">
type DialogsState = { active: DialogKind | null } & Record<DialogKind, { id: string; key: number }>

const INITIAL_DIALOGS: DialogsState = {
  active: null,
  adjust: { id: "", key: 0 },
  dispute: { id: "", key: 0 },
  reassign: { id: "", key: 0 },
  respond: { id: "", key: 0 },
}

export function TimesheetsPage() {
  const persona = usePersona()
  return <TimesheetsWorkspace key={persona.id} persona={persona} />
}

function useTimesheetParams() {
  const searchParams = useSearchParams()
  return {
    tab: parseTab(searchParams.get("tab")),
    requestId: searchParams.get("request"),
    entryId: searchParams.get("entry"),
    query: searchParams.toString(),
  }
}

function useToday(): string {
  return toISODate(useNow())
}

function TimesheetsWorkspace({ persona }: { persona: Persona }) {
  const { tab, requestId, entryId, query } = useTimesheetParams()
  const pathname = usePathname()

  const lookups = useLookups()
  const entries = useData((d) => d.timeEntries)
  const policies = usePolicies()
  const now = useNow()
  const today = useToday()

  const [search, setSearch] = React.useState("")
  const [venueId, setVenueId] = React.useState("all")
  const [range, setRange] = React.useState<DateRange>(DEFAULT_RANGE)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [sheet, setSheet] = React.useState(() => ({ id: entryId ?? "", open: !!entryId }))
  const [dialogs, setDialogs] = React.useState<DialogsState>(INITIAL_DIALOGS)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const replaceParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(window.location.search)
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) params.delete(key)
        else params.set(key, value)
      }
      const qs = params.toString()
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname]
  )

  const scoped = React.useMemo(
    () => entries.filter((e) => entryInScope(e, lookups, persona)).map((e) => buildEntryRow(e, lookups)),
    [entries, lookups, persona]
  )
  const rowsById = React.useMemo(() => new Map(scoped.map((r) => [r.id, r])), [scoped])

  const venueOptions = React.useMemo(() => {
    const map = new Map<string, Venue>()
    for (const r of scoped) if (r.venue) map.set(r.venue.id, r.venue)
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [scoped])

  const request = requestId ? lookups.requests.get(requestId) : undefined
  const requestPosition = request ? lookups.positions.get(request.positionId) : undefined
  const effectiveRange: DateRange = requestId ? "all" : range
  const effectiveVenue = requestId ? "all" : venueId
  const q = search.trim().toLowerCase()
  const cutoff = effectiveRange === "all" ? null : toISODate(subDays(parseLocal(today), effectiveRange === "7d" ? 6 : 29))
  const filtersActive = !!q || (!requestId && (venueId !== "all" || range !== DEFAULT_RANGE))

  const filtered = React.useMemo(
    () =>
      scoped.filter((r) => {
        if (requestId && r.entry.requestId !== requestId) return false
        if (effectiveVenue !== "all" && r.request?.venueId !== effectiveVenue) return false
        if (cutoff && r.entry.date < cutoff) return false
        if (q && !r.search.includes(q)) return false
        return true
      }),
    [scoped, requestId, effectiveVenue, cutoff, q]
  )
  const counts = React.useMemo(() => countByTab(filtered), [filtered])
  const tabRows = React.useMemo(() => filtered.filter((r) => inTab(r.entry, tab)), [filtered, tab])
  const cleanRows = React.useMemo(() => filtered.filter((r) => isClean(r.entry)), [filtered])

  const selectedRows = React.useMemo(() => tabRows.filter((r) => rowSelection[r.id] && isSelectableRow(r)), [tabRows, rowSelection])
  const effectiveSelection = React.useMemo<RowSelectionState>(
    () => Object.fromEntries(selectedRows.map((r) => [r.id, true])),
    [selectedRows]
  )
  const selectedTotals = totalsOf(selectedRows)

  const stats = React.useMemo(() => {
    const pending = scoped.filter((r) => r.entry.status === "Pending")
    const disputed = scoped.filter((r) => r.entry.status === "Disputed")
    const since = `${toISODate(subDays(parseLocal(today), 6))}T00:00`
    const approved = scoped.filter(
      (r) => !!r.entry.approvedAt && r.entry.approvedAt >= since && r.entry.status !== "Pending" && r.entry.status !== "Disputed"
    )
    return {
      pending: totalsOf(pending),
      flagged: pending.filter((r) => r.entry.anomalies.length > 0).length,
      disputed: totalsOf(disputed),
      awaitingSupplier: disputed.filter((r) => !r.entry.dispute?.response).length,
      approved: totalsOf(approved),
      autoShare: approved.length ? approved.filter((r) => isPolicyApproval(r.entry.approvedBy)).length / approved.length : 0,
    }
  }, [scoped, today])

  const openSheet = React.useCallback(
    (row: EntryRow) => {
      setSheet({ id: row.id, open: true })
      replaceParams({ entry: row.id })
    },
    [replaceParams]
  )

  const closeSheet = React.useCallback(() => {
    setSheet((s) => ({ ...s, open: false }))
    replaceParams({ entry: null })
  }, [replaceParams])

  const openDialog = React.useCallback((kind: DialogKind, row: EntryRow) => {
    setDialogs((d) => ({ ...d, active: kind, [kind]: { id: row.id, key: d[kind].key + 1 } }))
  }, [])

  const handleAction = React.useCallback(
    (action: EntryAction, row: EntryRow) => {
      if (action === "approve") {
        const who = row.worker ? workerName(row.worker) : "the Pro"
        approveEntriesWithToast([row.id], () => (row.entry.status === "Disputed" ? `Dispute resolved: ${who}'s hours approved` : `Approved ${who}'s hours`))
        return
      }
      openDialog(action, row)
    },
    [openDialog]
  )

  const closeDialog = React.useCallback((open: boolean) => {
    if (!open) setDialogs((d) => ({ ...d, active: null }))
  }, [])

  const columns = useEntryColumns({ persona: persona.id, onOpen: openSheet, onAction: handleAction })

  const selectTab = (value: string) => {
    const next = parseTab(value)
    replaceParams({ tab: next === "review" ? null : next })
  }

  const clearFilters = () => {
    setSearch("")
    setVenueId("all")
    setRange(DEFAULT_RANGE)
  }

  const tabHref = (t: TimesheetTab) => {
    const params = new URLSearchParams(query)
    params.delete("entry")
    if (t === "review") params.delete("tab")
    else params.set("tab", t)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  const approveSelected = () => {
    approveEntriesWithToast(selectedRows.map((r) => r.id))
    setRowSelection({})
  }

  const approveClean = () => {
    approveEntriesWithToast(
      cleanRows.map((r) => r.id),
      (n) => `Approved ${plural(n, "clean timesheet")}`
    )
    setConfirmOpen(false)
    setRowSelection({})
  }

  const exportCsv = () => {
    if (tabRows.length === 0) {
      toast.info("Nothing to export", { description: "This view has no timesheets." })
      return
    }
    downloadCsv(`mise-timesheets-${tab}-${today}.csv`, entriesCsv(tabRows))
    toast.success(`Exported ${plural(tabRows.length, "timesheet")}`, { description: "Legal names, rates and flags included." })
  }

  const cleanTotals = totalsOf(cleanRows)
  const isVenue = persona.id === "venue"

  return (
    <>
      <PageHeader
        title="Timesheets"
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <DownloadIcon data-icon="inline-start" />
              Export CSV
            </Button>
            {isVenue ? (
              <Button onClick={() => (cleanRows.length > 10 ? setConfirmOpen(true) : approveClean())} disabled={cleanRows.length === 0}>
                <ListChecksIcon data-icon="inline-start" />
                Approve all clean ({num(cleanRows.length)})
              </Button>
            ) : null}
          </>
        }
      />

      {isVenue ? (
        <Alert>
          <ShieldCheckIcon />
          <AlertTitle>Confirm hours within 24 hours of each shift</AlertTitle>
          <AlertDescription>
            Clean timesheets auto-approve after {policies.timesheetAutoApproveHours} hours. Flagged ones never auto-approve. They wait for your
            decision.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={persona.id === "supplier" ? "Awaiting venue" : "Needs review"}
          icon={ClipboardListIcon}
          value={num(stats.pending.count)}
          hint={`${money(stats.pending.amount)} · ${hours(stats.pending.hours)}`}
          href={tabHref("review")}
        />
        <StatCard
          label="Flagged"
          icon={FlagIcon}
          value={num(stats.flagged)}
          hint={isVenue ? "Never auto-approve: need you" : "Exceptions under venue review"}
          href={tabHref("flagged")}
        />
        <StatCard
          label="Disputed"
          icon={MessageSquareWarningIcon}
          value={num(stats.disputed.count)}
          hint={
            persona.id === "supplier"
              ? `${num(stats.awaitingSupplier)} need your reply`
              : `${num(stats.awaitingSupplier)} awaiting supplier · ${money(stats.disputed.amount)} on hold`
          }
          href={tabHref("disputed")}
        />
        <StatCard
          label="Approved · 7 days"
          icon={CheckCheckIcon}
          value={hours(stats.approved.hours)}
          hint={`${money(stats.approved.amount)} · ${pct(stats.autoShare)} auto-approved`}
          href={tabHref("approved")}
        />
      </div>

      <Tabs value={tab} onValueChange={selectTab} className="gap-4">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList variant="line">
            {TIMESHEET_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                <span
                  className={cn(
                    "rounded-full bg-muted px-1.5 text-[11px] leading-4 font-medium text-muted-foreground tabular",
                    isVenue && counts[t.value] > 0 && (t.value === "flagged" || t.value === "disputed") && "bg-destructive/10 text-destructive"
                  )}
                >
                  {num(counts[t.value])}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <InputGroup className="w-full sm:w-72">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Pro, event, request…"
                aria-label="Search timesheets"
              />
              {search ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setSearch("")}>
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
            {!requestId && venueOptions.length > 1 ? (
              <Select value={venueId} onValueChange={setVenueId}>
                <SelectTrigger className="w-full sm:w-52" aria-label="Venue">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All venues</SelectItem>
                  {venueOptions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {requestId ? (
              <div className="flex h-8 max-w-full items-center gap-1.5 rounded-lg border bg-muted/40 pr-1 pl-2.5 text-sm">
                <span className="shrink-0 text-muted-foreground">Request</span>
                <span className="truncate font-medium">
                  {request ? [requestPosition?.title, request.eventName].filter(Boolean).join(" · ") || request.id : requestId}
                </span>
                {request ? <span className="hidden shrink-0 text-muted-foreground sm:inline">· {formatDateList(request.dates, now)}</span> : null}
                <Button variant="ghost" size="icon-xs" aria-label="Clear request filter" onClick={() => replaceParams({ request: null })}>
                  <XIcon />
                </Button>
              </div>
            ) : null}
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Reset filters
              </Button>
            ) : null}
          </div>
          {!requestId ? (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={range}
              onValueChange={(v) => {
                if (v) setRange(v as DateRange)
              }}
              aria-label="Date range"
            >
              {RANGES.map((r) => (
                <ToggleGroupItem key={r.value} value={r.value} className="px-3">
                  {r.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
        </div>

        <TabsContent value={tab} className="flex flex-col gap-4">
          <DataTable
            key={tab}
            columns={columns}
            data={tabRows}
            getRowId={getRowId}
            onRowClick={openSheet}
            enableSelection={isVenue}
            rowSelection={effectiveSelection}
            onRowSelectionChange={setRowSelection}
            canSelectRow={isSelectableRow}
            initialSorting={INITIAL_SORT}
            pageSize={25}
            rowClassName={(r) => (sheet.open && r.id === sheet.id ? "bg-muted/60" : undefined)}
            empty={
              <TimesheetsEmpty
                tab={tab}
                persona={persona.id}
                noMatches={filtered.length === 0 && (filtersActive || !!requestId)}
                onReset={requestId ? () => replaceParams({ request: null }) : clearFilters}
                resetLabel={requestId ? "Show all requests" : "Reset filters"}
              />
            }
          />
          {isVenue ? <BulkBar totals={selectedTotals} onApprove={approveSelected} onClear={() => setRowSelection({})} /> : null}
        </TabsContent>
      </Tabs>

      <EntrySheet
        row={rowsById.get(sheet.id)}
        open={sheet.open}
        onOpenChange={(open) => {
          if (!open) closeSheet()
        }}
        persona={persona.id}
        onAction={handleAction}
      />
      <AdjustHoursDialog
        key={`adjust-${dialogs.adjust.key}`}
        row={rowsById.get(dialogs.adjust.id)}
        open={dialogs.active === "adjust"}
        onOpenChange={closeDialog}
      />
      <DisputeDialog
        key={`dispute-${dialogs.dispute.key}`}
        row={rowsById.get(dialogs.dispute.id)}
        open={dialogs.active === "dispute"}
        onOpenChange={closeDialog}
        onSwitch={openDialog}
      />
      <ReassignDialog
        key={`reassign-${dialogs.reassign.key}`}
        row={rowsById.get(dialogs.reassign.id)}
        open={dialogs.active === "reassign"}
        onOpenChange={closeDialog}
      />
      <RespondDialog
        key={`respond-${dialogs.respond.key}`}
        row={rowsById.get(dialogs.respond.id)}
        open={dialogs.active === "respond"}
        onOpenChange={closeDialog}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {plural(cleanTotals.count, "clean timesheet")}?</AlertDialogTitle>
            <AlertDialogDescription>
              {hours(cleanTotals.hours)} · {money(cleanTotals.amount, true)}. Every one matches its schedule, with no flags or disputes. Approved hours
              roll into the next weekly invoice automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={approveClean}>Approve {num(cleanTotals.count)}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface EmptyCopy {
  icon: LucideIcon
  title: string
  description: string
}

function emptyCopy(tab: TimesheetTab, persona: PersonaId): EmptyCopy {
  switch (tab) {
    case "review":
      if (persona === "venue") {
        return {
          icon: CheckCheckIcon,
          title: "You're all caught up",
          description: "Every timesheet in view is approved. New hours land here the moment a shift ends.",
        }
      }
      return {
        icon: CheckCheckIcon,
        title: "Nothing waiting on venues",
        description: persona === "supplier" ? "Every hour your Pros worked in this range has been approved." : "Venues have confirmed every hour in this range.",
      }
    case "flagged":
      return {
        icon: ShieldCheckIcon,
        title: "No flagged hours",
        description: "Missing clock-outs, long breaks and early departures land here. They never auto-approve.",
      }
    case "disputed":
      return {
        icon: MessageSquareWarningIcon,
        title: "No open disputes",
        description:
          persona === "supplier"
            ? "If a venue questions your Pros' hours, it shows up here for your reply."
            : "Disputed hours stay off invoices until the supplier replies and the venue resolves them.",
      }
    case "approved":
      return {
        icon: CheckCheckIcon,
        title: "Nothing approved in this range",
        description: "Approved hours roll into the next weekly invoice automatically.",
      }
    case "invoiced":
      return {
        icon: ReceiptTextIcon,
        title: "Nothing invoiced in this range",
        description: "Approved hours are invoiced weekly, nobody has to submit anything.",
      }
    default:
      return {
        icon: ClipboardListIcon,
        title: "No timesheets in this range",
        description: "Hours appear here the moment a Pro clocks out.",
      }
  }
}

function TimesheetsEmpty({
  tab,
  persona,
  noMatches,
  onReset,
  resetLabel,
}: {
  tab: TimesheetTab
  persona: PersonaId
  noMatches: boolean
  onReset: () => void
  resetLabel: string
}) {
  const copy: EmptyCopy = noMatches
    ? { icon: SearchXIcon, title: "No timesheets match", description: "Try a different search, venue or date range." }
    : emptyCopy(tab, persona)
  return (
    <EmptyState
      icon={copy.icon}
      title={copy.title}
      description={copy.description}
      className="rounded-none border-0 py-12"
      action={
        noMatches ? (
          <Button variant="outline" size="sm" onClick={onReset}>
            {resetLabel}
          </Button>
        ) : null
      }
    />
  )
}
