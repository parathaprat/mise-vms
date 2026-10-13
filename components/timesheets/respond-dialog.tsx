"use client"

import * as React from "react"
import { toast } from "sonner"

import { TimeAgo } from "@/components/app/misc"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { formatDate } from "@/lib/dates"
import { workerName } from "@/lib/format"
import { useStore } from "@/lib/store"

import { ClockedTimes } from "./entry-parts"
import { disputeReplySuggestions, type EntryRow } from "./model"

interface DialogProps {
  row: EntryRow | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RespondDialog({ row, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open && !!row?.entry.dispute} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {row?.entry.dispute ? <RespondForm row={row} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function RespondForm({ row, onDone }: { row: EntryRow; onDone: () => void }) {
  const id = React.useId()
  const { entry, worker, venue } = row
  const dispute = entry.dispute!
  const [note, setNote] = React.useState(dispute.response?.note ?? "")
  const [submitted, setSubmitted] = React.useState(false)
  const suggestions = disputeReplySuggestions(row)
  const error = note.trim().length < 5 ? "Write a short reply. The venue decides based on it." : undefined

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (error) return
    useStore.getState().respondToDispute(entry.id, note)
    toast.success(`Response sent to ${venue?.shortName ?? "the venue"}`, {
      description: `${dispute.by} is notified and can approve, adjust or reassign the hours.`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Respond to dispute · {entry.id}</DialogTitle>
        <DialogDescription>
          {worker ? workerName(worker) : "Pro"} · {row.position?.title ?? "Shift"} · {formatDate(entry.date)} · <ClockedTimes entry={entry} />
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{dispute.by}</span> · {dispute.reason}
          </span>
          <TimeAgo value={dispute.at} />
        </div>
        <p className="text-sm text-pretty">{dispute.note}</p>
      </div>

      <FieldGroup className="gap-3">
        <Field data-invalid={!!error && submitted}>
          <FieldLabel htmlFor={`${id}-note`}>Your reply</FieldLabel>
          <Textarea
            id={`${id}-note`}
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain what happened on site…"
            aria-invalid={!!error && submitted}
          />
          {error && submitted ? <FieldError>{error}</FieldError> : <FieldDescription>Posted on the entry&apos;s dispute thread.</FieldDescription>}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Suggested replies</span>
          <div className="flex flex-col gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setNote(s)}
                className="rounded-lg border bg-background px-3 py-2 text-left text-xs text-pretty transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{dispute.response ? "Update response" : "Send response"}</Button>
      </DialogFooter>
    </form>
  )
}
