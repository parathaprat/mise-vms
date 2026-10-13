"use client"

import * as React from "react"
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  SearchIcon,
  StarIcon,
  UserPlusIcon,
} from "lucide-react"
import { toast } from "sonner"

import { WorkerCell } from "@/components/app/identity"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useData, useNow, usePersona } from "@/hooks/use-demo"
import { formatDate, toISODate } from "@/lib/dates"
import { bookedByDate, candidateWorkers } from "@/lib/engine"
import { money, num, workerName } from "@/lib/format"
import { payableShiftHours } from "@/lib/rules"
import type { RequestView } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { Shift } from "@/lib/types"
import { cn } from "@/lib/utils"

interface DialogProps {
  view: RequestView
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddHeadcountDialog({ view, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <AddHeadcountBody view={view} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  )
}

function AddHeadcountBody({
  view,
  onOpenChange,
}: Pick<DialogProps, "view" | "onOpenChange">) {
  const persona = usePersona()
  const now = useNow()
  const policies = useData((d) => d.policies)
  const addHeadcount = useStore((s) => s.addHeadcount)
  const [delta, setDelta] = React.useState(() =>
    Math.max(1, Math.round(view.req.headcount * 0.2))
  )
  const [note, setNote] = React.useState("")
  const today = toISODate(now)
  const futureDates = view.req.dates.filter((d) => d >= today)
  const pctChange = (delta / Math.max(1, view.req.headcount)) * 100
  const auto =
    persona.id === "program" || pctChange <= policies.autoApproveHeadcountPct
  const added =
    delta * futureDates.length * payableShiftHours(view.req) * view.req.billRate

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add headcount</DialogTitle>
        <DialogDescription>
          {view.req.id} · {view.position.title} at {view.venue.shortName}. No
          position-cap emails: increases inside policy apply instantly.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="delta">Additional Pros per date</FieldLabel>
          <Input
            id="delta"
            inputMode="numeric"
            value={delta}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9]/g, ""))
              setDelta(Math.min(200, Number.isFinite(n) ? n : 0))
            }}
          />
          <FieldDescription>
            {view.req.headcount} →{" "}
            <span className="font-medium text-foreground">
              {view.req.headcount + delta}
            </span>{" "}
            per date
            {futureDates.length > 1
              ? ` across ${futureDates.length} upcoming dates`
              : ""}{" "}
            · +{money(added)} estimated
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="note">Why? (optional)</FieldLabel>
          <Textarea
            id="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Club level sold out, opening two more portables"
          />
        </Field>
      </FieldGroup>
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-lg border p-3 text-sm",
          auto ? "bg-success/[0.06]" : "border-warning/40 bg-warning/10"
        )}
      >
        {auto ? (
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" />
        ) : (
          <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-warning" />
        )}
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">
            {auto ? "Applies instantly" : "Needs program approval"}
          </span>
          <span className="text-xs text-muted-foreground">
            {auto
              ? persona.id === "program"
                ? "Program office changes apply immediately."
                : `+${Math.round(pctChange)}% is within the ${policies.autoApproveHeadcountPct}% policy. New shifts start filling right away.`
              : `+${Math.round(pctChange)}% exceeds the ${policies.autoApproveHeadcountPct}% policy, routed to the program office.`}
          </span>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          disabled={delta < 1 || futureDates.length === 0}
          onClick={() => {
            const result = addHeadcount(view.req.id, delta, note)
            onOpenChange(false)
            if (result === "applied")
              toast.success(
                `Added ${delta} ${view.position.title} ${delta === 1 ? "slot" : "slots"}`,
                { description: "Filling now: watch the roster." }
              )
            else
              toast.success("Sent for program approval", {
                description: "You'll be notified the moment it's decided.",
              })
          }}
        >
          <UserPlusIcon data-icon="inline-start" />
          {auto ? "Add Pros" : "Request increase"}
        </Button>
      </DialogFooter>
    </>
  )
}

const CANCEL_REASONS = [
  "Event cancelled",
  "Weather delay",
  "Duplicate request",
  "Overstaffed",
  "Budget change",
  "Other",
]

export function CancelRequestDialog({ view, open, onOpenChange }: DialogProps) {
  const cancelRequest = useStore((s) => s.cancelRequest)
  const [reason, setReason] = React.useState(CANCEL_REASONS[0])
  const [note, setNote] = React.useState("")
  const confirmed = view.fill.filled
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {view.req.id}?</AlertDialogTitle>
          <AlertDialogDescription>
            Upcoming shifts are released and{" "}
            {confirmed
              ? `${num(confirmed)} confirmed ${confirmed === 1 ? "Pro is" : "Pros are"}`
              : "suppliers are"}{" "}
            notified instantly. Shifts already worked stay billable.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="cancel-reason">Reason</FieldLabel>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="cancel-reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {CANCEL_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="cancel-note">Note (optional)</FieldLabel>
            <Textarea
              id="cancel-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep request</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              cancelRequest(
                view.req.id,
                note.trim() ? `${reason}: ${note.trim()}` : reason
              )
              toast.success(`${view.req.id} cancelled`, {
                description: "Suppliers and confirmed Pros were notified.",
              })
            }}
          >
            Cancel request
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function EditDetailsDialog({ view, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <EditDetailsBody view={view} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  )
}

function EditDetailsBody({
  view,
  onOpenChange,
}: Pick<DialogProps, "view" | "onOpenChange">) {
  const updateRequestDetails = useStore((s) => s.updateRequestDetails)
  const [form, setForm] = React.useState(() => ({
    eventName: view.req.eventName ?? "",
    duties: view.req.duties,
    checkIn: view.req.checkIn,
    attire: view.req.attire,
    parking: view.req.parking,
    notes: view.req.notes ?? "",
  }))
  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit shift briefing</DialogTitle>
        <DialogDescription>
          Confirmed Pros get the updated briefing in the app immediately.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="ed-event">Event name</FieldLabel>
          <Input
            id="ed-event"
            value={form.eventName}
            onChange={(e) => set("eventName", e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ed-duties">Duties</FieldLabel>
          <Textarea
            id="ed-duties"
            rows={2}
            value={form.duties}
            onChange={(e) => set("duties", e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="ed-checkin">Check-in instructions</FieldLabel>
          <Textarea
            id="ed-checkin"
            rows={3}
            value={form.checkIn}
            onChange={(e) => set("checkIn", e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ed-attire">Attire</FieldLabel>
            <Textarea
              id="ed-attire"
              rows={3}
              value={form.attire}
              onChange={(e) => set("attire", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ed-parking">Parking & transit</FieldLabel>
            <Textarea
              id="ed-parking"
              rows={3}
              value={form.parking}
              onChange={(e) => set("parking", e.target.value)}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="ed-notes">Note to suppliers</FieldLabel>
          <Input
            id="ed-notes"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            updateRequestDetails(view.req.id, {
              eventName: form.eventName.trim() || undefined,
              duties: form.duties,
              checkIn: form.checkIn,
              attire: form.attire,
              parking: form.parking,
              notes: form.notes.trim() || undefined,
            })
            onOpenChange(false)
            toast.success("Briefing updated", {
              description: "Confirmed Pros were notified.",
            })
          }}
        >
          Save changes
        </Button>
      </DialogFooter>
    </>
  )
}

export function DeclineRequestDialog({
  view,
  open,
  onOpenChange,
}: DialogProps) {
  const rejectRequest = useStore((s) => s.rejectRequest)
  const [note, setNote] = React.useState("")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline {view.req.id}</DialogTitle>
          <DialogDescription>
            The requester sees your note right away and can resubmit with
            changes.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="decline-note">Reason</FieldLabel>
          <Textarea
            id="decline-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Split into two postings, Saturday is already covered by JP-4120"
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!note.trim()}
            onClick={() => {
              rejectRequest(view.req.id, note.trim())
              onOpenChange(false)
              toast.success(`${view.req.id} declined`)
            }}
          >
            Decline request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AssignProDialog({
  view,
  shift,
  open,
  onOpenChange,
}: DialogProps & { shift: Shift | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <AssignProBody view={view} shift={shift} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  )
}

function AssignProBody({
  view,
  shift,
  onOpenChange,
}: Pick<DialogProps, "view" | "onOpenChange"> & { shift: Shift | null }) {
  const data = useStore((s) => s.data)
  const assignWorker = useStore((s) => s.assignWorker)
  const persona = usePersona()
  const now = useNow()
  const [query, setQuery] = React.useState("")

  const candidates = React.useMemo(() => {
    if (!shift) return []
    const booked =
      bookedByDate(data.shifts).get(shift.date) ?? new Set<string>()
    const list = candidateWorkers({
      data,
      request: {
        ...view.req,
        supplierIds:
          persona.id === "supplier" && persona.supplierId
            ? [persona.supplierId]
            : view.req.supplierIds,
      },
      venue: view.venue,
      position: view.position,
      booked,
      today: toISODate(now),
      rand: () => 0.5,
    })
    const favorites = new Set(
      data.rosters.find((r) => r.venueId === view.venue.id)?.favorites ?? []
    )
    return list
      .map((w) => ({
        worker: w,
        favorite: favorites.has(w.id),
        score: w.rating * w.reliability * (favorites.has(w.id) ? 1.2 : 1),
      }))
      .sort((a, b) => b.score - a.score)
  }, [shift, data, view, persona, now])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? candidates.filter(
        (c) =>
          workerName(c.worker).toLowerCase().includes(q) ||
          c.worker.id.toLowerCase().includes(q)
      )
    : candidates

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {persona.id === "supplier" ? "Assign a Pro" : "Book a Pro"}
        </DialogTitle>
        <DialogDescription>
          {view.position.title} · {view.venue.shortName} ·{" "}
          {shift ? formatDate(shift.date, "EEE, MMM d") : ""}. Only Pros who are
          qualified, certified, available and under the contractual-hours cap
          are shown.
        </DialogDescription>
      </DialogHeader>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search by name or Pro ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </InputGroup>
      <ScrollArea className="h-80 rounded-lg border">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No eligible Pros match. Try widening distribution to more suppliers.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {filtered.slice(0, 40).map(({ worker, favorite }) => {
              const supplier = data.suppliers.find(
                (s) => s.id === worker.supplierId
              )
              return (
                <li
                  key={worker.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <WorkerCell
                    worker={worker}
                    favorite={favorite}
                    subtitle={`${supplier?.shortName ?? ""} · ★ ${worker.rating.toFixed(2)} · ${Math.round(worker.reliability * 100)}% reliable`}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!shift) return
                      assignWorker(shift.id, worker.id)
                      onOpenChange(false)
                      toast.success(`${workerName(worker)} confirmed`, {
                        description: "Work order created automatically.",
                      })
                    }}
                  >
                    {favorite ? (
                      <StarIcon
                        data-icon="inline-start"
                        className="fill-warning text-warning"
                      />
                    ) : null}
                    Assign
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
      <DialogFooter className="sm:justify-between">
        <span className="self-center text-xs text-muted-foreground">
          {num(candidates.length)} eligible Pros
        </span>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </>
  )
}

const RELEASE_REASONS = [
  "Requested a different Pro",
  "Pro can no longer make it",
  "Performance concern",
  "Schedule change",
]

export function ReleaseProDialog({
  view,
  shift,
  open,
  onOpenChange,
}: DialogProps & { shift: Shift | null }) {
  const unassignWorker = useStore((s) => s.unassignWorker)
  const workers = useData((d) => d.workers)
  const [reason, setReason] = React.useState(RELEASE_REASONS[0])
  const worker = workers.find((w) => w.id === shift?.workerId)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Release {workerName(worker)}?</AlertDialogTitle>
          <AlertDialogDescription>
            The slot reopens and Mise refills it automatically from{" "}
            {view.req.favoritesFirst ? "your favorites first, then " : ""}
            qualified Pros. The Pro is notified in the app.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor="release-reason">Reason</FieldLabel>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger id="release-reason" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {RELEASE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Pro</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!shift) return
              unassignWorker(shift.id, reason)
              toast.success("Slot reopened", {
                description: "Refilling automatically.",
              })
            }}
          >
            Release & refill
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
