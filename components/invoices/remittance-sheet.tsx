"use client"

import * as React from "react"
import Link from "next/link"
import { CheckCheckIcon, CheckIcon, DownloadIcon } from "lucide-react"
import { toast } from "sonner"

import { SupplierMark } from "@/components/app/identity"
import { KeyValue } from "@/components/app/misc"
import { StatusBadge } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatDate } from "@/lib/dates"
import { money, num, plural } from "@/lib/format"

import { downloadFile, formatPeriod, PAYMENT_TONE, remittanceCsv, type PaymentRow } from "./invoice-utils"

interface RemittanceSheetProps {
  row: PaymentRow | null
  onOpenChange: (open: boolean) => void
}

export function RemittanceSheet({ row, onOpenChange }: RemittanceSheetProps) {
  // Keep the last payment on screen while the sheet animates closed.
  const [shown, setShown] = React.useState<PaymentRow | null>(row)
  if (row && row !== shown) setShown(row)
  const current = row ?? shown

  return (
    <Sheet open={!!row} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        {current ? (
          <RemittanceBody row={current} />
        ) : (
          <SheetHeader>
            <SheetTitle>Remittance advice</SheetTitle>
            <SheetDescription>Select a payment to see the invoices it covers.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}

function RemittanceBody({ row }: { row: PaymentRow }) {
  const { payment, supplier } = row
  const hidden = payment.invoiceIds.length - row.lines.length
  const verb = payment.status === "Scheduled" ? "scheduled for" : payment.status === "Processing" ? "sent" : "settled"

  function download() {
    downloadFile(`${payment.id}-remittance.csv`, remittanceCsv(row))
    toast.success(`Downloaded ${payment.id} remittance`, { description: plural(row.lines.length, "line") })
  }

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <div className="flex items-center gap-2">
          <SheetTitle>Remittance advice</SheetTitle>
          <StatusBadge tone={PAYMENT_TONE[payment.status]} pulse={payment.status === "Processing"}>
            {payment.status}
          </StatusBadge>
        </div>
        <SheetDescription>
          {payment.id} · {supplier?.name ?? "Unknown supplier"} · {payment.method} {verb} {formatDate(payment.date, "EEE, MMM d")}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{row.partial ? "Your venues' portion" : "Amount"}</span>
            <span className="font-heading text-3xl font-semibold tracking-tight tabular">{money(row.scopedAmount, true)}</span>
            {row.partial ? (
              <span className="text-xs text-muted-foreground tabular">of {money(payment.amount, true)} total payment</span>
            ) : (
              <span className="text-xs text-muted-foreground">Net of the supplier-funded program fee</span>
            )}
          </div>
          <SupplierMark supplier={supplier} size="lg" />
        </div>

        <dl className="grid grid-cols-2 gap-4 rounded-lg border p-3">
          <KeyValue label="Payment date">{formatDate(payment.date, "EEE, MMM d, yyyy")}</KeyValue>
          <KeyValue label="Method">{payment.method}</KeyValue>
          <KeyValue label="Reference">
            <span className="font-mono text-xs">{payment.reference}</span>
          </KeyValue>
          <KeyValue label="Invoices">{num(payment.invoiceIds.length)}</KeyValue>
        </dl>

        <div className="flex gap-3 rounded-lg bg-success/12 p-3 dark:bg-success/18">
          <CheckCheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-success">Auto-matched · 100%</span>
            <span className="text-xs text-foreground/80">
              No 3-tier fuzzy matching, remittance lines reference Mise invoice IDs directly.
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
            <span>Remittance lines</span>
            <span>Net amount</span>
          </div>
          <ul className="flex flex-col divide-y rounded-lg border">
            {row.lines.map((l) => (
              <li key={l.invoice.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link
                    href={`/invoices/${l.invoice.id}`}
                    className="w-fit font-mono text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {l.invoice.id}
                  </Link>
                  <span className="truncate text-xs text-muted-foreground">
                    {l.venue?.shortName ?? "Unknown venue"} · {formatPeriod(l.invoice.periodStart, l.invoice.periodEnd)} · PO {l.invoice.poNumber}
                  </span>
                </div>
                <span className="text-sm font-medium tabular">{money(l.net, true)}</span>
                <StatusBadge tone="success" dot={false}>
                  <CheckIcon />
                  Matched
                </StatusBadge>
              </li>
            ))}
          </ul>
          {hidden > 0 ? (
            <p className="px-1 text-xs text-muted-foreground">
              {plural(hidden, "more invoice")} on this payment {hidden === 1 ? "belongs" : "belong"} to venues outside your scope.
            </p>
          ) : null}
        </div>
      </div>

      <SheetFooter className="flex-row justify-end border-t">
        <Button variant="outline" onClick={download}>
          <DownloadIcon data-icon="inline-start" />
          Download CSV
        </Button>
      </SheetFooter>
    </>
  )
}
