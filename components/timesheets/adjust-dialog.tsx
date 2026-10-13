"use client"

import * as React from "react"
import { CalendarClockIcon, MoonIcon } from "lucide-react"
import { toast } from "sonner"

import { KeyValue } from "@/components/app/misc"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { usePolicies } from "@/hooks/use-demo"
import { formatDate, formatTimeRange, minutesBetween } from "@/lib/dates"
import { hours, money, round2, workerName } from "@/lib/format"
import { payableHours } from "@/lib/rules"
import { useStore } from "@/lib/store"
import type { AdjustmentReason } from "@/lib/types"

import { ADJUSTMENT_REASONS, buildDraft, formatDuration, previewAmount, suggestedAdjustmentReason, type EntryRow } from "./model"
import { ShiftTimeline } from "./shift-timeline"

const REASONS: AdjustmentReason[] = ADJUSTMENT_REASONS.filter((r) => r !== "Worker swap")
const MAX_SHIFT_MINUTES = 16 * 60

interface DialogProps {
  row: EntryRow | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AdjustHoursDialog({ row, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open && !!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        {row ? <AdjustForm row={row} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function signed(value: number, format: (v: number) => string) {
  if (Math.abs(value) < 0.005) return "no change"
  return `${value > 0 ? "+" : "−"}${format(Math.abs(value))}`
}

function AdjustForm({ row, onDone }: { row: EntryRow; onDone: () => void }) {
  const id = React.useId()
  const policies = usePolicies()
  const { entry, request, worker } = row
  const name = worker ? workerName(worker) : "this Pro"

  const [inTime, setInTime] = React.useState(entry.clockIn.slice(11, 16))
  const [outTime, setOutTime] = React.useState(entry.clockOut?.slice(11, 16) ?? request?.endTime ?? "")
  const [breakText, setBreakText] = React.useState(String(entry.breakMinutes))
  const [reason, setReason] = React.useState<AdjustmentReason>(() => {
    const suggested = suggestedAdjustmentReason(entry)
    return REASONS.includes(suggested) ? suggested : "Other"
  })
  const [note, setNote] = React.useState("")
  const [submitted, setSubmitted] = React.useState(false)

  const breakMinutes = breakText.trim() === "" ? 0 : Number(breakText)
  const draft = buildDraft(entry, inTime, outTime, breakMinutes)
  const worked = draft ? minutesBetween(draft.clockIn, draft.clockOut) : 0
  const payable = draft ? payableHours(draft) : 0
  const preview = previewAmount(entry, payable, policies.overtimeMultiplier)

  let timeError: string | undefined
  if (!draft) timeError = "Enter both a clock-in and a clock-out time."
  else if (worked > MAX_SHIFT_MINUTES) timeError = `That's ${formatDuration(worked)} on the clock. Check the clock-out time.`
  let breakError: string | undefined
  if (!Number.isFinite(breakMinutes) || breakMinutes < 0) breakError = "Break can't be negative."
  else if (draft && !timeError && breakMinutes >= worked) breakError = "The break has to be shorter than the time on the clock."
  const noteError = reason === "Other" && !note.trim() ? "Add a short note so the supplier knows what changed." : undefined
  const valid = !timeError && !breakError && !noteError

  const unchanged =
    !!draft && draft.clockIn === entry.clockIn && draft.clockOut === entry.clockOut && draft.breakMinutes === entry.breakMinutes
  const previewRow: EntryRow | null =
    draft && !timeError ? { ...row, entry: { ...entry, clockIn: draft.clockIn, clockOut: draft.clockOut, breakMinutes: draft.breakMinutes } } : null

  const applySchedule = () => {
    if (!request) return
    setInTime(request.startTime)
    setOutTime(request.endTime)
    setBreakText(String(request.breakMinutes))
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (!valid || !draft) return
    const store = useStore.getState()
    store.adjustEntry(entry.id, { clockIn: draft.clockIn, clockOut: draft.clockOut, breakMinutes: draft.breakMinutes }, reason, note)
    const updated = useStore.getState().data.timeEntries.find((e) => e.id === entry.id)
    const total = updated ? updated.regularHours + updated.overtimeHours : payable
    toast.success(unchanged ? `Hours confirmed for ${name}` : `Hours updated for ${name}`, {
      description: `${hours(total)} · ${money(updated?.amount ?? preview.amount, true)} approved. The supplier sees the change and your reason.`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Adjust hours · {name}</DialogTitle>
        <DialogDescription>
          {row.position?.title ?? "Shift"} · {formatDate(entry.date)}
          {request ? ` · scheduled ${formatTimeRange(request.startTime, request.endTime)}` : ""}. Saving approves the entry.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-4">
        <div className="flex flex-col gap-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field data-invalid={!!timeError}>
              <FieldLabel htmlFor={`${id}-in`}>Clock in</FieldLabel>
              <Input id={`${id}-in`} type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} aria-invalid={!!timeError} />
            </Field>
            <Field data-invalid={!!timeError}>
              <FieldLabel htmlFor={`${id}-out`}>Clock out</FieldLabel>
              <Input id={`${id}-out`} type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} aria-invalid={!!timeError} />
            </Field>
            <Field data-invalid={!!breakError}>
              <FieldLabel htmlFor={`${id}-break`}>Break</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`${id}-break`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={5}
                  value={breakText}
                  onChange={(e) => setBreakText(e.target.value)}
                  aria-invalid={!!breakError}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>min</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {timeError || breakError ? (
              <FieldError>{timeError ?? breakError}</FieldError>
            ) : draft?.overnight ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <MoonIcon className="size-3.5" aria-hidden />
                Clock-out rolls to the next day
              </span>
            ) : !entry.clockOut ? (
              <span className="text-xs text-muted-foreground">No clock-out was captured, so we pre-filled the scheduled end. Confirm it against your sign-in sheet.</span>
            ) : (
              <span />
            )}
            {request ? (
              <Button type="button" variant="ghost" size="xs" onClick={applySchedule}>
                <CalendarClockIcon data-icon="inline-start" />
                Use scheduled times
              </Button>
            ) : null}
          </div>
        </div>

        <Field>
          <FieldLabel htmlFor={`${id}-reason`}>Reason</FieldLabel>
          <Select value={reason} onValueChange={(v) => setReason(v as AdjustmentReason)}>
            <SelectTrigger id={`${id}-reason`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field data-invalid={!!noteError && submitted}>
          <FieldLabel htmlFor={`${id}-note`}>
            Note
            {reason === "Other" ? null : <span className="font-normal text-muted-foreground">(optional)</span>}
          </FieldLabel>
          <Textarea
            id={`${id}-note`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Captain's sign-in sheet shows 10:45 PM."
            aria-invalid={!!noteError && submitted}
          />
          {noteError && submitted ? <FieldError>{noteError}</FieldError> : <FieldDescription>Shared with the supplier on the entry&apos;s history.</FieldDescription>}
        </Field>
      </FieldGroup>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
        <span className="text-xs font-medium text-muted-foreground">Preview</span>
        {previewRow ? <ShiftTimeline row={previewRow} /> : null}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KeyValue label="Payable hours">
            <span className="tabular">{hours(payable)}</span>
            <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular">{signed(round2(payable - row.hours), hours)}</span>
          </KeyValue>
          <KeyValue label="Amount">
            <span className="tabular">{money(preview.amount, true)}</span>
            <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular">
              {signed(round2(preview.amount - entry.amount), (v) => money(v, true))}
            </span>
          </KeyValue>
          <KeyValue label="Overtime" className="col-span-2 sm:col-span-1">
            {preview.overtime > 0 ? (
              <span className="tabular">
                {hours(preview.overtime)} at {policies.overtimeMultiplier}×
              </span>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </KeyValue>
        </dl>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitted && !valid}>
          {unchanged ? "Confirm & approve" : "Save & approve"}
        </Button>
      </DialogFooter>
    </form>
  )
}
