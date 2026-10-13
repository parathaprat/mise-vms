"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeftIcon, BadgeCheckIcon, CheckIcon, DownloadIcon, FileDownIcon, FileSearchIcon, LockIcon } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@/components/app/misc"
import { PageHeader } from "@/components/app/page-header"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useData, useLookups, useNow, usePersona } from "@/hooks/use-demo"
import { formatDate } from "@/lib/dates"
import { money, plural } from "@/lib/format"
import { lineTotals, type InvoiceTotals } from "@/lib/invoice"
import { invoiceInScope } from "@/lib/selectors"
import { getActions } from "@/lib/store"
import type { Invoice, InvoiceDispute, InvoiceLine, TimeEntry, TipBatch } from "@/lib/types"

import { DisputeLineDialog, ResolveDisputeDialog } from "./invoice-dialogs"
import { InvoiceDocument } from "./invoice-document"
import { InvoiceTrustCard } from "./invoice-trust-card"
import type { LineActions } from "./invoice-line-row"
import { DisputesCard, PaymentCard, StatusTimelineCard, TraceabilityCard } from "./invoice-sidebar"
import { downloadFile, formatPeriod, invoiceLinesCsv, nextPaymentDate, paymentForInvoice } from "./invoice-utils"

function BackLink() {
  return (
    <Link href="/invoices" className="inline-flex items-center gap-1 rounded-sm hover:text-foreground">
      <ArrowLeftIcon className="size-3" aria-hidden />
      Invoices
    </Link>
  )
}

function BackButton() {
  return (
    <Button variant="outline" asChild>
      <Link href="/invoices">
        <ArrowLeftIcon data-icon="inline-start" />
        Back to invoices
      </Link>
    </Button>
  )
}

export function InvoiceDetail({ id }: { id: string }) {
  const invoice = useData((d) => d.invoices.find((i) => i.id === id))
  const persona = usePersona()

  if (!invoice) {
    return (
      <>
        <PageHeader eyebrow={<BackLink />} title="Invoice not found" />
        <EmptyState
          icon={FileSearchIcon}
          title={`We couldn't find ${id}`}
          description="The link may have a typo, or the invoice was removed when the demo data was reset."
          action={<BackButton />}
        />
      </>
    )
  }

  if (!invoiceInScope(invoice, persona)) {
    return (
      <>
        <PageHeader eyebrow={<BackLink />} title={<span className="font-mono">{invoice.id}</span>} />
        <EmptyState
          icon={LockIcon}
          title="This invoice is outside your scope"
          description={
            persona.id === "supplier"
              ? "It was issued by another supplier. Switch personas to view it."
              : "It belongs to a venue you don't manage. Switch personas to view it."
          }
          action={<BackButton />}
        />
      </>
    )
  }

  return <InvoiceDetailBody invoice={invoice} />
}

function InvoiceDetailBody({ invoice }: { invoice: Invoice }) {
  const persona = usePersona()
  const lookups = useLookups()
  const now = useNow()
  const msaFeePct = useData((d) => d.policies.msaFeePct)
  const timeEntries = useData((d) => d.timeEntries)
  const tipBatches = useData((d) => d.tipBatches)
  const payments = useData((d) => d.payments)
  const [disputeLine, setDisputeLine] = React.useState<InvoiceLine | null>(null)
  const [resolving, setResolving] = React.useState<InvoiceDispute | null>(null)

  const supplier = lookups.suppliers.get(invoice.supplierId)
  const venue = lookups.venues.get(invoice.venueId)
  const totals = React.useMemo(() => lineTotals(invoice.lines, msaFeePct), [invoice.lines, msaFeePct])

  const entryMap = React.useMemo(() => {
    const ids = new Set(invoice.lines.flatMap((l) => l.timeEntryIds))
    const map = new Map<string, TimeEntry>()
    for (const e of timeEntries) if (ids.has(e.id)) map.set(e.id, e)
    return map
  }, [invoice.lines, timeEntries])

  const tipMap = React.useMemo(() => {
    const ids = new Set(invoice.lines.map((l) => l.tipBatchId).filter((x): x is string => !!x))
    const map = new Map<string, TipBatch>()
    for (const b of tipBatches) if (ids.has(b.id)) map.set(b.id, b)
    return map
  }, [invoice.lines, tipBatches])

  const payment = React.useMemo(() => paymentForInvoice(invoice, payments), [invoice, payments])
  const workerSupplier = React.useCallback((workerId: string) => lookups.workers.get(workerId)?.supplierId, [lookups.workers])

  const isBuyer = persona.id === "venue" || persona.id === "program"
  const awaiting = invoice.status === "Pending approval" || invoice.status === "Disputed"
  const openDisputes = invoice.disputes.filter((d) => d.status === "Open").length
  const canResolve = persona.id === "supplier" || persona.id === "program"
  const payDate = nextPaymentDate(now)

  const lineActions = React.useMemo<LineActions>(
    () => ({
      canDispute: isBuyer,
      disputeLockedReason: awaiting
        ? undefined
        : invoice.status === "Paid"
          ? "Locked: invoice is paid"
          : invoice.status === "Approved"
            ? "Locked after approval"
            : "Available once the invoice is issued",
      onDispute: setDisputeLine,
    }),
    [isBuyer, awaiting, invoice.status]
  )

  function approve() {
    getActions().approveInvoice(invoice.id)
    toast.success(`${invoice.id} approved`, {
      description: `${money(totals.netToSupplier, true)} scheduled for ${formatDate(payDate, "EEEE, MMM d")} via ACH.`,
    })
  }

  function exportCsv() {
    downloadFile(`${invoice.id}-lines.csv`, invoiceLinesCsv(invoice, lookups))
    toast.success(`Exported ${invoice.id}`, { description: `${plural(invoice.lines.length, "line")} with cost centers, GL codes and timesheet IDs.` })
  }

  return (
    <>
      <PageHeader
        className="print:hidden"
        eyebrow={<BackLink />}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono tracking-tight">{invoice.id}</span>
            <InvoiceStatusBadge status={invoice.status} />
          </span>
        }
        description={`${supplier?.name ?? "Unknown supplier"} · ${venue?.name ?? "Unknown venue"} · ${formatPeriod(invoice.periodStart, invoice.periodEnd)}`}
        actions={
          <div data-print="hide" className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <FileDownIcon data-icon="inline-start" />
              Download PDF
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <DownloadIcon data-icon="inline-start" />
              Export CSV
            </Button>
            {isBuyer && awaiting ? (
              <ApproveAction
                invoice={invoice}
                totals={totals}
                msaFeePct={msaFeePct}
                supplierName={supplier?.name ?? "the supplier"}
                venueName={venue?.name ?? "this venue"}
                payDate={payDate}
                blocked={openDisputes > 0}
                onApprove={approve}
              />
            ) : null}
          </div>
        }
      />

      <div className="mb-6 print:hidden">
        <InvoiceTrustCard
          invoice={invoice}
          entryMap={entryMap}
          lookups={lookups}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px] print:block">
        <InvoiceDocument
          invoice={invoice}
          supplier={supplier}
          venue={venue}
          totals={totals}
          msaFeePct={msaFeePct}
          lookups={lookups}
          entryMap={entryMap}
          tipMap={tipMap}
          actions={lineActions}
        />
        <aside className="flex flex-col gap-4" data-print="hide" aria-label="Invoice status and traceability">
          <StatusTimelineCard invoice={invoice} payment={payment} payDate={payDate} />
          <PaymentCard invoice={invoice} payment={payment} totals={totals} payDate={payDate} />
          <DisputesCard invoice={invoice} canResolve={canResolve} onResolve={setResolving} />
          <TraceabilityCard invoice={invoice} entryMap={entryMap} tipMap={tipMap} workerSupplier={workerSupplier} />
        </aside>
      </div>

      <DisputeLineDialog
        invoice={invoice}
        line={disputeLine}
        supplierName={supplier?.shortName ?? "The supplier"}
        onOpenChange={(open) => {
          if (!open) setDisputeLine(null)
        }}
      />
      <ResolveDisputeDialog
        invoice={invoice}
        dispute={resolving}
        onOpenChange={(open) => {
          if (!open) setResolving(null)
        }}
      />
    </>
  )
}

interface ApproveActionProps {
  invoice: Invoice
  totals: InvoiceTotals
  msaFeePct: number
  supplierName: string
  venueName: string
  payDate: Date
  blocked: boolean
  onApprove: () => void
}

function ApproveAction({ invoice, totals, msaFeePct, supplierName, venueName, payDate, blocked, onApprove }: ApproveActionProps) {
  if (blocked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <Button disabled>
              <CheckIcon data-icon="inline-start" />
              Approve
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Resolve open disputes before approving</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button>
          <CheckIcon data-icon="inline-start" />
          Approve
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-success/12 text-success dark:bg-success/18">
            <BadgeCheckIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Approve {invoice.id}?</AlertDialogTitle>
          <AlertDialogDescription>
            {money(totals.totalDue, true)} from {supplierName} for {venueName}. A payment of {money(totals.netToSupplier, true)}, net of
            the {msaFeePct}% supplier-funded program fee, goes out {formatDate(payDate, "EEEE, MMM d")} via ACH.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onApprove}>Approve &amp; schedule</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
