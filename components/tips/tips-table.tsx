"use client"

import * as React from "react"
import { ChevronRightIcon } from "lucide-react"

import { DataTable, SortHeader, type ColumnDef } from "@/components/app/data-table"
import { SupplierMark, VenueMark } from "@/components/app/identity"
import { StatusBadge, TIP_TONE } from "@/components/app/status-badge"
import { formatDate } from "@/lib/dates"
import { money, num, rate } from "@/lib/format"
import type { PersonaId, TipBatchStatus } from "@/lib/types"

import { nextBusinessDay, TIP_STATUS_LABEL } from "./tip-utils"
import type { TipRow, TipsModel } from "./use-tips"

const STATUS_RANK: Record<TipBatchStatus, number> = {
  "Pending approval": 0,
  Draft: 1,
  Rejected: 2,
  Approved: 3,
  Paid: 4,
}

/** One-line context under the status badge: who it's waiting on, when Pros get paid, which invoice bills it. */
export function statusDetail(row: TipRow, persona: PersonaId, today: string): string {
  const { batch, invoices } = row
  switch (batch.status) {
    case "Draft":
      return `Started by ${batch.createdBy}`
    case "Pending approval":
      return persona === "supplier" ? "Waiting on the venue" : `Submitted by ${batch.createdBy}`
    case "Rejected":
      if (persona === "supplier") return "Returned to the venue for changes"
      return batch.note ? `“${batch.note}”` : "Returned for changes"
    case "Approved": {
      if (invoices.length) return invoices.length === 1 ? `Billed on ${invoices[0].id}` : `Billed on ${num(invoices.length)} invoices`
      const payDay = batch.approvedAt ? nextBusinessDay(batch.approvedAt) : null
      if (payDay && payDay > today) {
        return persona === "supplier" ? `Pay Pros by ${formatDate(payDay, "EEE, MMM d")}` : `Pros paid ${formatDate(payDay, "EEE, MMM d")}`
      }
      return "Bills on the next weekly invoice"
    }
    case "Paid":
      return invoices.length === 1 ? `Reimbursed on ${invoices[0].id}` : "Supplier reimbursed"
  }
}

export function TipStatus({ row, persona, today }: { row: TipRow; persona: PersonaId; today: string }) {
  const { status } = row.batch
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <StatusBadge tone={TIP_TONE[status]}>{TIP_STATUS_LABEL[status]}</StatusBadge>
      <span className="max-w-52 truncate text-xs text-muted-foreground">{statusDetail(row, persona, today)}</span>
    </div>
  )
}

interface TipsTableProps {
  model: TipsModel
  rows: TipRow[]
  onOpen: (id: string) => void
  empty: React.ReactNode
}

export function TipsTable({ model, rows, onOpen, empty }: TipsTableProps) {
  const { persona, today } = model
  const isSupplier = persona.id === "supplier"
  const showVenue = React.useMemo(() => new Set(model.rows.map((r) => r.batch.venueId)).size > 1, [model.rows])

  const columns = React.useMemo<ColumnDef<TipRow, unknown>[]>(() => {
    const cols: ColumnDef<TipRow, unknown>[] = [
      {
        id: "event",
        accessorFn: (r) => r.batch.eventName,
        header: ({ column }) => <SortHeader column={column} title="Event" />,
        cell: ({ row }) => {
          const { batch } = row.original
          return (
            <div className="flex max-w-72 min-w-0 flex-col items-start gap-0.5">
              <button
                type="button"
                onClick={() => onOpen(batch.id)}
                className="max-w-full truncate rounded-sm text-left text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {batch.eventName}
              </button>
              <span className="max-w-full truncate text-xs text-muted-foreground">
                <span className="font-mono">{batch.id}</span> · {batch.method}
              </span>
            </div>
          )
        },
      },
    ]
    if (showVenue) {
      cols.push({
        id: "venue",
        accessorFn: (r) => r.venue?.shortName ?? "",
        header: ({ column }) => <SortHeader column={column} title="Venue" />,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <VenueMark venue={row.original.venue} size="xs" />
            <span className="truncate text-sm">{row.original.venue?.shortName ?? "–"}</span>
          </div>
        ),
      })
    }
    cols.push(
      {
        id: "date",
        accessorFn: (r) => r.batch.date,
        sortDescFirst: true,
        header: ({ column }) => <SortHeader column={column} title="Event date" />,
        cell: ({ row }) => <span className="text-sm tabular">{formatDate(row.original.batch.date, "EEE, MMM d")}</span>,
      },
      {
        id: "pros",
        accessorFn: (r) => r.lines.length,
        header: ({ column }) => <SortHeader column={column} title="Pros" />,
        cell: ({ row }) => {
          const r = row.original
          return (
            <span className="text-sm tabular">
              {num(r.lines.length)}
              {isSupplier && r.allPros > r.lines.length ? <span className="text-muted-foreground"> of {num(r.allPros)}</span> : null}
            </span>
          )
        },
      },
    )
    if (!isSupplier) {
      cols.push({
        id: "suppliers",
        accessorFn: (r) => r.shares[0]?.supplier?.shortName ?? "",
        header: ({ column }) => <SortHeader column={column} title="Suppliers" />,
        cell: ({ row }) => {
          const [top, ...rest] = row.original.shares
          if (!top) return <span className="text-sm text-muted-foreground">–</span>
          return (
            <div className="flex min-w-0 items-center gap-2">
              <SupplierMark supplier={top.supplier} size="xs" />
              <span className="truncate text-sm">{top.supplier?.shortName ?? "Unknown"}</span>
              {rest.length ? (
                <span
                  className="text-xs text-muted-foreground tabular"
                  title={rest.map((s) => s.supplier?.shortName ?? "Unknown").join(", ")}
                >
                  +{num(rest.length)}
                </span>
              ) : null}
            </div>
          )
        },
      })
    }
    cols.push(
      {
        id: "perHour",
        accessorFn: (r) => (r.hours ? r.total / r.hours : 0),
        header: ({ column }) => <SortHeader column={column} title="Per hour" />,
        cell: ({ row }) => {
          const r = row.original
          return <span className="text-sm text-muted-foreground tabular">{r.hours ? rate(r.total / r.hours) : "–"}</span>
        },
      },
      {
        id: "total",
        accessorFn: (r) => r.total,
        sortDescFirst: true,
        header: ({ column }) => (
          <div className="flex justify-end">
            <SortHeader column={column} title={isSupplier ? "Your Pros' tips" : "Total"} />
          </div>
        ),
        cell: ({ row }) => <div className="text-right text-sm font-medium tabular">{money(row.original.total, true)}</div>,
      },
      {
        id: "status",
        accessorFn: (r) => STATUS_RANK[r.batch.status],
        header: ({ column }) => <SortHeader column={column} title="Status" />,
        cell: ({ row }) => <TipStatus row={row.original} persona={persona.id} today={today} />,
      },
      {
        id: "open",
        enableSorting: false,
        header: () => <span className="sr-only">Open</span>,
        cell: () => <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" aria-hidden />,
      }
    )
    return cols
  }, [showVenue, isSupplier, persona.id, today, onOpen])

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      onRowClick={(r) => onOpen(r.id)}
      initialSorting={[{ id: "date", desc: true }]}
      pageSize={15}
      empty={empty}
    />
  )
}
