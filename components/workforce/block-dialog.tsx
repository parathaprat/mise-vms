"use client"

import * as React from "react"
import { BanIcon, CalendarX2Icon, InfoIcon } from "lucide-react"
import { toast } from "sonner"

import { VenueCell, WorkerAvatar, WorkerCell } from "@/components/app/identity"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useData, useNow } from "@/hooks/use-demo"
import { toISODate } from "@/lib/dates"
import { plural, workerName } from "@/lib/format"
import { getActions } from "@/lib/store"
import type { Venue, Worker } from "@/lib/types"

import type { ProRow } from "./use-workforce"

const REASONS = [
  "No-call no-show",
  "Left post without notice",
  "Guest complaint or unprofessional conduct",
  "Repeated uniform or policy violations",
  "Cash handling variance",
  "Other",
] as const

type ReasonPreset = (typeof REASONS)[number]

export interface BlockTarget {
  workerId?: string
  venueId?: string
  open: boolean
}

export type BlockCandidate = Pick<
  ProRow,
  "id" | "worker" | "name" | "supplier" | "positions" | "metroLabel" | "favoriteVenueIds" | "blocks"
>

interface BlockDialogProps {
  target: BlockTarget
  onOpenChange: (open: boolean) => void
  candidates: BlockCandidate[]
  venues: Venue[]
}

/** Adds a Pro to a venue's do-not-return list. Shows a Pro picker when no Pro is preselected. */
export function BlockDialog({ target, onOpenChange, candidates, venues }: BlockDialogProps) {
  return (
    <Dialog open={target.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <BlockForm
          initialWorkerId={target.workerId}
          initialVenueId={target.venueId}
          candidates={candidates}
          venues={venues}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

interface BlockFormProps {
  initialWorkerId?: string
  initialVenueId?: string
  candidates: BlockCandidate[]
  venues: Venue[]
  onDone: () => void
}

/** Confirmed future shifts the Pro would be released from at the venue. */
function useBlockImpact(workerId: string | undefined, venueId: string | undefined): number {
  const shifts = useData((d) => d.shifts)
  const requests = useData((d) => d.requests)
  const today = toISODate(useNow())
  return React.useMemo(() => {
    if (!workerId || !venueId) return 0
    const venueRequests = new Set(requests.filter((r) => r.venueId === venueId).map((r) => r.id))
    return shifts.filter(
      (s) => s.workerId === workerId && venueRequests.has(s.requestId) && s.date > today && s.status === "Confirmed"
    ).length
  }, [workerId, venueId, requests, shifts, today])
}

function BlockForm({ initialWorkerId, initialVenueId, candidates, venues, onDone }: BlockFormProps) {
  const [workerId, setWorkerId] = React.useState(initialWorkerId ?? "")
  const [venueChoice, setVenueChoice] = React.useState(initialVenueId ?? "")
  const [preset, setPreset] = React.useState<ReasonPreset | "">("")
  const [details, setDetails] = React.useState("")

  const pickable = React.useMemo(() => {
    const scoped = initialVenueId ? venues.filter((v) => v.id === initialVenueId) : venues
    return candidates.filter((r) => {
      const blocked = new Set(r.blocks.map((b) => b.venueId))
      return scoped.some((v) => v.metro === r.worker.metro && !blocked.has(v.id))
    })
  }, [candidates, venues, initialVenueId])

  const row = candidates.find((r) => r.id === workerId)
  const worker = row?.worker
  const blockedIds = new Set(row?.blocks.map((b) => b.venueId) ?? [])
  const openVenues = worker ? venues.filter((v) => v.metro === worker.metro && !blockedIds.has(v.id)) : []
  const venue =
    openVenues.find((v) => v.id === venueChoice) ?? (openVenues.length === 1 ? openVenues[0] : undefined)

  const impact = useBlockImpact(worker?.id, venue?.id)

  const trimmed = details.trim()
  const reason = preset === "Other" ? trimmed : trimmed ? `${preset}: ${trimmed}` : preset
  const canSubmit = !!worker && !!venue && preset !== "" && (preset !== "Other" || trimmed.length > 0)
  const isFavorite = !!(row && venue && row.favoriteVenueIds.includes(venue.id))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit || !worker || !venue) return
    getActions().blockWorker(venue.id, worker.id, reason)
    toast.success(`${workerName(worker)} added to ${venue.shortName}'s do-not-return list`, {
      description: impact
        ? `${plural(impact, "upcoming shift")} reopened. Suppliers are refilling now.`
        : "Mise will keep them off future shifts automatically.",
    })
    onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Add to do-not-return</DialogTitle>
        <DialogDescription>
          Suppliers can&apos;t offer this Pro for future shifts at the venue, and any upcoming bookings there are reopened for refill.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-4">
        {initialWorkerId && worker ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            <WorkerCell worker={worker} subtitle={`${row?.supplier?.shortName ?? "Supplier"} · ${row?.metroLabel ?? ""}`} />
          </div>
        ) : (
          <Field>
            <FieldLabel>Pro</FieldLabel>
            <ProPicker rows={pickable} selectedId={workerId} onSelect={(id) => setWorkerId(id)} />
          </Field>
        )}

        {worker ? (
          openVenues.length > 1 ? (
            <Field>
              <FieldLabel htmlFor="block-venue">Venue</FieldLabel>
              <Select value={venue?.id ?? ""} onValueChange={setVenueChoice}>
                <SelectTrigger id="block-venue" className="w-full">
                  <SelectValue placeholder="Choose a venue" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {openVenues.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : venue ? (
            <Field>
              <FieldLabel>Venue</FieldLabel>
              <VenueCell venue={venue} subtitle={`${venue.city}, ${venue.state}`} />
            </Field>
          ) : (
            <Alert>
              <InfoIcon />
              <AlertTitle>Already blocked everywhere you manage</AlertTitle>
              <AlertDescription>This Pro is on the do-not-return list at every venue in their market.</AlertDescription>
            </Alert>
          )
        ) : null}

        <Field>
          <FieldLabel htmlFor="block-reason">Reason</FieldLabel>
          <Select value={preset} onValueChange={(v) => setPreset(v as ReasonPreset)}>
            <SelectTrigger id="block-reason" className="w-full">
              <SelectValue placeholder="Why shouldn't they return?" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="block-details">{preset === "Other" ? "Details" : "Details (optional)"}</FieldLabel>
          <Textarea
            id="block-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="What happened, and when? Suppliers see this note."
            rows={3}
          />
          <FieldDescription>Shared with the Pro&apos;s supplier and the FlexForce program team.</FieldDescription>
        </Field>
      </FieldGroup>

      {worker && venue ? (
        <Alert>
          <CalendarX2Icon />
          <AlertTitle>
            {impact ? `${plural(impact, "upcoming shift")} at ${venue.shortName} will reopen` : `No upcoming ${venue.shortName} shifts affected`}
          </AlertTitle>
          <AlertDescription>
            {impact
              ? "Suppliers are notified and the slots refill automatically."
              : "They're not booked there right now."}
            {isFavorite ? ` They'll also be removed from ${venue.shortName} favorites.` : ""}
          </AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="destructive" disabled={!canSubmit}>
          <BanIcon data-icon="inline-start" />
          Add to do-not-return
        </Button>
      </DialogFooter>
    </form>
  )
}

function ProPicker({ rows, selectedId, onSelect }: { rows: BlockCandidate[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <Command className="rounded-lg border">
      <CommandInput placeholder="Search by name, ID, or position…" />
      <CommandList className="max-h-52">
        <CommandEmpty>No Pros match that search.</CommandEmpty>
        <CommandGroup>
          {rows.map((r) => (
            <CommandItem
              key={r.id}
              value={`${r.name} ${r.id}`}
              keywords={r.positions.map((p) => p.title)}
              data-checked={r.id === selectedId}
              onSelect={() => onSelect(r.id)}
            >
              <WorkerAvatar worker={r.worker} size="sm" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{r.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {r.supplier?.shortName ?? "Supplier"} · {r.positions[0]?.title ?? "Pro"} · {r.id}
                </span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

interface UnblockButtonProps {
  worker: Worker
  venue: Venue
  size?: "xs" | "sm" | "default"
  variant?: "outline" | "ghost"
  label?: string
}

export function UnblockButton({ worker, venue, size = "sm", variant = "outline", label = "Remove" }: UnblockButtonProps) {
  const name = workerName(worker)
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size={size} variant={variant}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Let {name} return to {venue.shortName}?</AlertDialogTitle>
          <AlertDialogDescription>
            They&apos;ll be eligible for {venue.shortName} shifts again, and suppliers can offer them on the next request.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep on list</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              getActions().unblockWorker(venue.id, worker.id)
              toast.success(`${name} removed from ${venue.shortName}'s do-not-return list`)
            }}
          >
            Remove from list
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
