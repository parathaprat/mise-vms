"use client"

import * as React from "react"
import { ArrowRightIcon, SearchIcon, UserRoundSearchIcon } from "lucide-react"
import { toast } from "sonner"

import { WorkerAvatar, WorkerCell } from "@/components/app/identity"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { useData } from "@/hooks/use-demo"
import { formatDate } from "@/lib/dates"
import { hours, money, workerLegalName, workerName } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { Worker } from "@/lib/types"

import { ClockedTimes } from "./entry-parts"
import type { EntryRow } from "./model"

interface DialogProps {
  row: EntryRow | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReassignDialog({ row, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open && !!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        {row ? <ReassignForm row={row} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

interface Candidate {
  worker: Worker
  supplierName: string
  sameSupplier: boolean
  bookedElsewhere: boolean
}

function ReassignForm({ row, onDone }: { row: EntryRow; onDone: () => void }) {
  const id = React.useId()
  const workers = useData((d) => d.workers)
  const shifts = useData((d) => d.shifts)
  const suppliers = useData((d) => d.suppliers)
  const [query, setQuery] = React.useState("")
  const [selected, setSelected] = React.useState("")
  const [note, setNote] = React.useState("")

  const { entry, venue, position, worker: current } = row
  const fromName = current ? workerName(current) : "the original Pro"

  const candidates = React.useMemo<Candidate[]>(() => {
    if (!venue || !position) return []
    const supplierNames = new Map(suppliers.map((s) => [s.id, s.shortName]))
    const booked = new Set(
      shifts
        .filter((s) => s.date === entry.date && s.workerId && s.id !== entry.shiftId && s.status !== "Cancelled" && s.status !== "No-show")
        .map((s) => s.workerId as string)
    )
    return workers
      .filter((w) => w.id !== entry.workerId && w.status === "Active" && w.metro === venue.metro && w.positionIds.includes(position.id))
      .map((w) => ({
        worker: w,
        supplierName: supplierNames.get(w.supplierId) ?? "",
        sameSupplier: w.supplierId === current?.supplierId,
        bookedElsewhere: booked.has(w.id),
      }))
      .sort(
        (a, b) =>
          Number(b.sameSupplier) - Number(a.sameSupplier) ||
          Number(a.bookedElsewhere) - Number(b.bookedElsewhere) ||
          workerName(a.worker).localeCompare(workerName(b.worker))
      )
  }, [workers, shifts, suppliers, venue, position, entry.date, entry.shiftId, entry.workerId, current?.supplierId])

  const q = query.trim().toLowerCase()
  const visible = q
    ? candidates.filter((c) => `${workerName(c.worker)} ${workerLegalName(c.worker)} ${c.supplierName}`.toLowerCase().includes(q))
    : candidates
  const target = candidates.find((c) => c.worker.id === selected)?.worker

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!target) return
    const toName = workerName(target)
    useStore.getState().reassignEntry(entry.id, target.id, note)
    const updated = useStore.getState().data.timeEntries.find((e) => e.id === entry.id)
    toast.success(`Hours moved to ${toName}`, {
      description: `${hours(updated ? updated.regularHours + updated.overtimeHours : row.hours)} · ${money(updated?.amount ?? entry.amount, true)} approved for ${toName}. ${fromName}'s timesheet is cleared. No resubmission needed.`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Reassign hours (worker swap)</DialogTitle>
        <DialogDescription>Hours move to the Pro who actually worked. No zero-out, no resubmission.</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-lg border bg-muted/30 p-3">
        <WorkerCell
          worker={current}
          size="sm"
          subtitle={
            <>
              {formatDate(entry.date, "MMM d")} · <ClockedTimes entry={entry} />
            </>
          }
        />
        <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden />
        {target ? (
          <WorkerCell worker={target} size="sm" subtitle={`${hours(row.hours)} · ${money(entry.amount, true)}`} />
        ) : (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserRoundSearchIcon className="size-4 shrink-0" aria-hidden />
            Pick who worked
          </span>
        )}
      </div>

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={`${id}-search`}>
            {position?.title ?? "Pros"} in {venue?.city ?? "this market"}
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id={`${id}-search`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or supplier"
              autoComplete="off"
            />
          </InputGroup>
          <div className="max-h-64 overflow-y-auto rounded-lg">
            {visible.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                {candidates.length === 0 ? `No other ${position?.title ?? "Pros"} are active in this market.` : "No Pros match that search."}
              </p>
            ) : (
              <RadioGroup value={selected} onValueChange={setSelected} aria-label="Pro who actually worked">
                {visible.map((c) => (
                  <FieldLabel key={c.worker.id} htmlFor={`${id}-${c.worker.id}`}>
                    <Field orientation="horizontal">
                      <WorkerAvatar worker={c.worker} size="sm" />
                      <FieldContent>
                        <FieldTitle>{workerName(c.worker)}</FieldTitle>
                        <FieldDescription className="text-xs">
                          {c.supplierName}
                          {c.sameSupplier ? " · same supplier" : ""} · ★ {c.worker.rating.toFixed(1)}
                          {c.bookedElsewhere ? " · booked on another shift that day" : ""}
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={c.worker.id} id={`${id}-${c.worker.id}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            )}
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${id}-note`}>
            Note <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea
            id={`${id}-note`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Stand lead confirmed Dani covered stand 112 for Marco."
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!target}>
          {target ? `Move hours to ${target.preferredName ?? target.firstName}` : "Move hours"}
        </Button>
      </DialogFooter>
    </form>
  )
}
