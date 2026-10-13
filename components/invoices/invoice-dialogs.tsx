"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatDate } from "@/lib/dates"
import { money, round2 } from "@/lib/format"
import { getActions } from "@/lib/store"
import type { Invoice, InvoiceDispute, InvoiceLine } from "@/lib/types"

import { DISPUTE_REASONS, LINE_KIND_LABEL } from "./invoice-utils"

function LineSummary({ line }: { line: InvoiceLine }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 px-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{line.description}</span>
        <span className="text-xs text-muted-foreground">
          {LINE_KIND_LABEL[line.kind]}
          {line.date ? ` · ${formatDate(line.date, "EEE, MMM d")}` : ""}
          {line.kind === "labor" || line.kind === "overtime" ? ` · ${line.quantity}h × ${money(line.rate, true)}` : ""}
        </span>
      </div>
      <span className="text-sm font-semibold tabular">{money(line.amount, true)}</span>
    </div>
  )
}

// Dispute a line --------------------------------------------------------------

interface DisputeLineDialogProps {
  invoice: Invoice
  line: InvoiceLine | null
  supplierName: string
  onOpenChange: (open: boolean) => void
}

export function DisputeLineDialog({ invoice, line, supplierName, onOpenChange }: DisputeLineDialogProps) {
  return (
    <Dialog open={!!line} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dispute line</DialogTitle>
          <DialogDescription>
            {supplierName} is notified right away and {invoice.id} is held from approval until the dispute is resolved.
          </DialogDescription>
        </DialogHeader>
        {line ? <DisputeLineForm key={line.id} invoice={invoice} line={line} supplierName={supplierName} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function DisputeLineForm({ invoice, line, supplierName, onDone }: { invoice: Invoice; line: InvoiceLine; supplierName: string; onDone: () => void }) {
  const [reason, setReason] = React.useState<string>("")
  const [note, setNote] = React.useState("")
  const [submitted, setSubmitted] = React.useState(false)
  const reasonError = submitted && !reason
  const noteError = submitted && reason === "Other" && note.trim().length === 0

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!reason || (reason === "Other" && note.trim().length === 0)) return
    getActions().disputeInvoiceLine(invoice.id, line.id, reason, note)
    toast.success("Line disputed", { description: `${supplierName} has been notified. ${invoice.id} is on hold until it's resolved.` })
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <LineSummary line={line} />
      <FieldGroup className="gap-4">
        <Field data-invalid={reasonError || undefined}>
          <FieldLabel htmlFor="dispute-reason">Reason</FieldLabel>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger id="dispute-reason" className="w-full" aria-invalid={reasonError || undefined}>
              <SelectValue placeholder="Choose a reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {DISPUTE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {reasonError ? <FieldError>Pick the reason that best fits.</FieldError> : null}
        </Field>
        <Field data-invalid={noteError || undefined}>
          <FieldLabel htmlFor="dispute-note">Note for {supplierName}</FieldLabel>
          <Textarea
            id="dispute-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. We scheduled 6 Pros for this stand, but 8 are billed."
            rows={3}
            aria-invalid={noteError || undefined}
          />
          {noteError ? (
            <FieldError>Add a short note so the supplier knows what to check.</FieldError>
          ) : (
            <FieldDescription>Specifics resolve faster: reference Pros, times or the schedule.</FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive">
          Dispute line
        </Button>
      </DialogFooter>
    </form>
  )
}

// Resolve a dispute -----------------------------------------------------------

interface ResolveDisputeDialogProps {
  invoice: Invoice
  dispute: InvoiceDispute | null
  onOpenChange: (open: boolean) => void
}

export function ResolveDisputeDialog({ invoice, dispute, onOpenChange }: ResolveDisputeDialogProps) {
  const line = dispute ? invoice.lines.find((l) => l.id === dispute.lineId) : undefined
  return (
    <Dialog open={!!dispute} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve dispute</DialogTitle>
          <DialogDescription>
            Issue a credit against the disputed line, or resolve with no credit if the hours stand. A credit adds a line to {invoice.id}.
          </DialogDescription>
        </DialogHeader>
        {dispute ? <ResolveDisputeForm key={dispute.id} invoice={invoice} dispute={dispute} line={line} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ResolveDisputeForm({ invoice, dispute, line, onDone }: { invoice: Invoice; dispute: InvoiceDispute; line?: InvoiceLine; onDone: () => void }) {
  const [credit, setCredit] = React.useState("0")
  const [note, setNote] = React.useState("")
  const maxCredit = Math.max(0, line?.amount ?? 0)
  const parsed = credit.trim() === "" ? 0 : Number(credit)
  const error = !Number.isFinite(parsed)
    ? "Enter a dollar amount."
    : parsed < 0
      ? "Credits can't be negative."
      : parsed > maxCredit + 0.001
        ? `A credit can't exceed the line amount (${money(maxCredit, true)}).`
        : null
  const othersOpen = invoice.disputes.some((d) => d.status === "Open" && d.id !== dispute.id)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (error) return
    const amount = round2(parsed)
    getActions().resolveInvoiceDispute(invoice.id, dispute.id, amount, note.trim() || undefined)
    toast.success("Dispute resolved", {
      description: `${amount > 0 ? `${money(amount, true)} credit added to ${invoice.id}.` : "Resolved with no credit."}${othersOpen ? " Other disputes are still open." : " The invoice is back in Pending approval."}`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{dispute.reason}</span>
          <span className="text-xs text-muted-foreground">{dispute.by}</span>
        </div>
        {dispute.note ? <p className="text-sm text-muted-foreground">“{dispute.note}”</p> : null}
        {line ? (
          <div className="flex items-center justify-between gap-3 border-t pt-2 text-xs text-muted-foreground">
            <span className="truncate">{line.description}</span>
            <span className="font-medium text-foreground tabular">{money(line.amount, true)}</span>
          </div>
        ) : null}
      </div>
      <FieldGroup className="gap-4">
        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="credit-amount">Credit amount</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>$</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="credit-amount"
              inputMode="decimal"
              value={credit}
              onChange={(e) => setCredit(e.target.value.replace(/[^0-9.]/g, ""))}
              aria-invalid={!!error || undefined}
              className="tabular"
            />
          </InputGroup>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="xs" onClick={() => setCredit("0")}>
              No credit
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={() => setCredit(round2(maxCredit / 2).toFixed(2))} disabled={maxCredit === 0}>
              Half line · {money(round2(maxCredit / 2), true)}
            </Button>
            <Button type="button" variant="outline" size="xs" onClick={() => setCredit(maxCredit.toFixed(2))} disabled={maxCredit === 0}>
              Full line · {money(maxCredit, true)}
            </Button>
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="resolve-note">Resolution note</FieldLabel>
          <Textarea
            id="resolve-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Two Pros were double-scanned at the kiosk, crediting 7.5h."
            rows={3}
          />
          <FieldDescription>Shown on the credit line and in the activity log.</FieldDescription>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!!error}>
          {parsed > 0 && !error ? `Resolve with ${money(round2(parsed), true)} credit` : "Resolve dispute"}
        </Button>
      </DialogFooter>
    </form>
  )
}
