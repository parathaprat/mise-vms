"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "motion/react"
import { CheckCheckIcon, FileSearchIcon, SearchIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"

import { DataTable, SortHeader, type ColumnDef, type RowSelectionState } from "@/components/app/data-table"
import { SupplierCell, SupplierMark, VenueCell } from "@/components/app/identity"
import { CopyId, EmptyState } from "@/components/app/misc"
import { InvoiceStatusBadge } from "@/components/app/status-badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { daysFromToday, formatDate, parseLocal } from "@/lib/dates"
import { hours, money, num, plural } from "@/lib/format"
import { getActions } from "@/lib/store"
import type { Persona, Supplier, Venue } from "@/lib/types"
import { cn } from "@/lib/utils"

import { formatPeriod, matchesStatusFilter, STATUS_FILTERS, type InvoiceRow, type InvoiceStatusFilter } from "./invoice-utils"

interface InvoiceTableProps {
  rows: InvoiceRow[]
  persona: Persona
  status: InvoiceStatusFilter
  onStatusChange: (status: InvoiceStatusFilter) => void
  todayISO: string
  onPaymentReleased: (paymentId: string) => void
}

/** Approved and not already in flight, releasing an in-flight invoice again would pay it twice. */
function canReleaseRow(r: InvoiceRow): boolean {
  return r.invoice.status === "Approved" && r.payment?.status !== "Processing"
}

function RightHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end">{children}</div>
}

export function InvoiceTable({ rows, persona, status, onStatusChange, todayISO, onPaymentReleased }: InvoiceTableProps) {
  const router = useRouter()
  const isSupplier = persona.id === "supplier"
  const canRelease = persona.id === "program"

  const [supplierFilter, setSupplierFilter] = React.useState("all")
  const [venueFilter, setVenueFilter] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const [selection, setSelection] = React.useState<RowSelectionState>({})

  const supplierOptions = React.useMemo(() => {
    const map = new Map<string, Supplier>()
    for (const r of rows) if (r.supplier) map.set(r.supplier.id, r.supplier)
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const venueOptions = React.useMemo(() => {
    const map = new Map<string, Venue>()
    for (const r of rows) if (r.venue) map.set(r.venue.id, r.venue)
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  // Options change with the persona, so an old pick silently falls back to "all".
  const supplierValue = supplierOptions.some((s) => s.id === supplierFilter) ? supplierFilter : "all"
  const venueValue = venueOptions.some((v) => v.id === venueFilter) ? venueFilter : "all"
  const query = search.trim().toLowerCase()

  const base = React.useMemo(
    () =>
      rows.filter((r) => {
        if (supplierValue !== "all" && r.invoice.supplierId !== supplierValue) return false
        if (venueValue !== "all" && r.invoice.venueId !== venueValue) return false
        if (!query) return true
        return (
          r.id.toLowerCase().includes(query) ||
          r.invoice.poNumber.toLowerCase().includes(query) ||
          (r.venue?.name.toLowerCase().includes(query) ?? false) ||
          (r.supplier?.name.toLowerCase().includes(query) ?? false)
        )
      }),
    [rows, supplierValue, venueValue, query]
  )

  const counts = React.useMemo(() => {
    const c: Record<InvoiceStatusFilter, number> = { all: base.length, "needs-approval": 0, disputed: 0, approved: 0, paid: 0 }
    for (const r of base) {
      for (const f of STATUS_FILTERS) {
        if (f.value !== "all" && matchesStatusFilter(r.invoice.status, f.value)) c[f.value]++
      }
    }
    return c
  }, [base])

  const filtered = React.useMemo(() => base.filter((r) => matchesStatusFilter(r.invoice.status, status)), [base, status])

  const selected = React.useMemo(
    () => (canRelease ? filtered.filter((r) => selection[r.id] && canReleaseRow(r)) : []),
    [canRelease, filtered, selection]
  )

  const columns = React.useMemo<ColumnDef<InvoiceRow, unknown>[]>(() => {
    const today = parseLocal(todayISO)
    const cols: ColumnDef<InvoiceRow, unknown>[] = [
      {
        id: "invoice",
        accessorFn: (r) => r.id,
        header: ({ column }) => <SortHeader column={column} title="Invoice" />,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <CopyId value={row.original.id} />
            <span className="font-mono text-[11px] text-muted-foreground">PO {row.original.invoice.poNumber}</span>
          </div>
        ),
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
        id: "venue",
        accessorFn: (r) => r.venue?.name ?? "",
        header: ({ column }) => <SortHeader column={column} title="Venue" />,
        cell: ({ row }) => <VenueCell venue={row.original.venue} subtitle={row.original.venue?.brand} />,
      },
      {
        id: "period",
        accessorFn: (r) => r.invoice.periodStart,
        header: ({ column }) => <SortHeader column={column} title="Period" />,
        cell: ({ row }) => (
          <span className="text-sm tabular">{formatPeriod(row.original.invoice.periodStart, row.original.invoice.periodEnd)}</span>
        ),
      },
      {
        id: "lines",
        accessorFn: (r) => r.invoice.lines.length,
        header: ({ column }) => (
          <RightHeader>
            <SortHeader column={column} title="Lines" />
          </RightHeader>
        ),
        cell: ({ row }) => <div className="text-right text-sm tabular text-muted-foreground">{num(row.original.invoice.lines.length)}</div>,
      },
      {
        id: "hours",
        accessorFn: (r) => r.totals.hours,
        header: ({ column }) => (
          <RightHeader>
            <SortHeader column={column} title="Hours" />
          </RightHeader>
        ),
        cell: ({ row }) => <div className="text-right text-sm tabular">{hours(row.original.totals.hours)}</div>,
      },
      {
        id: "amount",
        accessorFn: (r) => r.amount,
        header: ({ column }) => (
          <RightHeader>
            <SortHeader column={column} title={isSupplier ? "Net to you" : "Total due"} />
          </RightHeader>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium tabular">{money(row.original.amount, true)}</span>
            {isSupplier ? (
              <span className="text-[11px] text-muted-foreground tabular">of {money(row.original.totals.totalDue, true)}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: "status",
        accessorFn: (r) => r.invoice.status,
        header: ({ column }) => <SortHeader column={column} title="Status" />,
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex flex-col items-start gap-1">
              <div className="flex items-center gap-1.5">
                <InvoiceStatusBadge status={r.invoice.status} />
                {r.invoice.status === "Paid" && r.payment ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex size-5 items-center justify-center rounded-full bg-success/12 text-success dark:bg-success/18">
                        <CheckCheckIcon className="size-3" aria-label="Auto-matched" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Auto-matched to {r.payment.id}</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
              {r.invoice.status === "Approved" && r.payment && r.payment.status !== "Settled" ? (
                <span className="text-[11px] text-muted-foreground">
                  {r.payment.status === "Processing" ? `${r.payment.method} in flight` : `Pays ${formatDate(r.payment.date, "EEE, MMM d")}`}
                </span>
              ) : null}
            </div>
          )
        },
      },
      {
        id: "due",
        accessorFn: (r) => r.invoice.dueDate,
        header: ({ column }) => <SortHeader column={column} title="Due" />,
        cell: ({ row }) => {
          const r = row.original
          if (r.invoice.status === "Paid") {
            return <span className="text-sm text-muted-foreground">Paid {r.invoice.paidAt ? formatDate(r.invoice.paidAt, "MMM d") : ""}</span>
          }
          const days = daysFromToday(r.invoice.dueDate, today)
          return (
            <div className="flex flex-col">
              <span className={cn("text-sm tabular", r.overdue && "font-medium text-destructive")}>{formatDate(r.invoice.dueDate, "MMM d")}</span>
              <span className={cn("text-[11px]", r.overdue ? "text-destructive" : "text-muted-foreground")}>
                {days < 0 ? `${plural(-days, "day")} overdue` : days === 0 ? "Due today" : `in ${plural(days, "day")}`}
              </span>
            </div>
          )
        },
      }
    )
    return cols
  }, [isSupplier, todayISO])

  const hasFilters = supplierValue !== "all" || venueValue !== "all" || query.length > 0 || status !== "all"

  function resetFilters() {
    setSupplierFilter("all")
    setVenueFilter("all")
    setSearch("")
    onStatusChange("all")
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={status}
          onValueChange={(v) => {
            if (v) onStatusChange(v as InvoiceStatusFilter)
          }}
          className="flex-wrap"
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value} className="gap-1.5 px-2.5">
              {f.label}
              <span className="text-xs text-muted-foreground tabular">{counts[f.value]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex flex-wrap items-center gap-2">
          {!isSupplier && supplierOptions.length > 1 ? (
            <Select value={supplierValue} onValueChange={setSupplierFilter}>
              <SelectTrigger size="sm" className="min-w-40" aria-label="Filter by supplier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All suppliers</SelectItem>
                  {supplierOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
          {venueOptions.length > 1 ? (
            <Select value={venueValue} onValueChange={setVenueFilter}>
              <SelectTrigger size="sm" className="min-w-40" aria-label="Filter by venue">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All venues</SelectItem>
                  {venueOptions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
          <InputGroup className="h-7 w-full sm:w-60">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice #, PO or venue" aria-label="Search invoices" />
          </InputGroup>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/invoices/${r.id}`)}
        enableSelection={canRelease}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        canSelectRow={canReleaseRow}
        pageSize={20}
        empty={
          <EmptyState
            icon={FileSearchIcon}
            title={rows.length === 0 ? "No invoices yet" : "No invoices match"}
            description={
              rows.length === 0
                ? "Invoices are issued every Monday from approved timesheets and tips."
                : "Try another status, supplier or search term."
            }
            action={
              hasFilters && rows.length > 0 ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
            className="m-4 border-0 whitespace-normal"
          />
        }
      />

      <AnimatePresence>
        {selected.length > 0 ? (
          <ReleaseBar key="release" selected={selected} onClear={() => setSelection({})} onReleased={onPaymentReleased} />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function ReleaseBar({ selected, onClear, onReleased }: { selected: InvoiceRow[]; onClear: () => void; onReleased: (paymentId: string) => void }) {
  const bySupplier = React.useMemo(() => {
    const map = new Map<string, { supplier?: Supplier; count: number; net: number }>()
    for (const r of selected) {
      const g = map.get(r.invoice.supplierId) ?? { supplier: r.supplier, count: 0, net: 0 }
      g.count++
      g.net += r.totals.netToSupplier
      map.set(r.invoice.supplierId, g)
    }
    return [...map.values()].sort((a, b) => b.net - a.net)
  }, [selected])
  const net = bySupplier.reduce((s, g) => s + g.net, 0)
  const supplierLabel = bySupplier.length === 1 ? (bySupplier[0].supplier?.shortName ?? "1 supplier") : plural(bySupplier.length, "supplier")

  function release() {
    const ids = selected.map((r) => r.id)
    const paymentId = getActions().payInvoices(ids)
    onClear()
    if (!paymentId) {
      toast.error("Nothing to release", { description: "The selected invoices are no longer approved." })
      return
    }
    toast.success(bySupplier.length === 1 ? `Payment ${paymentId} released` : `${bySupplier.length} payments released`, {
      description: `${money(net, true)} via ACH · ${plural(ids.length, "invoice")} auto-matched by invoice ID.`,
      action: { label: "View", onClick: () => onReleased(paymentId) },
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="sticky bottom-4 z-20 mx-auto flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-xl border bg-popover/95 p-2 pl-4 text-popover-foreground shadow-lg backdrop-blur-md"
      data-print="hide"
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{plural(selected.length, "approved invoice")} selected</span>
        <span className="text-xs text-muted-foreground tabular">
          {money(net, true)} net to {supplierLabel} · ACH today
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm">
              <SendIcon data-icon="inline-start" />
              Release payment
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-primary/10 text-primary">
                <SendIcon />
              </AlertDialogMedia>
              <AlertDialogTitle>Release {money(net, true)} today?</AlertDialogTitle>
              <AlertDialogDescription>
                Sends {bySupplier.length === 1 ? "one ACH payment" : `${bySupplier.length} ACH payments`} covering{" "}
                {plural(selected.length, "invoice")}. Remittance lines reference Mise invoice IDs, so suppliers match them automatically.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="flex flex-col divide-y rounded-lg border">
              {bySupplier.map((g) => (
                <li key={g.supplier?.id ?? "unknown"} className="flex items-center gap-2.5 px-3 py-2">
                  <SupplierMark supplier={g.supplier} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm">{g.supplier?.name ?? "Unknown supplier"}</span>
                  <span className="text-xs text-muted-foreground tabular">{plural(g.count, "invoice")}</span>
                  <span className="text-sm font-medium tabular">{money(g.net, true)}</span>
                </li>
              ))}
            </ul>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={release}>Release payment</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </motion.div>
  )
}
