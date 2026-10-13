"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Textarea } from "@/components/ui/textarea"
import { useData, usePersona, usePolicies } from "@/hooks/use-demo"
import { money, plural, rate, round2 } from "@/lib/format"
import { PROGRAM_NAME } from "@/lib/reference"
import { billFromPay } from "@/lib/rules"
import { requestInScope } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { ChangeRequest, RateCardEntry } from "@/lib/types"

import { repricedRequests, repriceImpact, venueMetroMap } from "../program-data"
import { signedMoney, useToday } from "../shared"
import { metroLabel } from "./rate-format"

// Supplier: propose a revision ---------------------------------------------------

export interface RevisionTarget {
  cardId: string
  initialPay?: number
}

export function RequestRevisionDialog({
  target,
  open,
  nonce,
  onOpenChange,
}: {
  target: RevisionTarget | null
  open: boolean
  nonce: number
  onOpenChange: (open: boolean) => void
}) {
  const card = useData((d) => (target ? d.rateCards.find((r) => r.id === target.cardId) : undefined))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {card ? (
          <RequestRevisionForm key={nonce} card={card} initialPay={target?.initialPay} onDone={() => onOpenChange(false)} />
        ) : (
          <DialogHeader>
            <DialogTitle>Rate card not found</DialogTitle>
            <DialogDescription>This rate card is no longer available.</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RequestRevisionForm({ card, initialPay, onDone }: { card: RateCardEntry; initialPay?: number; onDone: () => void }) {
  const persona = usePersona()
  const position = useData((d) => d.positions.find((p) => p.id === card.positionId))
  const requests = useData((d) => d.requests)
  const venues = useData((d) => d.venues)
  const requestRateRevision = useStore((s) => s.requestRateRevision)
  const today = useToday()

  const [pay, setPay] = React.useState(() => (initialPay ?? round2(card.payRate + 1)).toFixed(2))
  const [rationale, setRationale] = React.useState("")
  const [submitted, setSubmitted] = React.useState(false)

  const payValue = round2(Number.parseFloat(pay.replace(/[$,\s]/g, "")))
  const payInvalid = !Number.isFinite(payValue) || payValue < 7.25 || payValue > 150 || payValue === card.payRate
  const rationaleInvalid = rationale.trim().length < 20
  const newBill = payInvalid ? card.billRate : billFromPay(payValue, card.markupPct)

  const venueMetro = React.useMemo(() => venueMetroMap(venues), [venues])
  const mine = React.useMemo(() => requests.filter((r) => requestInScope(r, persona)), [requests, persona])
  const impact = React.useMemo(
    () => repriceImpact(repricedRequests(card, mine, venueMetro, today), newBill, today),
    [card, mine, venueMetro, today, newBill]
  )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (payInvalid || rationaleInvalid) return
    requestRateRevision(card.id, payValue, rationale.trim())
    toast.success(`Revision sent to the ${PROGRAM_NAME} program office`, {
      description: `${position?.title ?? "Position"} · ${metroLabel(card.metro)} at ${rate(payValue)}. You'll be notified when it's decided.`,
    })
    onDone()
  }

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>
          Request revision · {position?.title ?? "Position"} · {metroLabel(card.metro)}
        </DialogTitle>
        <DialogDescription>
          Goes straight to the program office&apos;s inbox. If approved, every upcoming request reprices automatically, no Mon/Thu revision
          cycle, no per-work-order acceptance.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={(submitted && payInvalid) || undefined}>
          <FieldLabel htmlFor="revision-pay">Proposed Pro pay rate</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>$</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="revision-pay"
              inputMode="decimal"
              autoComplete="off"
              value={pay}
              onChange={(e) => setPay(e.target.value)}
              aria-invalid={(submitted && payInvalid) || undefined}
              className="tabular"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>/hr</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          {submitted && payInvalid ? (
            <FieldError>Enter a new pay rate between $7.25 and $150 that differs from today&apos;s {rate(card.payRate)}.</FieldError>
          ) : (
            <FieldDescription>
              Currently {rate(card.payRate)} · bill would be {money(newBill, true)}/hr ({signedMoney(round2(newBill - card.billRate), true)})
            </FieldDescription>
          )}
        </Field>
        <Field data-invalid={(submitted && rationaleInvalid) || undefined}>
          <FieldLabel htmlFor="revision-rationale">Rationale</FieldLabel>
          <Textarea
            id="revision-rationale"
            rows={4}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Market data, fill-rate trend, competing events…"
            aria-invalid={(submitted && rationaleInvalid) || undefined}
          />
          {submitted && rationaleInvalid ? (
            <FieldError>Add at least a sentence of context (20+ characters) for the program office.</FieldError>
          ) : (
            <FieldDescription>
              {impact.count
                ? `Would reprice ${plural(impact.count, "upcoming request")} you're staffing (${signedMoney(impact.total)} in billings).`
                : "No upcoming requests you're staffing would be repriced yet."}
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit">Send to program office</Button>
      </DialogFooter>
    </form>
  )
}

// Program: approve / decline -----------------------------------------------------

export interface DecisionTarget {
  changeId: string
  approve: boolean
}

export function RevisionDecisionDialog({
  target,
  open,
  nonce,
  onOpenChange,
}: {
  target: DecisionTarget | null
  open: boolean
  nonce: number
  onOpenChange: (open: boolean) => void
}) {
  const change = useData((d) => (target ? d.changeRequests.find((c) => c.id === target.changeId) : undefined))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {change && target ? (
          <DecisionForm key={nonce} change={change} approve={target.approve} onDone={() => onOpenChange(false)} />
        ) : (
          <DialogHeader>
            <DialogTitle>Revision not found</DialogTitle>
            <DialogDescription>This change request is no longer available.</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DecisionForm({ change, approve, onDone }: { change: ChangeRequest; approve: boolean; onDone: () => void }) {
  const card = useData((d) => d.rateCards.find((r) => r.id === change.rateCardId))
  const position = useData((d) => d.positions.find((p) => p.id === change.positionId))
  const requests = useData((d) => d.requests)
  const venues = useData((d) => d.venues)
  const policies = usePolicies()
  const decideChange = useStore((s) => s.decideChange)
  const today = useToday()
  const [note, setNote] = React.useState("")

  const venueMetro = React.useMemo(() => venueMetroMap(venues), [venues])
  const newBill = card && change.newRate ? billFromPay(change.newRate, card.markupPct) : 0
  const impact = React.useMemo(
    () => (card ? repriceImpact(repricedRequests(card, requests, venueMetro, today), newBill, today) : null),
    [card, requests, venueMetro, today, newBill]
  )
  const pending = change.status === "Pending"
  const title = `${position?.title ?? "Position"} · ${card ? metroLabel(card.metro) : ""}`

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pending) return
    decideChange(change.id, approve, note.trim() || undefined)
    if (approve) {
      toast.success(`Revision approved · ${plural(impact?.count ?? 0, "upcoming request")} repriced`, {
        description: `${title} pay is now ${rate(change.newRate ?? 0)} · bill ${rate(newBill)}. ${change.requestedBy} has been notified.`,
      })
    } else {
      toast(`Revision declined`, {
        description: `${change.requestedBy} has been notified${note.trim() ? " with your note" : ""}. The current rate stays in effect.`,
      })
    }
    onDone()
  }

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>{approve ? "Approve rate revision" : "Decline rate revision"}</DialogTitle>
        <DialogDescription>
          {approve
            ? `Publishes ${title} at ${rate(change.newRate ?? 0)} (bill ${rate(newBill)}, ${policies.msaFeePct}% program fee) and reprices ${plural(impact?.count ?? 0, "upcoming request")}: ${signedMoney(impact?.total ?? 0)} in billings.`
            : `${change.requestedBy} will be notified and ${title} stays at ${card ? rate(card.payRate) : "its current rate"}.`}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="decision-note">
          Note to {change.requestedBy} <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Textarea
          id="decision-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={approve ? "Effective today for all upcoming requests." : "Let's revisit after the next fill-rate review."}
        />
      </Field>
      {!pending ? <p className="text-sm text-muted-foreground">This revision was already {change.status.toLowerCase()}.</p> : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant={approve ? "default" : "destructive"} disabled={!pending}>
          {approve ? "Approve & publish" : "Decline revision"}
        </Button>
      </DialogFooter>
    </form>
  )
}
