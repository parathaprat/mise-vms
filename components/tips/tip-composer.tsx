"use client"

import * as React from "react"
import { motion, useReducedMotion } from "motion/react"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CheckIcon,
  ClipboardPasteIcon,
  InfoIcon,
  LockIcon,
  PencilLineIcon,
  SaveIcon,
  ScaleIcon,
  SendIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { SupplierMark, VenueMark, WorkerCell } from "@/components/app/identity"
import { EmptyState, KeyValue } from "@/components/app/misc"
import { StatusBadge, TIP_TONE } from "@/components/app/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatDate } from "@/lib/dates"
import { hours as formatHours, money, num, pct, plural, rate, round2 } from "@/lib/format"
import { getActions, useStore } from "@/lib/store"
import type { Supplier, TipBatch, TipBatchStatus, TipLine } from "@/lib/types"
import { cn } from "@/lib/utils"

import {
  centsToInput,
  linesTotal,
  nextBusinessDay,
  parseTipPaste,
  splitByHours,
  TIP_STATUS_LABEL,
  toCents,
  type PasteResult,
  type TipMethod,
} from "./tip-utils"
import { aggregateLines, EVENT_WINDOW_DAYS, useBatchLines, useTipEvents, type ComposerLine, type TipEvent } from "./use-tip-events"
import type { TipRow, TipsModel } from "./use-tips"

export type ComposerTarget = { kind: "new"; eventKey?: string } | { kind: "edit"; batchId: string }

type Step = 1 | 2 | 3
type AmountMode = "hours" | "manual" | "paste"

const MODE_METHOD: Record<AmountMode, TipMethod> = {
  hours: "Split by hours",
  manual: "Manual",
  paste: "CSV upload",
}

const MODE_HELP: Record<AmountMode, string> = {
  hours: "Enter the pool and Mise splits it by hours worked. Leftover cents go to the largest share.",
  manual: "Type each Pro's tips. Amounts carry over when you switch methods.",
  paste: "Paste rows from a spreadsheet or email. Names are matched to Pros who worked this event.",
}

const PASTE_PLACEHOLDER = "Maria Lopez, 142.50\nDeShawn Carter\t118.25\nW-10412, 96.00"

const EDITABLE: TipBatchStatus[] = ["Draft", "Pending approval", "Rejected"]

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: "Event" },
  { step: 2, label: "Amounts" },
  { step: 3, label: "Review" },
]

const NO_EVENTS: TipEvent[] = []
const LIST = new Intl.ListFormat("en-US", { style: "long", type: "conjunction" })

interface ComposerCallbacks {
  onClose: () => void
  /** Called after a save (or when jumping to an existing batch) so the page can show it. */
  onOpenBatch: (batchId: string) => void
}

interface TipComposerProps extends ComposerCallbacks {
  model: TipsModel
  target: ComposerTarget | null
}

export function TipComposer({ model, target, onClose, onOpenBatch }: TipComposerProps) {
  // Keep the flow on screen while the dialog animates closed.
  const [shown, setShown] = React.useState<ComposerTarget | null>(target)
  if (target && target !== shown) setShown(target)
  const current = target ?? shown

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        // A stray click outside shouldn't throw away a half-entered split; Escape still closes.
        onInteractOutside={(e) => e.preventDefault()}
      >
        {current?.kind === "edit" ? (
          <EditComposer key={current.batchId} batchId={current.batchId} model={model} onClose={onClose} onOpenBatch={onOpenBatch} />
        ) : current ? (
          <NewComposer
            key={current.eventKey ?? "new"}
            eventKey={current.eventKey}
            model={model}
            onClose={onClose}
            onOpenBatch={onOpenBatch}
          />
        ) : (
          <DialogHeader className="p-4">
            <DialogTitle>New tip batch</DialogTitle>
            <DialogDescription>Enter tips for a recent event.</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  )
}

function NewComposer({ model, eventKey, onClose, onOpenBatch }: ComposerCallbacks & { model: TipsModel; eventKey?: string }) {
  const live = useTipEvents(model)
  // Work on a snapshot so saving doesn't reshuffle the event list while the dialog closes.
  const [events] = React.useState(live)
  return <ComposerFlow model={model} events={events} initialEventKey={eventKey} onClose={onClose} onOpenBatch={onOpenBatch} />
}

function EditComposer({ model, batchId, onClose, onOpenBatch }: ComposerCallbacks & { model: TipsModel; batchId: string }) {
  const [row] = React.useState(() => model.rowsById.get(batchId) ?? null)
  const live = useBatchLines(row?.batch ?? null, model)
  const [lines] = React.useState(live)

  if (!row || !EDITABLE.includes(row.batch.status)) {
    return (
      <>
        <DialogHeader className="p-4 pr-12">
          <DialogTitle>This batch can&apos;t be edited</DialogTitle>
          <DialogDescription>It was approved or removed after you opened it. Approved tips are locked.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mx-0 mb-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </>
    )
  }
  return <ComposerFlow model={model} events={NO_EVENTS} editRow={row} editLines={lines} onClose={onClose} onOpenBatch={onOpenBatch} />
}

// Flow ---------------------------------------------------------------------------

interface InitialAmounts {
  mode: AmountMode
  pool: string
  manual: Record<string, string>
  excluded: Set<string>
}

function initialAmounts(editRow?: TipRow, editLines?: ComposerLine[]): InitialAmounts {
  if (!editRow || !editLines) return { mode: "hours", pool: "", manual: {}, excluded: new Set() }
  const saved = new Map(editRow.batch.lines.map((l) => [l.workerId, Math.round(l.amount * 100)]))
  const totalCents = sumCents(saved.values())
  const excluded = new Set(editLines.filter((l) => !saved.has(l.workerId)).map((l) => l.workerId))
  const manual = Object.fromEntries([...saved].map(([workerId, cents]) => [workerId, centsToInput(cents)]))
  // Reopen in "split by hours" only when re-splitting reproduces the saved amounts to the cent.
  let mode: AmountMode = "manual"
  if (editRow.batch.method === "Split by hours") {
    const split = splitByHours(totalCents, editLines.filter((l) => saved.has(l.workerId)))
    if ([...saved].every(([workerId, cents]) => split.get(workerId) === cents)) mode = "hours"
  }
  return { mode, pool: centsToInput(totalCents), manual, excluded }
}

function defaultPositions(event: TipEvent | null): string[] {
  if (!event) return []
  const eligible = event.positions.filter((p) => p.eligible).map((p) => p.position.id)
  return eligible.length ? eligible : event.positions.map((p) => p.position.id)
}

function sumCents(values: Iterable<number>): number {
  let total = 0
  for (const value of values) total += value
  return total
}

function sumHours(lines: ComposerLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.hours, 0))
}

interface RoutingShare {
  supplierId: string
  supplier?: Supplier
  pros: number
  cents: number
}

interface ComposerFlowProps extends ComposerCallbacks {
  model: TipsModel
  events: TipEvent[]
  initialEventKey?: string
  editRow?: TipRow
  editLines?: ComposerLine[]
}

function ComposerFlow({ model, events, initialEventKey, editRow, editLines, onClose, onOpenBatch }: ComposerFlowProps) {
  const id = React.useId()
  const reduceMotion = useReducedMotion()
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const { workersById, suppliersById, costCentersById, policies, today } = model
  const positions = useStore((s) => s.data.positions)
  const positionsById = React.useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions])

  const [init] = React.useState(() => initialAmounts(editRow, editLines))
  const [initialEvent] = React.useState(() => events.find((e) => e.key === initialEventKey) ?? null)
  const [step, setStep] = React.useState<Step>(editRow || initialEvent ? 2 : 1)
  const [eventKey, setEventKey] = React.useState<string | null>(initialEvent?.key ?? null)
  const [positionIds, setPositionIds] = React.useState<string[]>(() => defaultPositions(initialEvent))
  const [extraIds, setExtraIds] = React.useState<Set<string>>(() => new Set())
  const [excluded, setExcluded] = React.useState<Set<string>>(init.excluded)
  const [mode, setMode] = React.useState<AmountMode>(init.mode)
  const [poolInput, setPoolInput] = React.useState(init.pool)
  const [manual, setManual] = React.useState<Record<string, string>>(init.manual)
  const [pasteText, setPasteText] = React.useState("")
  const [note, setNote] = React.useState(editRow && editRow.batch.status !== "Rejected" ? (editRow.batch.note ?? "") : "")
  const [attempted, setAttempted] = React.useState(false)

  const status = editRow?.batch.status
  const event = React.useMemo(() => (editRow ? null : (events.find((e) => e.key === eventKey) ?? null)), [editRow, events, eventKey])

  // Everyone with hours at the event (paste matching), and the Pros in the selected positions.
  const allLines = React.useMemo(
    () => editLines ?? (event ? aggregateLines(event.entries, () => true, workersById) : []),
    [editLines, event, workersById]
  )
  const poolLines = React.useMemo(
    () => editLines ?? (event ? aggregateLines(event.entries, (e) => positionIds.includes(e.positionId), workersById) : []),
    [editLines, event, positionIds, workersById]
  )
  const paste = React.useMemo(
    () => parseTipPaste(pasteText, allLines.flatMap((l) => (l.worker ? [l.worker] : []))),
    [pasteText, allLines]
  )
  const lines = React.useMemo(() => {
    const inPool = new Set(poolLines.map((l) => l.workerId))
    const extras = allLines.filter(
      (l) => !inPool.has(l.workerId) && (extraIds.has(l.workerId) || (mode === "paste" && paste.amounts.has(l.workerId)))
    )
    return extras.length ? [...poolLines, ...extras] : poolLines
  }, [poolLines, allLines, extraIds, mode, paste])

  const poolCents = toCents(poolInput)
  const amounts = React.useMemo(() => {
    if (mode === "paste") return new Map(lines.map((l) => [l.workerId, paste.amounts.get(l.workerId) ?? 0]))
    const included = lines.filter((l) => !excluded.has(l.workerId))
    if (mode === "hours") return splitByHours(Math.max(0, poolCents ?? 0), included)
    return new Map(included.map((l) => [l.workerId, Math.max(0, toCents(manual[l.workerId] ?? "") ?? 0)]))
  }, [mode, lines, paste, excluded, poolCents, manual])

  const paidLines = React.useMemo(() => lines.filter((l) => (amounts.get(l.workerId) ?? 0) > 0), [lines, amounts])
  const sortedPaid = React.useMemo(
    () => [...paidLines].sort((a, b) => (amounts.get(b.workerId) ?? 0) - (amounts.get(a.workerId) ?? 0) || a.name.localeCompare(b.name)),
    [paidLines, amounts]
  )
  const routing = React.useMemo(() => {
    const map = new Map<string, RoutingShare>()
    for (const line of paidLines) {
      const supplierId = line.worker?.supplierId ?? "unknown"
      const share = map.get(supplierId) ?? { supplierId, supplier: suppliersById.get(supplierId), pros: 0, cents: 0 }
      share.pros++
      share.cents += amounts.get(line.workerId) ?? 0
      map.set(supplierId, share)
    }
    return [...map.values()].sort((a, b) => b.cents - a.cents)
  }, [paidLines, amounts, suppliersById])

  const totalCents = sumCents(amounts.values())
  const paidHours = sumHours(paidLines)
  const includedLines = mode === "paste" ? paidLines : lines.filter((l) => !excluded.has(l.workerId))
  const includedHours = sumHours(includedLines)
  const zeroIncluded = mode === "paste" ? 0 : includedLines.length - paidLines.length
  const invalidManual = new Set(
    mode === "manual"
      ? includedLines
          .filter((l) => {
            const cents = toCents(manual[l.workerId] ?? "")
            return cents === null || cents < 0
          })
          .map((l) => l.workerId)
      : []
  )
  const perHour = mode === "hours" && poolCents && poolCents > 0 && includedHours > 0 ? poolCents / 100 / includedHours : 0

  const poolProblem =
    mode !== "hours" ? null : poolCents === null ? "Enter the pool as a dollar amount, like 2,140.50." : poolCents < 0 ? "Tips can't be negative." : null
  let amountError: string | null = null
  if (!lines.length) amountError = "No Pros in this pool. Go back and add a position."
  else if (mode === "hours") {
    amountError = poolProblem ?? (!poolCents ? "Enter the tip pool to split." : includedHours <= 0 ? "Include at least one Pro with hours." : null)
  } else if (mode === "manual") {
    amountError = invalidManual.size
      ? `Fix ${plural(invalidManual.size, "amount")}. Use dollars like 42.50, with no negatives.`
      : totalCents <= 0
        ? "Enter at least one tip amount."
        : null
  } else {
    amountError = !pasteText.trim()
      ? "Paste the captain's sheet, one Pro per line."
      : totalCents <= 0
        ? "No rows matched a Pro who worked this event."
        : null
  }

  const subject = editRow
    ? { eventName: editRow.batch.eventName, venue: editRow.venue, date: editRow.batch.date }
    : event
      ? { eventName: event.eventName, venue: event.venue, date: event.date }
      : null
  const requestIds = editRow ? editRow.batch.requestIds : [...new Set(paidLines.flatMap((l) => l.requestIds))].sort()
  const costCenterId = editRow
    ? editRow.batch.costCenterId
    : event
      ? (event.costCenterByRequest[requestIds[0]] ?? event.costCenterId)
      : ""
  const costCenter = costCentersById.get(costCenterId)
  const canSubmit = status !== "Pending approval"
  const canSaveDraft = !editRow || status === "Draft"
  const submitLabel = status === "Rejected" ? "Resubmit" : policies.requireTipApproval ? "Submit for approval" : "Submit tips"
  const payDay = formatDate(nextBusinessDay(today), "EEEE")

  function subtitle(line: ComposerLine): string {
    const titles = line.positionIds.flatMap((pid) => positionsById.get(pid)?.title ?? [])
    const supplier = line.worker ? suppliersById.get(line.worker.supplierId)?.shortName : undefined
    return [titles.join(", "), supplier].filter(Boolean).join(" · ")
  }

  function goTo(next: Step) {
    setStep(next)
    bodyRef.current?.scrollTo({ top: 0 })
  }

  function selectEvent(key: string) {
    setEventKey(key)
    setPositionIds(defaultPositions(events.find((e) => e.key === key) ?? null))
    setExcluded(new Set())
    setExtraIds(new Set())
    setManual({})
    setPoolInput("")
    setPasteText("")
    setAttempted(false)
  }

  function togglePosition(positionId: string, on: boolean) {
    setPositionIds((prev) => (on ? [...prev, positionId] : prev.filter((p) => p !== positionId)))
  }

  function toggleLine(workerId: string, include: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (include) next.delete(workerId)
      else next.add(workerId)
      return next
    })
  }

  function changeMode(next: AmountMode) {
    if (next === mode) return
    if (mode === "paste" && totalCents > 0) {
      const inPool = new Set(poolLines.map((l) => l.workerId))
      const matchedExtras = lines.filter((l) => !inPool.has(l.workerId) && paste.amounts.has(l.workerId)).map((l) => l.workerId)
      if (matchedExtras.length) setExtraIds((prev) => new Set([...prev, ...matchedExtras]))
      setExcluded(new Set(lines.filter((l) => !amounts.get(l.workerId)).map((l) => l.workerId)))
    }
    if (next === "manual" && totalCents > 0) {
      setManual(Object.fromEntries(lines.map((l) => [l.workerId, centsToInput(amounts.get(l.workerId) ?? 0)])))
    }
    if (next === "hours" && totalCents > 0) setPoolInput(centsToInput(totalCents))
    setMode(next)
    setAttempted(false)
  }

  function insertExample() {
    const sample = poolLines.length ? poolLines : allLines
    // Roughly $21.50 an hour, rounded to a $5 pool like a captain would count it.
    const pool = Math.max(1, Math.round((sumHours(sample) * 2150) / 500)) * 500
    const split = splitByHours(pool, sample)
    setPasteText(["Name\tTips", ...sample.map((l) => `${l.name}\t${((split.get(l.workerId) ?? 0) / 100).toFixed(2)}`)].join("\n"))
  }

  function save(submit: boolean) {
    const tipLines: TipLine[] = paidLines.map((l) => ({
      workerId: l.workerId,
      amount: round2((amounts.get(l.workerId) ?? 0) / 100),
      hours: l.hours,
    }))
    if (amountError || !tipLines.length) {
      setAttempted(true)
      goTo(2)
      return
    }
    const actions = getActions()
    const needsApproval = useStore.getState().data.policies.requireTipApproval
    const name = subject?.eventName ?? "Tips"
    const summary = `${money(linesTotal(tipLines), true)} for ${plural(tipLines.length, "Pro")}`
    let batchId: string
    if (editRow) {
      const fresh = useStore.getState().data.tipBatches.find((b) => b.id === editRow.id)
      if (!fresh || !EDITABLE.includes(fresh.status)) {
        toast("Already handled", { description: "This tip batch changed since you opened it." })
        onClose()
        return
      }
      actions.updateTipBatch(fresh.id, tipLines, note.trim())
      if (submit) actions.submitTipBatch(fresh.id)
      batchId = fresh.id
    } else {
      if (!event) return
      batchId = actions.createTipBatch({
        venueId: event.venueId,
        costCenterId,
        date: event.date,
        eventName: event.eventName,
        requestIds,
        lines: tipLines,
        method: MODE_METHOD[mode],
        note: note.trim() || undefined,
        submit,
      })
    }
    if (!submit) {
      toast.success(
        status === "Pending approval" ? `Changes saved · ${name}` : editRow ? `Draft updated · ${name}` : `Draft saved · ${name}`,
        {
          description:
            status === "Pending approval" ? `${summary}, still waiting on approval.` : `${summary}. Submit it when the split is final.`,
        }
      )
    } else if (needsApproval) {
      toast.success(status === "Rejected" ? `Tips resubmitted · ${name}` : `Tips submitted · ${name}`, {
        description: `${summary}, waiting on venue approval. Pros are paid the business day after it's approved.`,
      })
    } else {
      toast.success(`Tips approved · ${name}`, { description: `${summary}, approved by policy. Pros are paid ${payDay}.` })
    }
    onOpenBatch(batchId)
  }

  function advance() {
    if (step === 1) {
      if (event && poolLines.length) goTo(2)
      return
    }
    if (step === 2) {
      if (amountError) {
        setAttempted(true)
        return
      }
      goTo(3)
      return
    }
    save(canSubmit)
  }

  const title = editRow
    ? status === "Rejected"
      ? "Fix returned tips"
      : status === "Pending approval"
        ? "Edit tips awaiting approval"
        : "Edit tip draft"
    : "New tip batch"
  const description = subject
    ? `${subject.eventName} · ${subject.venue?.shortName ?? "Venue"} · ${formatDate(subject.date, "EEE, MMM d")}`
    : `Pick an event from the last ${EVENT_WINDOW_DAYS} days. Hours come straight from timesheets.`
  const payers = routing.length ? LIST.format(routing.map((r) => r.supplier?.shortName ?? "the supplier")) : "suppliers"
  const payVerb = routing.length === 1 ? "pays" : "pay"
  const policyText = !canSubmit
    ? "Saving keeps this batch in the approval queue with your changes."
    : policies.requireTipApproval
      ? `Submitting sends it to ${subject?.venue?.shortName ?? "the venue"} for approval. Once it's approved, ${payers} ${payVerb} these Pros the next business day and ${routing.length === 1 ? "bills" : "bill"} the tips at cost.`
      : `Program policy approves tips on submit, so ${payers} ${payVerb} these Pros ${payDay}.`

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        advance()
      }}
    >
      <DialogHeader className="gap-4 border-b p-4 pr-12">
        <div className="flex min-w-0 flex-col gap-1.5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="truncate">{description}</DialogDescription>
        </div>
        <Stepper step={step} locked={!!editRow} />
      </DialogHeader>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        <motion.div
          key={step}
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex flex-col gap-5"
        >
          {step === 1 ? (
            <EventStep
              id={id}
              events={events}
              event={event}
              positionIds={positionIds}
              poolLines={poolLines}
              onSelect={selectEvent}
              onTogglePosition={togglePosition}
              onOpenBatch={onOpenBatch}
            />
          ) : null}

          {step === 2 ? (
            <>
              {status === "Rejected" ? (
                <Alert variant="destructive">
                  <Undo2Icon />
                  <AlertTitle>Returned for changes</AlertTitle>
                  <AlertDescription>
                    {editRow?.batch.note ? `“${editRow.batch.note}”` : "Fix the split, then resubmit it for approval."}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Field>
                <FieldTitle id={`${id}-method`}>How are you entering tips?</FieldTitle>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={0}
                  value={mode}
                  onValueChange={(value) => {
                    if (value) changeMode(value as AmountMode)
                  }}
                  aria-labelledby={`${id}-method`}
                  className="w-full sm:w-fit"
                >
                  <ToggleGroupItem value="hours" className="flex-1 sm:flex-none">
                    <ScaleIcon data-icon="inline-start" />
                    Split by hours
                  </ToggleGroupItem>
                  <ToggleGroupItem value="manual" className="flex-1 sm:flex-none">
                    <PencilLineIcon data-icon="inline-start" />
                    Manual
                  </ToggleGroupItem>
                  <ToggleGroupItem value="paste" className="flex-1 sm:flex-none">
                    <ClipboardPasteIcon data-icon="inline-start" />
                    Paste sheet
                  </ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>{MODE_HELP[mode]}</FieldDescription>
              </Field>

              {mode === "hours" ? (
                <Field data-invalid={poolProblem || (attempted && amountError && !poolCents) ? true : undefined}>
                  <FieldLabel htmlFor={`${id}-pool`}>Tip pool</FieldLabel>
                  <InputGroup className="sm:max-w-72">
                    <InputGroupAddon>
                      <InputGroupText>$</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id={`${id}-pool`}
                      value={poolInput}
                      onChange={(e) => setPoolInput(e.target.value)}
                      onBlur={() => {
                        const cents = toCents(poolInput)
                        if (cents !== null && cents > 0) setPoolInput(centsToInput(cents))
                      }}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0.00"
                      aria-invalid={poolProblem ? true : undefined}
                      className="tabular"
                    />
                    {perHour ? (
                      <InputGroupAddon align="inline-end">
                        <InputGroupText className="tabular">{rate(perHour)}</InputGroupText>
                      </InputGroupAddon>
                    ) : null}
                  </InputGroup>
                  {poolProblem ? (
                    <FieldError>{poolProblem}</FieldError>
                  ) : (
                    <FieldDescription>
                      Split across {plural(includedLines.length, "Pro")} and {formatHours(includedHours)} from timesheets.
                    </FieldDescription>
                  )}
                </Field>
              ) : null}

              {mode === "paste" ? (
                <>
                  <Field>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor={`${id}-paste`}>Captain&apos;s sheet</FieldLabel>
                      <Button type="button" variant="ghost" size="xs" onClick={insertExample} disabled={!allLines.length}>
                        Use an example
                      </Button>
                    </div>
                    <Textarea
                      id={`${id}-paste`}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      rows={6}
                      spellCheck={false}
                      placeholder={PASTE_PLACEHOLDER}
                      className="max-h-56 font-mono text-xs"
                    />
                    <FieldDescription>
                      One Pro per line: “Name, 42.50”, or two columns copied from a spreadsheet. Preferred names, legal names, and Pro
                      IDs all match.
                    </FieldDescription>
                  </Field>
                  {pasteText.trim() ? <PasteSummary paste={paste} totalCents={totalCents} /> : null}
                </>
              ) : null}

              <LinesTable
                lines={lines}
                mode={mode}
                excluded={excluded}
                amounts={amounts}
                totalCents={totalCents}
                manual={manual}
                invalid={invalidManual}
                subtitle={subtitle}
                onToggle={toggleLine}
                onToggleAll={(include) => setExcluded(include ? new Set() : new Set(lines.map((l) => l.workerId)))}
                onManualChange={(workerId, value) => setManual((prev) => ({ ...prev, [workerId]: value }))}
              />
              {attempted && amountError ? <FieldError>{amountError}</FieldError> : null}
            </>
          ) : null}

          {step === 3 ? (
            <>
              {event?.existing ? <ExistingAlert batch={event.existing} onOpenBatch={onOpenBatch} /> : null}

              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
                <ReviewStat label="Total tips" value={money(totalCents / 100, true)} />
                <ReviewStat label="Pros" value={num(paidLines.length)} />
                <ReviewStat label="Hours" value={formatHours(paidHours)} />
                <ReviewStat label="Per hour" value={paidHours ? rate(totalCents / 100 / paidHours) : "–"} />
              </dl>

              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_15rem]">
                <section className="flex min-w-0 flex-col gap-2">
                  <h3 className="text-sm font-medium">Split</h3>
                  <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border">
                    {sortedPaid.map((line) => (
                      <li key={line.workerId} className="flex items-center gap-3 px-3 py-2">
                        <WorkerCell worker={line.worker} size="sm" subtitle={subtitle(line)} className="flex-1" />
                        <span className="text-xs text-muted-foreground tabular">{formatHours(line.hours)}</span>
                        <span className="w-20 text-right text-sm font-medium tabular">
                          {money((amounts.get(line.workerId) ?? 0) / 100, true)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {zeroIncluded > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {plural(zeroIncluded, "Pro")} at $0 {zeroIncluded === 1 ? "isn't" : "aren't"} added to the batch.
                    </p>
                  ) : null}
                </section>

                <div className="flex min-w-0 flex-col gap-5">
                  <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium">Routing</h3>
                    <ul className="flex flex-col gap-2">
                      {routing.map((share) => (
                        <li key={share.supplierId} className="flex min-w-0 items-center gap-2 text-sm">
                          <SupplierMark supplier={share.supplier} size="xs" />
                          <span className="min-w-0 flex-1 truncate">
                            {share.supplier?.shortName ?? "Unknown supplier"}{" "}
                            <span className="text-xs text-muted-foreground">· {plural(share.pros, "Pro")}</span>
                          </span>
                          <span className="font-medium tabular">{money(share.cents / 100, true)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-pretty text-muted-foreground">
                      Each supplier pays its own Pros, then bills the tips at cost on its weekly invoice. No program fee.
                    </p>
                  </section>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <KeyValue label="Cost center">
                      {costCenter ? (
                        <span className="flex flex-col">
                          <span>{costCenter.code}</span>
                          <span className="truncate text-xs font-normal text-muted-foreground">{costCenter.name}</span>
                        </span>
                      ) : (
                        "–"
                      )}
                    </KeyValue>
                    <KeyValue label="Method">{editRow ? editRow.batch.method : MODE_METHOD[mode]}</KeyValue>
                    <KeyValue label={requestIds.length === 1 ? "Request" : "Requests"} className="col-span-2">
                      <span className="font-mono text-xs break-all">{requestIds.length ? requestIds.join(", ") : "–"}</span>
                    </KeyValue>
                  </dl>
                </div>
              </div>

              <Field>
                <FieldLabel htmlFor={`${id}-note`}>{status === "Rejected" ? "What changed?" : "Note for the approver"}</FieldLabel>
                <Textarea
                  id={`${id}-note`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={
                    status === "Rejected"
                      ? "e.g. Added Jamie to the split and matched the captain's total"
                      : "e.g. Includes the suite 214 pre-order gratuity"
                  }
                />
                <FieldDescription>Optional. It shows on the batch for the approver and the suppliers.</FieldDescription>
              </Field>

              <div className="flex gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <p className="text-pretty">{policyText}</p>
              </div>
            </>
          ) : null}
        </motion.div>
      </div>

      <DialogFooter className="mx-0 mb-0 items-center sm:justify-between">
        <p className="hidden min-w-0 truncate text-xs text-muted-foreground tabular sm:block">
          {step === 1
            ? event
              ? `${plural(poolLines.length, "Pro")} · ${formatHours(sumHours(poolLines))} in the pool`
              : `${plural(events.length, "event")} in the last ${EVENT_WINDOW_DAYS} days`
            : `${plural(paidLines.length, "Pro")} · ${money(totalCents / 100, true)}`}
        </p>
        <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
          {step === 1 ? (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!event || !poolLines.length}>
                Continue
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </>
          ) : null}
          {step === 2 ? (
            <>
              {editRow ? (
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => goTo(1)}>
                  <ArrowLeftIcon data-icon="inline-start" />
                  Back
                </Button>
              )}
              <Button type="submit">
                Review
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </>
          ) : null}
          {step === 3 ? (
            <>
              <Button type="button" variant="ghost" onClick={() => goTo(2)}>
                <ArrowLeftIcon data-icon="inline-start" />
                Back
              </Button>
              {canSaveDraft ? (
                <Button type="button" variant="outline" onClick={() => save(false)}>
                  <SaveIcon data-icon="inline-start" />
                  {editRow ? "Save draft" : "Save as draft"}
                </Button>
              ) : null}
              <Button type="submit">
                {canSubmit ? <SendIcon data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
                {canSubmit ? submitLabel : "Save changes"}
              </Button>
            </>
          ) : null}
        </div>
      </DialogFooter>
    </form>
  )
}

// Pieces -------------------------------------------------------------------------

function Stepper({ step, locked }: { step: Step; locked: boolean }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = s.step < step
        const active = s.step === step
        return (
          <li key={s.step} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
            {i > 0 ? (
              <span aria-hidden className={cn("h-px w-5 sm:w-8", done || active ? "bg-foreground/40" : "bg-border")} />
            ) : null}
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold tabular transition-colors",
                done ? "border-foreground bg-foreground text-background" : active ? "border-foreground text-foreground" : "text-muted-foreground"
              )}
            >
              {done ? locked && s.step === 1 ? <LockIcon className="size-2.5" aria-hidden /> : <CheckIcon className="size-3" aria-hidden /> : s.step}
            </span>
            <span className={cn("text-xs font-medium", active ? "text-foreground" : "text-muted-foreground")}>
              {s.label}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

interface EventStepProps {
  id: string
  events: TipEvent[]
  event: TipEvent | null
  positionIds: string[]
  poolLines: ComposerLine[]
  onSelect: (key: string) => void
  onTogglePosition: (positionId: string, on: boolean) => void
  onOpenBatch: (batchId: string) => void
}

function EventStep({ id, events, event, positionIds, poolLines, onSelect, onTogglePosition, onOpenBatch }: EventStepProps) {
  if (!events.length) {
    return (
      <EmptyState
        icon={CalendarDaysIcon}
        title="No recent events to tip"
        description={`Events at your venues from the last ${EVENT_WINDOW_DAYS} days with hours on timesheets show up here.`}
      />
    )
  }
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_15rem]">
      <FieldSet className="min-w-0">
        <FieldLegend variant="label">Event</FieldLegend>
        <FieldDescription>Events without tips are listed first. Events still underway show up once their shifts end.</FieldDescription>
        <RadioGroup value={event?.key ?? ""} onValueChange={onSelect} className="-m-1 max-h-[22rem] overflow-y-auto p-1">
          {events.map((ev, i) => (
            <FieldLabel key={ev.key} htmlFor={`${id}-event-${i}`}>
              <Field orientation="horizontal">
                <VenueMark venue={ev.venue} size="sm" />
                <FieldContent className="min-w-0">
                  <FieldTitle className="w-full min-w-0">
                    <span className="truncate">{ev.eventName}</span>
                  </FieldTitle>
                  <FieldDescription className="truncate text-xs tabular">
                    {formatDate(ev.date, "EEE, MMM d")} · {ev.venue?.shortName ?? "Venue"} · {plural(ev.pros, "Pro")} ·{" "}
                    {formatHours(ev.hours)}
                  </FieldDescription>
                </FieldContent>
                {ev.existing ? (
                  <StatusBadge tone={TIP_TONE[ev.existing.status]} className="shrink-0">
                    {ev.existing.status === "Draft" ? "Draft" : "Entered"}
                  </StatusBadge>
                ) : null}
                <RadioGroupItem value={ev.key} id={`${id}-event-${i}`} />
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </FieldSet>

      <div className="flex min-w-0 flex-col gap-4">
        {event ? (
          <>
            <FieldSet>
              <FieldLegend variant="label">Who shares the pool</FieldLegend>
              <FieldDescription>Tipped positions are on by default.</FieldDescription>
              <FieldGroup data-slot="checkbox-group" className="gap-3">
                {event.positions.map((p, i) => (
                  <Field key={p.position.id} orientation="horizontal">
                    <Checkbox
                      id={`${id}-position-${i}`}
                      checked={positionIds.includes(p.position.id)}
                      onCheckedChange={(checked) => onTogglePosition(p.position.id, checked === true)}
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={`${id}-position-${i}`}>{p.position.title}</FieldLabel>
                      <FieldDescription className="text-xs tabular">
                        {plural(p.pros, "Pro")} · {formatHours(p.hours)}
                        {p.eligible ? "" : " · not usually tipped"}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>
            {!poolLines.length ? <FieldError>Pick at least one position to share the pool.</FieldError> : null}
            {event.existing ? <ExistingAlert batch={event.existing} onOpenBatch={onOpenBatch} /> : null}
          </>
        ) : (
          <div className="flex min-h-32 flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Pick an event to choose who shares the pool.
          </div>
        )}
      </div>
    </div>
  )
}

function ExistingAlert({ batch, onOpenBatch }: { batch: TipBatch; onOpenBatch: (batchId: string) => void }) {
  const draft = batch.status === "Draft"
  return (
    <Alert className="border-warning/40 bg-warning/10">
      <TriangleAlertIcon className="text-warning" />
      <AlertTitle>{draft ? "There's already a draft for this event" : `Already entered as ${batch.id}`}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>
          {draft
            ? `${batch.createdBy} started ${batch.id}. Finish that draft so Pros aren't tipped twice.`
            : `${TIP_STATUS_LABEL[batch.status]} · ${money(linesTotal(batch.lines), true)}. Only add another batch for a separate pool, like suites.`}
        </span>
        <Button type="button" variant="outline" size="xs" onClick={() => onOpenBatch(batch.id)}>
          Open {batch.id}
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function PasteSummary({ paste, totalCents }: { paste: PasteResult; totalCents: number }) {
  const hasIssues = paste.unmatched.length > 0 || paste.warnings.length > 0
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular">
        {paste.matched ? <CheckIcon className="size-3.5 text-success" aria-hidden /> : null}
        Matched {num(paste.matched)} of {plural(paste.rows, "row")} · {money(totalCents / 100, true)}
      </p>
      {hasIssues ? (
        <Alert className="border-warning/40 bg-warning/10">
          <TriangleAlertIcon className="text-warning" />
          <AlertTitle>
            {paste.unmatched.length
              ? `${plural(paste.unmatched.length, "name")} didn't match a Pro on this event`
              : "Some rows were skipped"}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-1">
            {paste.unmatched.length ? (
              <span>{paste.unmatched.join(", ")}. Check the spelling or use Pro IDs. Unmatched rows aren&apos;t paid.</span>
            ) : null}
            {paste.warnings.map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

interface LinesTableProps {
  lines: ComposerLine[]
  mode: AmountMode
  excluded: Set<string>
  amounts: Map<string, number>
  totalCents: number
  manual: Record<string, string>
  invalid: Set<string>
  subtitle: (line: ComposerLine) => string
  onToggle: (workerId: string, include: boolean) => void
  onToggleAll: (include: boolean) => void
  onManualChange: (workerId: string, value: string) => void
}

function LinesTable({
  lines,
  mode,
  excluded,
  amounts,
  totalCents,
  manual,
  invalid,
  subtitle,
  onToggle,
  onToggleAll,
  onManualChange,
}: LinesTableProps) {
  const selectable = mode !== "paste"
  const includedCount = lines.filter((l) => !excluded.has(l.workerId)).length
  const paid = lines.filter((l) => (amounts.get(l.workerId) ?? 0) > 0)
  const allChecked = includedCount === lines.length ? true : includedCount === 0 ? false : "indeterminate"

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            {selectable ? (
              <TableHead className="h-9 w-10 pl-3">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(checked) => onToggleAll(checked === true)}
                  aria-label="Include every Pro"
                  disabled={!lines.length}
                />
              </TableHead>
            ) : null}
            <TableHead className={cn("h-9 text-xs text-muted-foreground", !selectable && "pl-3")}>Pro</TableHead>
            <TableHead className="h-9 text-right text-xs text-muted-foreground">Hours</TableHead>
            <TableHead className="hidden h-9 text-right text-xs text-muted-foreground sm:table-cell">Share</TableHead>
            <TableHead className="h-9 pr-3 text-right text-xs text-muted-foreground">Tips</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => {
            const cents = amounts.get(line.workerId) ?? 0
            const included = selectable ? !excluded.has(line.workerId) : cents > 0
            const value = manual[line.workerId] ?? ""
            return (
              <TableRow key={line.workerId} className={cn("hover:bg-transparent", !included && "text-muted-foreground")}>
                {selectable ? (
                  <TableCell className="w-10 pl-3">
                    <Checkbox
                      checked={included}
                      onCheckedChange={(checked) => onToggle(line.workerId, checked === true)}
                      aria-label={`Include ${line.name}`}
                    />
                  </TableCell>
                ) : null}
                <TableCell className={cn("w-full max-w-0", !selectable && "pl-3")}>
                  <WorkerCell worker={line.worker} size="sm" subtitle={subtitle(line)} className={cn(!included && "opacity-60")} />
                </TableCell>
                <TableCell className="text-right tabular">{formatHours(line.hours)}</TableCell>
                <TableCell className="hidden text-right text-muted-foreground tabular sm:table-cell">
                  {cents > 0 && totalCents > 0 ? pct(cents / totalCents) : "–"}
                </TableCell>
                <TableCell className="pr-3 text-right">
                  {mode === "manual" ? (
                    <InputGroup className="ml-auto w-28">
                      <InputGroupAddon>
                        <InputGroupText>$</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        value={value}
                        onChange={(e) => onManualChange(line.workerId, e.target.value)}
                        onBlur={() => {
                          const parsed = toCents(value)
                          if (parsed !== null && parsed > 0) onManualChange(line.workerId, centsToInput(parsed))
                        }}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        disabled={!included}
                        aria-label={`Tips for ${line.name}`}
                        aria-invalid={included && invalid.has(line.workerId) ? true : undefined}
                        className="text-right tabular"
                      />
                    </InputGroup>
                  ) : (
                    <span className={cn("tabular", cents > 0 ? "font-medium text-foreground" : "text-xs text-muted-foreground")}>
                      {cents > 0 ? money(cents / 100, true) : mode === "paste" ? "Not on sheet" : "–"}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={selectable ? 2 : 1} className="pl-3 text-xs">
              {plural(paid.length, "Pro")} with tips
            </TableCell>
            <TableCell className="text-right tabular">{formatHours(sumHours(paid))}</TableCell>
            <TableCell className="hidden sm:table-cell" />
            <TableCell className="pr-3 text-right tabular">{money(totalCents / 100, true)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

function ReviewStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-popover px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-base font-semibold tracking-tight tabular">{value}</dd>
    </div>
  )
}
