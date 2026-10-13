"use client"

import * as React from "react"
import { ArrowLeftRightIcon, LightbulbIcon, PencilIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { formatDate } from "@/lib/dates"
import { hours, money, workerName } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { DisputeReason } from "@/lib/types"

import { ClockedTimes } from "./entry-parts"
import { DISPUTE_PLACEHOLDER, DISPUTE_REASONS, type EntryRow } from "./model"

interface DisputeDialogProps {
  row: EntryRow | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Offer a faster fix when the dispute reason is something the venue can correct directly. */
  onSwitch: (action: "adjust" | "reassign", row: EntryRow) => void
}

export function DisputeDialog({ row, open, onOpenChange, onSwitch }: DisputeDialogProps) {
  return (
    <Dialog open={open && !!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {row ? <DisputeForm row={row} onDone={() => onOpenChange(false)} onSwitch={onSwitch} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function DisputeForm({ row, onDone, onSwitch }: { row: EntryRow; onDone: () => void; onSwitch: DisputeDialogProps["onSwitch"] }) {
  const id = React.useId()
  const { entry, worker, supplier } = row
  const name = worker ? workerName(worker) : "this Pro"
  const supplierName = supplier?.shortName ?? "The supplier"
  const [reason, setReason] = React.useState<DisputeReason>("Hours don't match sign-in")
  const [note, setNote] = React.useState("")
  const [submitted, setSubmitted] = React.useState(false)
  const noteError = note.trim().length < 5 ? "Tell the supplier what doesn't match: they'll reply on this thread." : undefined

  const shortcut =
    reason === "Hours don't match sign-in"
      ? { action: "adjust" as const, icon: PencilIcon, label: "Adjust instead", text: "Know the right times? Fix them yourself and approve in one step, no back-and-forth." }
      : reason === "Worker swap"
        ? { action: "reassign" as const, icon: ArrowLeftRightIcon, label: "Reassign instead", text: "Know who actually worked? Move the hours to them directly. No zero-out, no resubmission." }
        : null

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (noteError) return
    useStore.getState().disputeEntry(entry.id, reason, note)
    toast.success(`Dispute sent to ${supplierName}`, {
      description: `${hours(row.hours)} · ${money(entry.amount, true)} for ${name} stay off the invoice until it's resolved.`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Dispute hours · {name}</DialogTitle>
        <DialogDescription>
          {row.position?.title ?? "Shift"} · {formatDate(entry.date)} · <ClockedTimes entry={entry} />
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={`${id}-reason`}>Reason</FieldLabel>
          <Select value={reason} onValueChange={(v) => setReason(v as DisputeReason)}>
            <SelectTrigger id={`${id}-reason`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISPUTE_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {shortcut ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
            <LightbulbIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="flex-1 text-xs text-muted-foreground">{shortcut.text}</p>
            <Button type="button" variant="outline" size="xs" onClick={() => onSwitch(shortcut.action, row)}>
              <shortcut.icon data-icon="inline-start" />
              {shortcut.label}
            </Button>
          </div>
        ) : null}

        <Field data-invalid={!!noteError && submitted}>
          <FieldLabel htmlFor={`${id}-note`}>What doesn&apos;t match?</FieldLabel>
          <Textarea
            id={`${id}-note`}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={DISPUTE_PLACEHOLDER[reason]}
            aria-invalid={!!noteError && submitted}
          />
          {noteError && submitted ? (
            <FieldError>{noteError}</FieldError>
          ) : (
            <FieldDescription>
              {supplierName} is notified right away. {hours(row.hours)} · {money(entry.amount, true)} stay off the invoice until it&apos;s resolved.
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive">
          Send dispute
        </Button>
      </DialogFooter>
    </form>
  )
}
