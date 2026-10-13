"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowLeftRightIcon,
  CheckIcon,
  ExternalLinkIcon,
  FlagIcon,
  MessageSquareReplyIcon,
  MoreHorizontalIcon,
  PanelRightOpenIcon,
  PencilIcon,
} from "lucide-react"

import { SortHeader, type ColumnDef } from "@/components/app/data-table"
import { WorkerCell } from "@/components/app/identity"
import { EntryStatusBadge, StatusBadge } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDate, formatTimeRange } from "@/lib/dates"
import { hours, money, rate, workerName } from "@/lib/format"
import type { PersonaId } from "@/lib/types"

import { AnomalyBadges, ClockedTimes, EntryStatusNote, VarianceChips } from "./entry-parts"
import { entryCapabilities, formatDuration, hasAnyAction, type EntryAction, type EntryRow } from "./model"

interface ColumnOptions {
  persona: PersonaId
  onOpen: (row: EntryRow) => void
  onAction: (action: EntryAction, row: EntryRow) => void
}

const muted = <span className="text-xs text-muted-foreground">–</span>

export function useEntryColumns({ persona, onOpen, onAction }: ColumnOptions): ColumnDef<EntryRow, unknown>[] {
  return React.useMemo<ColumnDef<EntryRow, unknown>[]>(
    () => [
      {
        id: "pro",
        accessorFn: (r) => (r.worker ? workerName(r.worker) : ""),
        header: ({ column }) => <SortHeader column={column} title="Pro" />,
        cell: ({ row }) => (
          <WorkerCell
            worker={row.original.worker}
            size="sm"
            subtitle={persona === "supplier" ? <span className="font-mono">{row.original.entry.id}</span> : row.original.supplier?.shortName}
            className="max-w-52 min-w-36"
          />
        ),
      },
      {
        id: "shift",
        header: "Shift",
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex max-w-56 min-w-36 flex-col">
              <span className="truncate text-sm font-medium">{r.position?.title ?? "–"}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[r.request?.eventName ?? r.request?.reason, r.venue?.shortName].filter(Boolean).join(" · ")}
              </span>
            </div>
          )
        },
      },
      {
        id: "date",
        accessorFn: (r) => r.entry.clockIn,
        sortingFn: "basic",
        sortDescFirst: true,
        header: ({ column }) => <SortHeader column={column} title="Date" />,
        cell: ({ row }) => <span className="text-sm whitespace-nowrap">{formatDate(row.original.entry.date)}</span>,
      },
      {
        id: "scheduled",
        header: "Scheduled",
        cell: ({ row }) => {
          const req = row.original.request
          return req ? (
            <span className="text-sm whitespace-nowrap text-muted-foreground tabular">{formatTimeRange(req.startTime, req.endTime)}</span>
          ) : (
            muted
          )
        },
      },
      {
        id: "clocked",
        header: "Clocked",
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <ClockedTimes entry={row.original.entry} className="text-sm" />
            <VarianceChips row={row.original} />
          </div>
        ),
      },
      {
        id: "break",
        header: "Break",
        cell: ({ row }) =>
          row.original.entry.breakMinutes > 0 ? (
            <span className="text-sm whitespace-nowrap tabular">{formatDuration(row.original.entry.breakMinutes)}</span>
          ) : (
            muted
          ),
      },
      {
        id: "hours",
        accessorFn: (r) => r.hours,
        sortDescFirst: true,
        header: ({ column }) => (
          <div className="flex justify-end">
            <SortHeader column={column} title="Hours" className="-mr-1 ml-0" />
          </div>
        ),
        cell: ({ row }) => {
          const { entry, hours: total } = row.original
          return (
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-medium tabular">{hours(total)}</span>
              {entry.overtimeHours > 0 ? (
                <StatusBadge tone="warning" dot={false} className="h-4.5 px-1.5 text-[11px]">
                  {hours(entry.overtimeHours)} OT
                </StatusBadge>
              ) : null}
            </div>
          )
        },
      },
      {
        id: "amount",
        accessorFn: (r) => r.entry.amount,
        sortDescFirst: true,
        header: ({ column }) => (
          <div className="flex justify-end">
            <SortHeader column={column} title="Amount" className="-mr-1 ml-0" />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium tabular">{money(row.original.entry.amount, true)}</span>
            <span className="text-[11px] whitespace-nowrap text-muted-foreground tabular">{rate(row.original.entry.billRate)}</span>
          </div>
        ),
      },
      {
        id: "flags",
        header: "Flags",
        cell: ({ row }) => <AnomalyBadges anomalies={row.original.entry.anomalies} empty={muted} className="max-w-56 min-w-24" />,
      },
      {
        id: "status",
        accessorFn: (r) => r.entry.status,
        header: "Status",
        cell: ({ row }) => (
          <div className="flex max-w-40 flex-col items-start gap-0.5">
            <EntryStatusBadge status={row.original.entry.status} />
            <EntryStatusNote entry={row.original.entry} />
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <RowActions row={row.original} persona={persona} onOpen={onOpen} onAction={onAction} />
          </div>
        ),
      },
    ],
    [persona, onOpen, onAction]
  )
}

function RowActions({ row, persona, onOpen, onAction }: { row: EntryRow } & ColumnOptions) {
  const caps = entryCapabilities(row.entry, persona)
  // Dialogs opened from the menu manage focus themselves; returning it to the trigger would fight them.
  const returnFocus = React.useRef(true)
  const open = (action: EntryAction) => {
    returnFocus.current = action === "approve"
    onAction(action, row)
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.entry.id}`}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
        onCloseAutoFocus={(e) => {
          if (!returnFocus.current) e.preventDefault()
          returnFocus.current = true
        }}
      >
        {hasAnyAction(caps) ? (
          <>
            <DropdownMenuGroup>
              {caps.approve ? (
                <DropdownMenuItem onSelect={() => open("approve")}>
                  <CheckIcon />
                  {row.entry.status === "Disputed" ? "Resolve & approve" : "Approve"}
                </DropdownMenuItem>
              ) : null}
              {caps.adjust ? (
                <DropdownMenuItem onSelect={() => open("adjust")}>
                  <PencilIcon />
                  Adjust hours…
                </DropdownMenuItem>
              ) : null}
              {caps.reassign ? (
                <DropdownMenuItem onSelect={() => open("reassign")}>
                  <ArrowLeftRightIcon />
                  Reassign hours (worker swap)…
                </DropdownMenuItem>
              ) : null}
              {caps.respond ? (
                <DropdownMenuItem onSelect={() => open("respond")}>
                  <MessageSquareReplyIcon />
                  {row.entry.dispute?.response ? "Update response…" : "Respond to dispute…"}
                </DropdownMenuItem>
              ) : null}
              {caps.dispute ? (
                <DropdownMenuItem variant="destructive" onSelect={() => open("dispute")}>
                  <FlagIcon />
                  Dispute…
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => {
              returnFocus.current = false
              onOpen(row)
            }}
          >
            <PanelRightOpenIcon />
            View details
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/requests/${row.entry.requestId}`}>
              <ExternalLinkIcon />
              View request
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
