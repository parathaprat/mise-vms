"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { BanIcon, CalendarPlusIcon, EllipsisIcon, SearchXIcon, StarIcon, UserRoundIcon } from "lucide-react"

import { DataTable, SortHeader, type ColumnDef } from "@/components/app/data-table"
import { SupplierCell, WorkerCell } from "@/components/app/identity"
import { EmptyState } from "@/components/app/misc"
import { StatusBadge, type Tone } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { parseLocal, relativeDay } from "@/lib/dates"
import type { Venue } from "@/lib/types"

import { FavoriteVenueItems } from "./favorite-control"
import { HoursMeter } from "./hours-meter"
import { eligibleVenuesFor, FLAG_TONE, lastWorkedLabel, type ProRow, type WorkforceModel } from "./use-workforce"

interface ProsTableProps {
  model: WorkforceModel
  rows: ProRow[]
  onBlock: (workerId: string) => void
  onClearFilters?: () => void
}

export function ProsTable({ model, rows, onBlock, onClearFilters }: ProsTableProps) {
  const router = useRouter()
  const { persona, policies, scopeVenues, canManage, today, venuesById } = model
  const showSupplier = persona.id !== "supplier"
  const showMarket = model.metros.length > 1

  const columns = React.useMemo<ColumnDef<ProRow, unknown>[]>(() => {
    const cols: ColumnDef<ProRow, unknown>[] = [
      {
        id: "name",
        accessorFn: (r) => r.name,
        header: ({ column }) => <SortHeader column={column} title="Pro" />,
        cell: ({ row }) => (
          <WorkerCell
            worker={row.original.worker}
            favorite={row.original.favoriteVenueIds.length > 0}
            href={`/workforce/${row.original.id}`}
            subtitle={row.original.id}
          />
        ),
      },
      {
        id: "positions",
        enableSorting: false,
        header: () => <span>Positions</span>,
        cell: ({ row }) => <PositionsCell row={row.original} />,
      },
    ]
    if (showSupplier) {
      cols.push({
        id: "supplier",
        accessorFn: (r) => r.supplier?.shortName ?? "",
        header: ({ column }) => <SortHeader column={column} title="Supplier" />,
        cell: ({ row }) => <SupplierCell supplier={row.original.supplier} />,
      })
    }
    if (showMarket) {
      cols.push({
        id: "market",
        accessorFn: (r) => r.metroLabel,
        header: ({ column }) => <SortHeader column={column} title="Market" />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.metroLabel}</span>,
      })
    }
    cols.push(
      {
        id: "rating",
        accessorFn: (r) => r.worker.rating,
        header: ({ column }) => <SortHeader column={column} title="Rating" />,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1 text-sm tabular">
            <StarIcon className="size-3.5 fill-warning text-warning" aria-hidden />
            {row.original.worker.rating.toFixed(2)}
          </span>
        ),
      },
      {
        id: "reliability",
        accessorFn: (r) => r.worker.reliability,
        header: ({ column }) => <SortHeader column={column} title="Reliability" />,
        cell: ({ row }) => <span className="text-sm tabular">{Math.round(row.original.worker.reliability * 100)}%</span>,
      },
      {
        id: "hours",
        accessorFn: (r) => r.worker.compassHours,
        header: ({ column }) => <SortHeader column={column} title="Contractual hours" />,
        cell: ({ row }) => (
          <HoursMeter
            hours={row.original.worker.compassHours}
            cap={policies.contractualHoursCap}
            warnPct={policies.contractualHoursWarnPct}
            className="w-40"
          />
        ),
      },
      {
        id: "lastWorked",
        accessorFn: (r) => r.lastWorked ?? "",
        sortDescFirst: true,
        header: ({ column }) => <SortHeader column={column} title={persona.id === "venue" ? "Last at your venues" : "Last worked"} />,
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex flex-col gap-0.5">
              <span className={r.lastWorked ? "text-sm" : "text-sm text-muted-foreground"}>{lastWorkedLabel(r.lastWorked, today)}</span>
              {r.nextShift ? (
                <span className="text-xs text-muted-foreground">
                  Next: {relativeDay(r.nextShift, parseLocal(today))}
                  {r.upcoming > 1 ? ` · ${r.upcoming} booked` : ""}
                </span>
              ) : null}
            </div>
          )
        },
      },
      {
        id: "status",
        accessorFn: (r) => (r.blocks.length ? 0 : r.flags.length ? 1 : r.worker.status === "Active" ? 3 : 2),
        header: ({ column }) => <SortHeader column={column} title="Status" />,
        cell: ({ row }) => <ProStatusCell row={row.original} venuesById={venuesById} />,
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <ProRowActions row={row.original} venues={scopeVenues} canManage={canManage} onBlock={onBlock} />,
      }
    )
    return cols
  }, [showSupplier, showMarket, persona.id, policies, today, venuesById, scopeVenues, canManage, onBlock])

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      onRowClick={(r) => router.push(`/workforce/${r.id}`)}
      pageSize={25}
      empty={
        <EmptyState
          icon={SearchXIcon}
          title="No Pros match these filters"
          description="Try a different name, position, or supplier."
          className="m-4 border-none"
          action={
            onClearFilters ? (
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      }
    />
  )
}

function PositionsCell({ row }: { row: ProRow }) {
  const [first, second, ...rest] = row.positions
  if (!first) return <span className="text-sm text-muted-foreground">–</span>
  return (
    <div className="flex max-w-64 items-center gap-1.5">
      <span className="truncate text-sm">{first.title}</span>
      {second ? <span className="hidden truncate text-sm text-muted-foreground xl:inline">· {second.title}</span> : null}
      {rest.length || second ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular" data-no-row-click>
              +{rest.length + (second ? 1 : 0)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{row.positions.map((p) => p.title).join(" · ")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

export function ProStatusCell({ row, venuesById }: { row: ProRow; venuesById: Map<string, Venue> }) {
  const badges: { tone: Tone; label: string }[] = []
  if (row.blocks.length) {
    const label =
      row.blocks.length === 1
        ? `Do-not-return · ${venuesById.get(row.blocks[0].venueId)?.shortName ?? "venue"}`
        : `Do-not-return · ${row.blocks.length} venues`
    badges.push({ tone: "danger", label })
  }
  if (row.worker.status !== "Active") {
    badges.push({ tone: row.worker.status === "Onboarding" ? "info" : "muted", label: row.worker.status })
  }
  for (const flag of row.flags) {
    if (flag.kind === "onboarding" && row.worker.status === "Onboarding") continue
    badges.push({ tone: FLAG_TONE[flag.kind], label: flag.label })
  }
  if (badges.length === 0) {
    return (
      <StatusBadge tone="success" dot={false}>
        Cleared
      </StatusBadge>
    )
  }
  const [lead, ...more] = badges
  return (
    <div className="flex items-center gap-1.5">
      <StatusBadge tone={lead.tone}>{lead.label}</StatusBadge>
      {more.length ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular" data-no-row-click>
              +{more.length}
            </span>
          </TooltipTrigger>
          <TooltipContent>{more.map((b) => b.label).join(" · ")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

interface ProRowActionsProps {
  row: ProRow
  venues: Venue[]
  canManage: boolean
  onBlock: (workerId: string) => void
}

function ProRowActions({ row, venues, canManage, onBlock }: ProRowActionsProps) {
  const router = useRouter()
  const eligible = eligibleVenuesFor(row.worker, venues)
  const blockedIds = row.blocks.map((b) => b.venueId)
  const canBlock = eligible.some((v) => !blockedIds.includes(v.id))
  return (
    <div className="flex justify-end">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.name}`}>
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href={`/workforce/${row.id}`}>
                <UserRoundIcon />
                View profile
              </Link>
            </DropdownMenuItem>
            {canManage ? (
              <DropdownMenuItem
                disabled={row.worker.status !== "Active"}
                onSelect={() => router.push(`/requests/new?worker=${row.id}`)}
              >
                <CalendarPlusIcon />
                Request this Pro
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          {canManage && eligible.length ? (
            <>
              <DropdownMenuSeparator />
              <FavoriteVenueItems
                worker={row.worker}
                venues={eligible}
                favoriteVenueIds={row.favoriteVenueIds}
                blockedVenueIds={blockedIds}
                label={eligible.length > 1 ? "Favorite at" : "Favorite"}
              />
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" disabled={!canBlock} onSelect={() => onBlock(row.id)}>
                  <BanIcon />
                  Add to do-not-return…
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
