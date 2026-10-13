"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import * as React from "react"
import {
  CalendarPlusIcon,
  DownloadIcon,
  FilterXIcon,
  HourglassIcon,
  SearchIcon,
  ShieldAlertIcon,
  StarIcon,
  UsersRoundIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/app/page-header"
import { StatCard } from "@/components/app/stat-card"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePersona } from "@/hooks/use-demo"
import { num, plural, workerLegalName } from "@/lib/format"

import { BlockDialog, type BlockTarget } from "./block-dialog"
import { ComplianceBoard } from "./compliance-board"
import { DnrBoard } from "./dnr-board"
import { FavoritesGrid } from "./favorites-grid"
import { ProsTable } from "./pros-table"
import {
  applyFilters,
  EMPTY_FILTERS,
  hasActiveFilters,
  isWorkforceTab,
  useWorkforce,
  type ProRow,
  type WorkforceFilters,
  type WorkforceModel,
  type WorkforceTab,
} from "./use-workforce"

export function WorkforcePage() {
  const persona = usePersona()
  return <WorkforceView key={persona.id} />
}

function WorkforceView() {
  const model = useWorkforce()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const tabParam = searchParams.get("tab")
  const tab: WorkforceTab = isWorkforceTab(tabParam) ? tabParam : "all"
  const [filters, setFilters] = React.useState<WorkforceFilters>(EMPTY_FILTERS)
  const [blockTarget, setBlockTarget] = React.useState<BlockTarget>({ open: false })

  const { rows, persona, policies, scopeVenues, canManage } = model
  const filtered = hasActiveFilters(filters)
  const visible = React.useMemo(() => applyFilters(rows, filters), [rows, filters])
  const visibleFavorites = React.useMemo(() => visible.filter((r) => r.favoriteVenueIds.length > 0), [visible])

  const counts = React.useMemo(() => {
    let favorites = 0
    let blocks = 0
    let flagged = 0
    let active = 0
    let onboarding = 0
    let certIssues = 0
    let expired = 0
    let expiring = 0
    let nearCap = 0
    let atCap = 0
    for (const r of rows) {
      if (r.favoriteVenueIds.length) favorites++
      blocks += r.blocks.length
      if (r.flags.length) flagged++
      if (r.worker.status === "Active") active++
      if (r.worker.status === "Onboarding") onboarding++
      const kinds = new Set(r.flags.map((f) => f.kind))
      if (kinds.has("cert-expired") || kinds.has("cert-expiring")) certIssues++
      if (kinds.has("cert-expired")) expired++
      if (kinds.has("cert-expiring")) expiring++
      if (kinds.has("hours-warn") || kinds.has("hours-cap")) nearCap++
      if (kinds.has("hours-cap")) atCap++
    }
    return { favorites, blocks, flagged, active, onboarding, certIssues, expired, expiring, nearCap, atCap }
  }, [rows])

  const setTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") params.delete("tab")
    else params.set("tab", value)
    const qs = params.toString()
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
  }

  const updateFilters = (patch: Partial<WorkforceFilters>) => setFilters((prev) => ({ ...prev, ...patch }))
  const clearFilters = () => setFilters(EMPTY_FILTERS)
  const openBlock = React.useCallback((workerId: string) => setBlockTarget({ workerId, open: true }), [])
  const openAdd = (venueId?: string) => setBlockTarget({ venueId, open: true })

  const markets = [...new Set(scopeVenues.map((v) => v.metro))]
  const marketLabel = model.metros.find((m) => m.id === markets[0])?.label ?? "your"

  return (
    <>
      <PageHeader
        title="Workforce"
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv(visible, model)} disabled={visible.length === 0}>
              <DownloadIcon data-icon="inline-start" />
              Export CSV
            </Button>
            {canManage ? (
              <Button asChild>
                <Link href="/requests/new">
                  <CalendarPlusIcon data-icon="inline-start" />
                  New request
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workforce summary">
        <StatCard
          label={persona.id === "supplier" ? "Your Pros" : "Active Pros"}
          value={num(counts.active)}
          icon={UsersRoundIcon}
          hint={
            persona.id === "program"
              ? `${num(counts.onboarding)} onboarding · ${plural(model.suppliers.length, "supplier")}`
              : persona.id === "supplier"
                ? `${num(counts.onboarding)} onboarding · ${plural(model.metros.length, "market")}`
                : `${num(counts.onboarding)} onboarding · ${marketLabel} market`
          }
        />
        <StatCard
          label={persona.id === "supplier" ? "Venue favorites" : "Favorites"}
          value={num(counts.favorites)}
          icon={StarIcon}
          href="/workforce?tab=favorites"
          hint={
            persona.id === "supplier"
              ? "Your Pros starred by Compass venues"
              : `Across ${plural(scopeVenues.length, "venue")} · first look at new shifts`
          }
        />
        <StatCard
          label="Certification issues"
          value={num(counts.certIssues)}
          icon={ShieldAlertIcon}
          href="/workforce?tab=compliance"
          hint={`${num(counts.expired)} expired · ${num(counts.expiring)} expiring within 30 days`}
        />
        <StatCard
          label="Near contractual cap"
          value={num(counts.nearCap)}
          icon={HourglassIcon}
          href="/workforce?tab=compliance"
          hint={`${num(counts.atCap)} at the ${policies.contractualHoursCap}-hour cap${policies.blockOverCapWorkers && counts.atCap ? " · bookings blocked" : ""}`}
        />
      </section>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList>
              <TabsTrigger value="all">
                All Pros <TabCount value={rows.length} />
              </TabsTrigger>
              <TabsTrigger value="favorites">
                Favorites <TabCount value={counts.favorites} />
              </TabsTrigger>
              <TabsTrigger value="dnr">
                Do-not-return <TabCount value={counts.blocks} />
              </TabsTrigger>
              <TabsTrigger value="compliance">
                Compliance <TabCount value={counts.flagged} />
              </TabsTrigger>
            </TabsList>
          </div>
          <WorkforceToolbar model={model} filters={filters} onChange={updateFilters} onClear={clearFilters} />
        </div>

        <TabsContent value="all">
          <ProsTable model={model} rows={visible} onBlock={openBlock} onClearFilters={filtered ? clearFilters : undefined} />
        </TabsContent>
        <TabsContent value="favorites">
          <FavoritesGrid model={model} rows={visibleFavorites} filtered={filtered} onClearFilters={clearFilters} />
        </TabsContent>
        <TabsContent value="dnr">
          <DnrBoard model={model} rows={visible} filtered={filtered} onAdd={openAdd} onClearFilters={clearFilters} />
        </TabsContent>
        <TabsContent value="compliance">
          <ComplianceBoard model={model} rows={visible} filtered={filtered} onClearFilters={clearFilters} />
        </TabsContent>
      </Tabs>

      {canManage ? (
        <BlockDialog
          target={blockTarget}
          onOpenChange={(open) => setBlockTarget((prev) => ({ ...prev, open }))}
          candidates={rows}
          venues={scopeVenues}
        />
      ) : null}
    </>
  )
}

function TabCount({ value }: { value: number }) {
  return <span className="text-xs text-muted-foreground tabular">{num(value)}</span>
}

interface WorkforceToolbarProps {
  model: WorkforceModel
  filters: WorkforceFilters
  onChange: (patch: Partial<WorkforceFilters>) => void
  onClear: () => void
}

function WorkforceToolbar({ model, filters, onChange, onClear }: WorkforceToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <InputGroup className="w-full sm:w-60">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={filters.query}
          onChange={(e) => onChange({ query: e.target.value })}
          placeholder="Name, ID, phone…"
          aria-label="Search Pros"
        />
      </InputGroup>
      <Select value={filters.positionId} onValueChange={(positionId) => onChange({ positionId })}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by position">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          <SelectGroup>
            <SelectItem value="all">All positions</SelectItem>
            {model.positions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {model.persona.id !== "supplier" && model.suppliers.length > 1 ? (
        <Select value={filters.supplierId} onValueChange={(supplierId) => onChange({ supplierId })}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by supplier">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectGroup>
              <SelectItem value="all">All suppliers</SelectItem>
              {model.suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.shortName}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}
      {model.metros.length > 1 ? (
        <Select value={filters.metro} onValueChange={(metro) => onChange({ metro })}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by market">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectGroup>
              <SelectItem value="all">All markets</SelectItem>
              {model.metros.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}
      <Select value={filters.status} onValueChange={(status) => onChange({ status: status as WorkforceFilters["status"] })}>
        <SelectTrigger className="w-full sm:w-36" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="end">
          <SelectGroup>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Onboarding">Onboarding</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {hasActiveFilters(filters) ? (
        <Button variant="ghost" onClick={onClear}>
          <FilterXIcon data-icon="inline-start" />
          Clear
        </Button>
      ) : null}
    </div>
  )
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function exportCsv(rows: ProRow[], model: WorkforceModel) {
  const venueName = (id: string) => model.venuesById.get(id)?.shortName ?? id
  const header = [
    "Pro ID",
    "Name",
    "Legal name",
    "Supplier",
    "Market",
    "Positions",
    "Status",
    "Rating",
    "Reliability",
    "Contractual hours",
    "Favorite at",
    "Do-not-return at",
    "Compliance flags",
    "Last worked",
  ]
  const lines = rows.map((r) => [
    r.id,
    r.name,
    workerLegalName(r.worker),
    r.supplier?.name ?? "",
    r.metroLabel,
    r.positions.map((p) => p.title).join("; "),
    r.worker.status,
    r.worker.rating.toFixed(2),
    `${Math.round(r.worker.reliability * 100)}%`,
    r.worker.compassHours,
    r.favoriteVenueIds.map(venueName).join("; "),
    r.blocks.map((b) => venueName(b.venueId)).join("; "),
    r.flags.map((f) => f.label).join("; "),
    r.lastWorked ?? "",
  ])
  const csv = [header, ...lines].map((cols) => cols.map(csvCell).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = `mise-workforce-${model.today}.csv`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  toast.success(`Exported ${plural(rows.length, "Pro")}`, { description: link.download })
}
