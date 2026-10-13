"use client"

import * as React from "react"
import { ArrowRightIcon, RefreshCwIcon } from "lucide-react"
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
import { useData, usePolicies } from "@/hooks/use-demo"
import { formatDate } from "@/lib/dates"
import { money, plural, rate, round2 } from "@/lib/format"
import { metroById } from "@/lib/reference"
import { useStore } from "@/lib/store"
import type { RateCardEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

import { repricedRequests, repriceImpact, venueMetroMap } from "../program-data"
import { signedMoney, useToday } from "../shared"
import { cardBreakdown, markupLabel, metroLabel, rateBreakdown } from "./rate-format"

export interface RateEditTarget {
  cardId: string
  initialPay?: number
}

interface RateEditDialogProps {
  target: RateEditTarget | null
  open: boolean
  nonce: number
  onOpenChange: (open: boolean) => void
  onPublished?: (cardId: string) => void
}

export function RateEditDialog({ target, open, nonce, onOpenChange, onPublished }: RateEditDialogProps) {
  const card = useData((d) => (target ? d.rateCards.find((r) => r.id === target.cardId) : undefined))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {card ? (
          <RateEditForm
            key={nonce}
            card={card}
            initialPay={target?.initialPay}
            onDone={(published) => {
              onOpenChange(false)
              if (published) onPublished?.(card.id)
            }}
          />
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

function parseAmount(value: string): number {
  const n = Number.parseFloat(value.replace(/[$,%\s]/g, ""))
  return Number.isFinite(n) ? n : Number.NaN
}

function RateEditForm({
  card,
  initialPay,
  onDone,
}: {
  card: RateCardEntry
  initialPay?: number
  onDone: (published: boolean) => void
}) {
  const position = useData((d) => d.positions.find((p) => p.id === card.positionId))
  const requests = useData((d) => d.requests)
  const venues = useData((d) => d.venues)
  const policies = usePolicies()
  const updateRateCard = useStore((s) => s.updateRateCard)
  const today = useToday()

  const [pay, setPay] = React.useState(() => (initialPay ?? card.payRate).toFixed(2))
  const [markup, setMarkup] = React.useState(() => String(Number((card.markupPct * 100).toFixed(1))))

  const payValue = round2(parseAmount(pay))
  const markupValue = parseAmount(markup)
  const payInvalid = !Number.isFinite(payValue) || payValue < 7.25 || payValue > 150
  const markupInvalid = !Number.isFinite(markupValue) || markupValue < 0 || markupValue > 150
  const invalid = payInvalid || markupInvalid
  const nextMarkupPct = Math.round(markupValue * 10) / 1000
  const unchanged = !invalid && payValue === card.payRate && Math.abs(nextMarkupPct - card.markupPct) < 1e-9

  const current = cardBreakdown(card, policies.msaFeePct, policies.overtimeMultiplier)
  const next = invalid ? current : rateBreakdown(payValue, nextMarkupPct, policies.msaFeePct, policies.overtimeMultiplier)

  const venueMetro = React.useMemo(() => venueMetroMap(venues), [venues])
  const affected = React.useMemo(() => repricedRequests(card, requests, venueMetro, today), [card, requests, venueMetro, today])
  const impact = React.useMemo(() => repriceImpact(affected, next.bill, today), [affected, next.bill, today])
  const market = metroById(card.metro)

  const publish = (e: React.FormEvent) => {
    e.preventDefault()
    if (invalid || unchanged) return
    const repriced = updateRateCard(card.id, { payRate: payValue, markupPct: nextMarkupPct })
    toast.success(`Rate published · ${plural(repriced, "upcoming request")} repriced`, {
      description: `${position?.title ?? "Position"} · ${metroLabel(card.metro)} v${card.version + 1}, bill ${rate(next.bill)} effective today.`,
    })
    onDone(true)
  }

  const rows: { label: string; from: number; to: number; suffix?: string }[] = [
    { label: "Bill rate", from: current.bill, to: next.bill, suffix: "/hr" },
    { label: `Program fee (${policies.msaFeePct}%)`, from: current.fee, to: next.fee },
    { label: "Supplier net", from: current.net, to: next.net, suffix: "/hr" },
    { label: `Overtime bill (${policies.overtimeMultiplier}×)`, from: current.ot, to: next.ot, suffix: "/hr" },
  ]

  return (
    <form onSubmit={publish} className="contents">
      <DialogHeader>
        <DialogTitle>
          Edit rate · {position?.title ?? "Position"} · {metroLabel(card.metro)}
        </DialogTitle>
        <DialogDescription>
          Publishing creates v{card.version + 1}, effective today, and reprices every upcoming request for this position in{" "}
          {metroLabel(card.metro)}, no work-order revisions.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field data-invalid={payInvalid || undefined}>
          <FieldLabel htmlFor="rate-pay">Pro pay rate</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>$</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="rate-pay"
              inputMode="decimal"
              autoComplete="off"
              value={pay}
              onChange={(e) => setPay(e.target.value)}
              aria-invalid={payInvalid || undefined}
              className="tabular"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>/hr</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          {payInvalid ? (
            <FieldError>Enter a pay rate between $7.25 and $150.</FieldError>
          ) : (
            <FieldDescription>Currently {rate(card.payRate)}</FieldDescription>
          )}
        </Field>
        <Field data-invalid={markupInvalid || undefined}>
          <FieldLabel htmlFor="rate-markup">Supplier markup</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="rate-markup"
              inputMode="decimal"
              autoComplete="off"
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              aria-invalid={markupInvalid || undefined}
              className="tabular"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>%</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          {markupInvalid ? (
            <FieldError>Markup must be between 0% and 150%.</FieldError>
          ) : (
            <FieldDescription>{market ? `${market.label} default ${markupLabel(market.markupPct)}` : `Currently ${markupLabel(card.markupPct)}`}</FieldDescription>
          )}
        </Field>
      </FieldGroup>

      <div className="flex flex-col overflow-hidden rounded-lg border">
        {rows.map((row) => {
          const delta = round2(row.to - row.from)
          return (
            <div key={row.label} className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="flex items-center gap-2 tabular">
                <span className={cn("text-muted-foreground", delta !== 0 && "line-through decoration-muted-foreground/40")}>
                  {money(row.from, true)}
                </span>
                <ArrowRightIcon className="size-3 text-muted-foreground" aria-hidden />
                <span className="font-medium">
                  {money(row.to, true)}
                  {row.suffix ? <span className="font-normal text-muted-foreground">{row.suffix}</span> : null}
                </span>
                {delta !== 0 ? (
                  <span className={cn("w-14 text-right text-xs font-medium", delta > 0 ? "text-warning-foreground dark:text-warning" : "text-success")}>
                    {signedMoney(delta, true)}
                  </span>
                ) : (
                  <span className="w-14 text-right text-xs text-muted-foreground">–</span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 rounded-lg bg-muted/50 p-3">
        <RefreshCwIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="font-medium">
            {impact.count === 0
              ? "No upcoming requests to reprice"
              : `Reprices ${plural(impact.count, "upcoming request")} instantly`}
          </p>
          {impact.count > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">
                {[
                  impact.active ? `${impact.active} live` : null,
                  impact.pending ? `${impact.pending} pending approval` : null,
                  impact.drafts ? plural(impact.drafts, "draft") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {impact.through ? ` · through ${formatDate(impact.through, "MMM d")}` : ""} · {Math.round(impact.hours).toLocaleString()} scheduled hours
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border bg-background px-2.5 py-2">
                  <div className="text-xs text-muted-foreground">Weekly impact · next 7 days</div>
                  <div className="font-heading text-base font-semibold tabular">{signedMoney(impact.next7)}</div>
                </div>
                <div className="rounded-md border bg-background px-2.5 py-2">
                  <div className="text-xs text-muted-foreground">All upcoming requests</div>
                  <div className="font-heading text-base font-semibold tabular">{signedMoney(impact.total)}</div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">New requests for this position in {metroLabel(card.metro)} will use the new rate.</p>
          )}
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={invalid || unchanged}>
          Publish rate
        </Button>
      </DialogFooter>
    </form>
  )
}
