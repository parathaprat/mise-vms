"use client"

import * as React from "react"
import { ArrowRightIcon, FlaskConicalIcon, PencilLineIcon, RotateCcwIcon, SendIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useData, usePersona, usePolicies } from "@/hooks/use-demo"
import { formatDate } from "@/lib/dates"
import { money, num, plural, round2 } from "@/lib/format"
import { METROS, PROGRAM_NAME } from "@/lib/reference"
import { billFromPay } from "@/lib/rules"
import { requestInScope } from "@/lib/selectors"
import { cn } from "@/lib/utils"

import { CATEGORIES, pendingRateRevisionFor, repricedRequests, repriceImpact, venueMetroMap } from "../program-data"
import { LabeledSlider, signedMoney, useToday } from "../shared"
import { cardBreakdown, categoryDotStyle, metroLabel, rateBreakdown } from "./rate-format"

const MIN_PCT = -10
const MAX_PCT = 20

function formatPct(value: number): string {
  if (value === 0) return "0%"
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`
}

interface RateSimulatorProps {
  defaultMetro?: string
  defaultPositionId?: string
  /** Program office (or venues, when policy allows) can carry the scenario into the editor. */
  onEdit?: (cardId: string, pay: number) => void
  canEdit?: (metro: string) => boolean
  /** Suppliers can turn the scenario into a revision request. */
  onRevise?: (cardId: string, pay: number) => void
  className?: string
}

export function RateSimulator({
  defaultMetro = "chicago",
  defaultPositionId = "p-cash-bartender",
  onEdit,
  canEdit,
  onRevise,
  className,
}: RateSimulatorProps) {
  const persona = usePersona()
  const positions = useData((d) => d.positions)
  const rateCards = useData((d) => d.rateCards)
  const requests = useData((d) => d.requests)
  const venues = useData((d) => d.venues)
  const changes = useData((d) => d.changeRequests)
  const policies = usePolicies()
  const today = useToday()

  const [positionId, setPositionId] = React.useState(defaultPositionId)
  const [metro, setMetro] = React.useState(defaultMetro)
  const [pct, setPct] = React.useState(5)

  const card = React.useMemo(
    () => rateCards.find((r) => r.positionId === positionId && r.metro === metro),
    [rateCards, positionId, metro]
  )
  const groups = React.useMemo(
    () => CATEGORIES.map((category) => ({ category, items: positions.filter((p) => p.category === category) })).filter((g) => g.items.length > 0),
    [positions]
  )
  const venueMetro = React.useMemo(() => venueMetroMap(venues), [venues])
  const scoped = React.useMemo(() => requests.filter((r) => requestInScope(r, persona)), [requests, persona])

  const newPay = card ? round2(card.payRate * (1 + pct / 100)) : 0
  const current = card ? cardBreakdown(card, policies.msaFeePct, policies.overtimeMultiplier) : null
  const next = card ? rateBreakdown(newPay, card.markupPct, policies.msaFeePct, policies.overtimeMultiplier) : null
  const nextBill = card ? billFromPay(newPay, card.markupPct) : 0
  const affected = React.useMemo(() => (card ? repricedRequests(card, scoped, venueMetro, today) : []), [card, scoped, venueMetro, today])
  const impact = repriceImpact(affected, nextBill, today)
  const pendingMine = card && onRevise ? pendingRateRevisionFor(changes, card.id, persona.name) : undefined

  const scopeLabel = persona.id === "supplier" ? "you're staffing" : persona.id === "venue" ? "at your venues" : "program-wide"

  const tiles =
    current && next
      ? [
          { label: "Pro pay", from: current.pay, to: next.pay },
          { label: "Bill rate", from: current.bill, to: next.bill, emphasis: true },
          { label: "Supplier net", from: current.net, to: next.net },
          { label: `OT bill (${policies.overtimeMultiplier}×)`, from: current.ot, to: next.ot },
        ]
      : []

  const editable = !!onEdit && !!card && (canEdit ? canEdit(card.metro) : true)

  return (
    <Card id="simulator" className={cn("scroll-mt-20", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConicalIcon className="size-4 text-primary" aria-hidden />
          Rate simulator
        </CardTitle>
        <CardDescription>Model a pay change and see what it does to bill rates and upcoming spend before anyone publishes it.</CardDescription>
        <CardAction>
          <Badge variant="outline" className="text-muted-foreground">
            What-if · nothing is saved
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="sim-position">Position</FieldLabel>
            <Select value={positionId} onValueChange={setPositionId}>
              <SelectTrigger id="sim-position" className="w-full">
                <SelectValue placeholder="Choose a position" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectGroup key={g.category}>
                    <SelectLabel>{g.category}</SelectLabel>
                    {g.items.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="hue-solid size-2 rounded-full" style={categoryDotStyle(p.category)} aria-hidden />
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="sim-market">Market</FieldLabel>
            <Select value={metro} onValueChange={setMetro}>
              <SelectTrigger id="sim-market" className="w-full">
                <SelectValue placeholder="Choose a market" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {METROS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                      <span className="text-muted-foreground">{m.state}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span id="sim-change-label" className="text-sm font-medium">
              Pay change
            </span>
            <div className="flex items-center gap-1.5">
              {pct !== 0 ? (
                <Button variant="ghost" size="xs" onClick={() => setPct(0)}>
                  <RotateCcwIcon data-icon="inline-start" />
                  Reset
                </Button>
              ) : null}
              <span
                className={cn(
                  "min-w-16 rounded-md px-2 py-0.5 text-center font-heading text-sm font-semibold tabular",
                  pct === 0 ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary dark:bg-primary/20"
                )}
                aria-live="polite"
              >
                {formatPct(pct)}
              </span>
            </div>
          </div>
          <LabeledSlider
            value={[pct]}
            min={MIN_PCT}
            max={MAX_PCT}
            step={0.5}
            onValueChange={(v) => setPct(v[0] ?? 0)}
            aria-labelledby="sim-change-label"
            className="py-1.5"
          />
          <div className="flex justify-between text-xs text-muted-foreground tabular" aria-hidden>
            <span>−10%</span>
            <span>0%</span>
            <span>+10%</span>
            <span>+20%</span>
          </div>
        </div>

        {card && current && next ? (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {tiles.map((t) => {
                const delta = round2(t.to - t.from)
                return (
                  <div
                    key={t.label}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-lg border px-3 py-2.5",
                      t.emphasis ? "border-primary/25 bg-primary/5 dark:bg-primary/10" : "bg-muted/40"
                    )}
                  >
                    <span className="text-xs text-muted-foreground">{t.label}</span>
                    <span className={cn("font-heading text-lg font-semibold tracking-tight tabular", t.emphasis && "text-primary")}>
                      {money(t.to, true)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular">
                      was {money(t.from, true)}
                      {delta !== 0 ? ` · ${signedMoney(delta, true)}` : ""}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
              <p className="text-sm">
                {impact.count === 0 ? (
                  <>
                    No upcoming {positions.find((p) => p.id === positionId)?.title ?? "position"} requests {scopeLabel} in {metroLabel(metro)}.
                    New requests would bill at {money(next.bill, true)}/hr.
                  </>
                ) : (
                  <>
                    Applies to <span className="font-medium">{plural(impact.count, "upcoming request")}</span> {scopeLabel} ·{" "}
                    {num(Math.round(impact.hours))} scheduled hours
                    {impact.through ? ` through ${formatDate(impact.through, "MMM d")}` : ""}.
                  </>
                )}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <ImpactTile label="Per Pro-hour" value={signedMoney(round2(next.bill - current.bill), true)} />
                <ImpactTile label="Next 7 days" value={signedMoney(impact.next7)} emphasis />
                <ImpactTile label="All upcoming" value={signedMoney(impact.total)} />
              </div>
            </div>
          </>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            There&apos;s no rate card for this position in {metroLabel(metro)} yet.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3 border-t sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted-foreground text-pretty">
          {editable
            ? "Opening the editor pre-fills this pay rate, you still review before publishing."
            : onRevise
              ? pendingMine
                ? `You already have a revision pending for this card (${pendingMine.id}).`
                : `Turn this scenario into a revision request for the ${PROGRAM_NAME} program office.`
              : `Rate changes are published by the ${PROGRAM_NAME} program office.`}
        </span>
        {editable && card ? (
          <Button variant="outline" onClick={() => onEdit?.(card.id, newPay)} disabled={pct === 0}>
            <PencilLineIcon data-icon="inline-start" />
            Open in editor
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        ) : onRevise && card ? (
          <Button variant="outline" onClick={() => onRevise(card.id, newPay)} disabled={pct === 0 || !!pendingMine}>
            <SendIcon data-icon="inline-start" />
            Request this revision
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  )
}

function ImpactTile({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-md border px-2.5 py-2", emphasis ? "border-primary/25 bg-card" : "bg-background")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-heading text-base font-semibold tabular", emphasis && "text-primary")}>{value}</span>
    </div>
  )
}
