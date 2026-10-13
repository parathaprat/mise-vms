"use client"

import * as React from "react"
import { BanknoteIcon, CheckCheckIcon, CreditCardIcon, LandmarkIcon } from "lucide-react"

import { DataTable, SortHeader, type ColumnDef } from "@/components/app/data-table"
import { SupplierCell } from "@/components/app/identity"
import { CopyId, EmptyState } from "@/components/app/misc"
import { StatusBadge } from "@/components/app/status-badge"
import { daysFromToday, formatDate, parseLocal } from "@/lib/dates"
import { money, num, plural } from "@/lib/format"
import type { Persona } from "@/lib/types"

import { PAYMENT_TONE, type PaymentRow } from "./invoice-utils"

interface PaymentsTableProps {
  rows: PaymentRow[]
  persona: Persona
  todayISO: string
  onOpen: (paymentId: string) => void
}

export function PaymentsTable({ rows, persona, todayISO, onOpen }: PaymentsTableProps) {
  const isSupplier = persona.id === "supplier"

  const summary = React.useMemo(() => {
    const today = parseLocal(todayISO)
    let settled30 = 0
    let inFlight = 0
    let scheduled = 0
    let lines = 0
    for (const r of rows) {
      lines += r.lines.length
      if (r.payment.status === "Settled" && daysFromToday(r.payment.date, today) >= -30) settled30 += r.scopedAmount
      else if (r.payment.status === "Processing") inFlight += r.scopedAmount
      else if (r.payment.status === "Scheduled") scheduled += r.scopedAmount
    }
    return { settled30, inFlight, scheduled, lines }
  }, [rows, todayISO])

  const columns = React.useMemo<ColumnDef<PaymentRow, unknown>[]>(() => {
    const today = parseLocal(todayISO)
    const cols: ColumnDef<PaymentRow, unknown>[] = [
      {
        id: "payment",
        accessorFn: (r) => r.id,
        header: ({ column }) => <SortHeader column={column} title="Payment" />,
        cell: ({ row }) => <CopyId value={row.original.id} />,
      },
    ]
    if (!isSupplier) {
      cols.push({
        id: "supplier",
        accessorFn: (r) => r.supplier?.name ?? "",
        header: ({ column }) => <SortHeader column={column} title="Supplier" />,
        cell: ({ row }) => <SupplierCell supplier={row.original.supplier} />,
      })
    }
    cols.push(
      {
        id: "date",
        accessorFn: (r) => r.payment.date,
        header: ({ column }) => <SortHeader column={column} title="Date" />,
        cell: ({ row }) => {
          const p = row.original.payment
          const days = daysFromToday(p.date, today)
          return (
            <div className="flex flex-col">
              <span className="text-sm tabular">{formatDate(p.date, "EEE, MMM d")}</span>
              {p.status === "Scheduled" ? (
                <span className="text-[11px] text-muted-foreground">{days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`}</span>
              ) : null}
            </div>
          )
        },
      },
      {
        id: "method",
        accessorFn: (r) => r.payment.method,
        header: "Method",
        cell: ({ row }) => {
          const Icon = row.original.payment.method === "ACH" ? LandmarkIcon : CreditCardIcon
          return (
            <span className="inline-flex items-center gap-1.5 text-sm">
              <Icon className="size-3.5 text-muted-foreground" aria-hidden />
              {row.original.payment.method}
            </span>
          )
        },
      },
      {
        id: "reference",
        accessorFn: (r) => r.payment.reference,
        header: "Reference",
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.payment.reference}</span>,
      },
      {
        id: "invoices",
        accessorFn: (r) => r.lines.length,
        header: ({ column }) => (
          <div className="flex justify-end">
            <SortHeader column={column} title="Invoices" />
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right text-sm tabular">
            {row.original.partial ? `${num(row.original.lines.length)} of ${num(row.original.payment.invoiceIds.length)}` : num(row.original.lines.length)}
          </div>
        ),
      },
      {
        id: "amount",
        accessorFn: (r) => r.scopedAmount,
        header: ({ column }) => (
          <div className="flex justify-end">
            <SortHeader column={column} title="Amount" />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium tabular">{money(row.original.scopedAmount, true)}</span>
            {row.original.partial ? (
              <span className="text-[11px] text-muted-foreground tabular">of {money(row.original.payment.amount, true)}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: "status",
        accessorFn: (r) => r.payment.status,
        header: ({ column }) => <SortHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <StatusBadge tone={PAYMENT_TONE[row.original.payment.status]} pulse={row.original.payment.status === "Processing"}>
            {row.original.payment.status}
          </StatusBadge>
        ),
      }
    )
    return cols
  }, [isSupplier, todayISO])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card px-4 py-3">
        <SummaryStat label="Settled · last 30 days" value={money(summary.settled30)} />
        <SummaryStat label="In flight" value={money(summary.inFlight)} />
        <SummaryStat label="Scheduled" value={money(summary.scheduled)} />
        <div className="flex items-center gap-2 text-sm text-success sm:ml-auto">
          <CheckCheckIcon className="size-4 shrink-0" aria-hidden />
          <span className="font-medium tabular">
            {summary.lines > 0 ? `${num(summary.lines)} of ${num(summary.lines)} remittance lines auto-matched` : "Remittances match by invoice ID"}
          </span>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        onRowClick={(r) => onOpen(r.id)}
        pageSize={20}
        empty={
          <EmptyState
            icon={BanknoteIcon}
            title="No payments yet"
            description={
              isSupplier
                ? "Payments appear here as soon as Compass approves your invoices, each one pre-matched to its invoice IDs."
                : "Approved invoices are paid on the Friday payment run. Payments and their remittance lines will show up here."
            }
            className="m-4 border-0 whitespace-normal"
          />
        }
      />
      {rows.length > 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          Select a payment to see its remittance advice. {plural(rows.length, "payment")} in your scope.
        </p>
      ) : null}
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular">{value}</span>
    </div>
  )
}
