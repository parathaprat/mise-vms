"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { addDays } from "date-fns"
import {
  ClipboardListIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FileInputIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  DataTable,
  SortHeader,
  type ColumnDef,
} from "@/components/app/data-table"
import { FillMeter } from "@/components/app/fill-meter"
import { SupplierMark, VenueCell } from "@/components/app/identity"
import { EmptyState } from "@/components/app/misc"
import { PageHeader } from "@/components/app/page-header"
import { RequestStatusBadge } from "@/components/app/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useData,
  useLookups,
  useNow,
  usePersona,
  useRequestViews,
} from "@/hooks/use-demo"
import { formatDateList, formatTimeRange, toISODate } from "@/lib/dates"
import { money, num, rate } from "@/lib/format"
import { venueInScope, type RequestView } from "@/lib/selectors"

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "open", label: "Needs Pros" },
  { key: "pending", label: "Pending approval" },
  { key: "live", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "drafts", label: "Drafts" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
] as const

type TabKey = (typeof TABS)[number]["key"]

const RANGES = [
  { key: "all", label: "Any date" },
  { key: "next7", label: "Next 7 days" },
  { key: "next30", label: "Next 30 days" },
  { key: "past30", label: "Past 30 days" },
] as const

function matchesTab(v: RequestView, tab: TabKey): boolean {
  switch (tab) {
    case "upcoming":
      return (
        v.status === "Open" ||
        v.status === "Filled" ||
        v.status === "In progress" ||
        v.status === "Pending approval"
      )
    case "open":
      return (
        (v.status === "Open" || v.status === "In progress") && v.fill.open > 0
      )
    case "pending":
      return v.status === "Pending approval"
    case "live":
      return v.status === "In progress"
    case "completed":
      return v.status === "Completed"
    case "drafts":
      return v.status === "Draft"
    case "cancelled":
      return v.status === "Cancelled"
    default:
      return true
  }
}

function exportCsv(rows: RequestView[]) {
  const header = [
    "Request",
    "Venue",
    "Cost center",
    "Position",
    "Event",
    "Dates",
    "Start",
    "End",
    "Headcount",
    "Filled",
    "Bill rate",
    "Estimate",
    "Status",
  ]
  const lines = rows.map((v) =>
    [
      v.req.id,
      v.venue.name,
      v.costCenter.code,
      v.position.title,
      v.req.eventName ?? "",
      v.req.dates.join(" "),
      v.req.startTime,
      v.req.endTime,
      v.req.headcount,
      `${v.fill.filled}/${v.fill.total}`,
      v.req.billRate.toFixed(2),
      v.estimate.toFixed(2),
      v.status,
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(",")
  )
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `mise-requests-${toISODate(new Date())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function RequestsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const persona = usePersona()
  const now = useNow()
  const views = useRequestViews()
  const lookups = useLookups()
  const venues = useData((d) => d.venues)
  const positions = useData((d) => d.positions)

  const tab = (TABS.find((t) => t.key === params.get("tab"))?.key ??
    "upcoming") as TabKey
  const venueFilter = params.get("venue") ?? "all"
  const [query, setQuery] = React.useState(params.get("q") ?? "")
  const [positionFilter, setPositionFilter] = React.useState("all")
  const [range, setRange] =
    React.useState<(typeof RANGES)[number]["key"]>("all")

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (
      value === null ||
      value === "" ||
      (key === "tab" && value === "upcoming") ||
      (key === "venue" && value === "all")
    )
      next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const scopedVenues = venues.filter((v) => venueInScope(v.id, persona))

  const base = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const today = toISODate(now)
    const next7 = toISODate(addDays(now, 7))
    const next30 = toISODate(addDays(now, 30))
    const past30 = toISODate(addDays(now, -30))
    return views.filter((v) => {
      if (venueFilter !== "all" && v.venue.id !== venueFilter) return false
      if (positionFilter !== "all" && v.position.id !== positionFilter)
        return false
      const first = [...v.req.dates].sort()[0]
      const last = [...v.req.dates].sort().pop()!
      if (range === "next7" && !(last >= today && first <= next7)) return false
      if (range === "next30" && !(last >= today && first <= next30))
        return false
      if (range === "past30" && !(first < today && last >= past30)) return false
      if (q) {
        const hay =
          `${v.req.id} ${v.position.title} ${v.venue.name} ${v.req.eventName ?? ""} ${v.costCenter.code} ${v.costCenter.name}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [views, venueFilter, positionFilter, range, query, now])

  const counts = React.useMemo(() => {
    const out = {} as Record<TabKey, number>
    for (const t of TABS)
      out[t.key] = base.filter((v) => matchesTab(v, t.key)).length
    return out
  }, [base])

  const rows = React.useMemo(() => {
    const list = base.filter((v) => matchesTab(v, tab))
    const asc =
      tab === "upcoming" ||
      tab === "open" ||
      tab === "pending" ||
      tab === "live"
    return list.sort((a, b) =>
      asc
        ? a.start.getTime() - b.start.getTime()
        : b.start.getTime() - a.start.getTime()
    )
  }, [base, tab])

  const columns = React.useMemo<ColumnDef<RequestView, unknown>[]>(
    () => [
      {
        id: "request",
        accessorFn: (v) => v.position.title,
        header: ({ column }) => <SortHeader column={column} title="Request" />,
        cell: ({ row }) => {
          const v = row.original
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-medium">
                {v.req.headcount} × {v.position.title}
                {v.req.hireType === "Select Hire" ? (
                  <Badge variant="outline">Select hire</Badge>
                ) : null}
                {v.req.source === "Legacy import" ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <FileInputIcon
                        className="size-3.5 text-muted-foreground"
                        aria-label="Imported from the previous system"
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      Imported history
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono">{v.req.id}</span>
                <span aria-hidden>·</span>
                <span className="truncate">
                  {v.req.eventName ?? v.req.reason}
                </span>
              </span>
            </div>
          )
        },
      },
      {
        id: "venue",
        accessorFn: (v) => v.venue.name,
        header: ({ column }) => <SortHeader column={column} title="Venue" />,
        cell: ({ row }) => (
          <VenueCell
            venue={row.original.venue}
            subtitle={`${row.original.costCenter.code} · ${row.original.costCenter.name}`}
            className="max-w-56"
          />
        ),
      },
      {
        id: "when",
        accessorFn: (v) => v.start.getTime(),
        header: ({ column }) => <SortHeader column={column} title="When" />,
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5 whitespace-nowrap">
            <span className="text-sm">
              {formatDateList(row.original.req.dates, now)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatTimeRange(
                row.original.req.startTime,
                row.original.req.endTime
              )}
            </span>
          </div>
        ),
      },
      {
        id: "fill",
        accessorFn: (v) => (v.fill.total ? v.fill.filled / v.fill.total : 0),
        header: ({ column }) => <SortHeader column={column} title="Staffed" />,
        cell: ({ row }) =>
          row.original.status === "Draft" ||
          row.original.status === "Pending approval" ||
          row.original.status === "Cancelled" ? (
            <span className="text-xs text-muted-foreground">
              {row.original.status === "Cancelled" ? "–" : "Not distributed"}
            </span>
          ) : (
            <FillMeter
              fill={row.original.fill}
              live={row.original.status === "In progress"}
              className="w-36"
            />
          ),
      },
      {
        id: "estimate",
        accessorFn: (v) => v.estimate,
        header: ({ column }) => (
          <SortHeader column={column} title="Est. cost" />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5 whitespace-nowrap">
            <span className="text-sm tabular">
              {money(row.original.estimate)}
            </span>
            <span className="text-xs text-muted-foreground tabular">
              {rate(row.original.req.billRate)}
            </span>
          </div>
        ),
      },
      {
        id: "status",
        accessorFn: (v) => v.status,
        header: ({ column }) => <SortHeader column={column} title="Status" />,
        cell: ({ row }) => <RequestStatusBadge status={row.original.status} />,
      },
      {
        id: "suppliers",
        header: () => (
          <span className="text-xs font-medium text-muted-foreground">
            Suppliers
          </span>
        ),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex [&>*:not(:first-child)]:-ml-1">
            {row.original.req.supplierIds.map((id) => {
              const s = lookups.suppliers.get(id)
              return s ? (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <span className="rounded-[5px] ring-2 ring-card">
                      <SupplierMark supplier={s} size="xs" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {s.name} · Tier {s.tier}
                  </TooltipContent>
                </Tooltip>
              ) : null
            })}
          </div>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${row.original.req.id}`}
              >
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href={`/requests/${row.original.req.id}`}>
                    <ExternalLinkIcon />
                    Open request
                  </Link>
                </DropdownMenuItem>
                {persona.id !== "supplier" ? (
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/requests/new?duplicate=${row.original.req.id}`}
                    >
                      <CopyIcon />
                      Duplicate
                    </Link>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => {
                    void navigator.clipboard
                      ?.writeText(row.original.req.id)
                      .catch(() => undefined)
                    toast.success(`Copied ${row.original.req.id}`)
                  }}
                >
                  <ClipboardListIcon />
                  Copy request ID
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [lookups, now, persona.id]
  )

  const description =
    persona.id === "supplier"
      ? "Requests distributed to Instawork. Confirm Pros to fill, work orders are created automatically, no job-seeker uploads."
      : persona.id === "program"
        ? "Every FlexForce request across the program, with live staffing and approval status."
        : "Every staffing request across your venues. Post in under a minute, rates, check-in details and approvals are handled for you."

  const filtersActive =
    venueFilter !== "all" ||
    positionFilter !== "all" ||
    range !== "all" ||
    query.trim() !== ""

  return (
    <>
      <PageHeader
        title="Requests"
        description={description}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => exportCsv(rows)}
              disabled={rows.length === 0}
            >
              <DownloadIcon data-icon="inline-start" />
              Export
            </Button>
            {persona.id !== "supplier" ? (
              <Button asChild>
                <Link href="/requests/new">
                  <PlusIcon data-icon="inline-start" />
                  New request
                </Link>
              </Button>
            ) : null}
          </>
        }
      >
        <Tabs value={tab} onValueChange={(v) => setParam("tab", v)}>
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList variant="line">
              {TABS.filter((t) =>
                t.key === "drafts"
                  ? persona.id !== "supplier"
                  : t.key === "pending"
                    ? persona.id !== "supplier"
                    : true
              ).map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                  <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular">
                    {num(counts[t.key])}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      </PageHeader>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <InputGroup className="md:max-w-sm">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search ID, position, event, cost center…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search requests"
            />
            {query ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
          <div className="flex flex-wrap items-center gap-2">
            {scopedVenues.length > 1 ? (
              <Select
                value={venueFilter}
                onValueChange={(v) => setParam("venue", v)}
              >
                <SelectTrigger className="w-44" aria-label="Venue">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All venues</SelectItem>
                    {scopedVenues.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
            <Select value={positionFilter} onValueChange={setPositionFilter}>
              <SelectTrigger className="w-44" aria-label="Position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All positions</SelectItem>
                  {positions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={range}
              onValueChange={(v) => setRange(v as typeof range)}
            >
              <SelectTrigger className="w-36" aria-label="Date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {RANGES.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {filtersActive ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("")
                  setPositionFilter("all")
                  setRange("all")
                  setParam("venue", null)
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground tabular md:ml-auto">
            {num(rows.length)} requests
          </span>
        </div>

        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(v) => v.req.id}
            onRowClick={(v) => router.push(`/requests/${v.req.id}`)}
            pageSize={25}
            className="min-w-[960px]"
            empty={
              <EmptyState
                icon={ClipboardListIcon}
                title={
                  tab === "open" ? "Every shift is covered" : "No requests here"
                }
                description={
                  tab === "open"
                    ? "Nothing is waiting on Pros right now. New requests start filling the moment they're posted."
                    : filtersActive
                      ? "Try clearing filters or switching tabs."
                      : "Requests you post will appear here with live staffing status."
                }
                className="border-none"
                action={
                  persona.id !== "supplier" ? (
                    <Button asChild size="sm">
                      <Link href="/requests/new">
                        <PlusIcon data-icon="inline-start" />
                        New request
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </div>
      </div>
    </>
  )
}
