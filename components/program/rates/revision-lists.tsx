"use client"

import * as React from "react"
import { ArrowRightIcon, CheckIcon, GitPullRequestArrowIcon, HistoryIcon, InboxIcon, QuoteIcon, XIcon } from "lucide-react"

import { SupplierMark } from "@/components/app/identity"
import { EmptyState, TimeAgo } from "@/components/app/misc"
import { ChangeStatusBadge, StatusBadge } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useData, usePersona } from "@/hooks/use-demo"
import { formatDate } from "@/lib/dates"
import { money, plural, round2 } from "@/lib/format"
import { PROGRAM_NAME } from "@/lib/reference"
import { billFromPay } from "@/lib/rules"
import type { ChangeRequest, RateCardEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

import { repricedRequests, repriceImpact, splitDecisionNote, venueMetroMap } from "../program-data"
import { signedMoney, useToday } from "../shared"
import { isPublishedRateActivity, metroLabel, prettyRateText } from "./rate-format"

function useRevisionContext() {
  const rateCards = useData((d) => d.rateCards)
  const positions = useData((d) => d.positions)
  const suppliers = useData((d) => d.suppliers)
  return React.useMemo(
    () => ({
      cards: new Map(rateCards.map((r) => [r.id, r])),
      positions: new Map(positions.map((p) => [p.id, p])),
      supplierByContact: new Map(suppliers.map((s) => [s.contactName, s])),
    }),
    [rateCards, positions, suppliers]
  )
}

function PayChange({ card, change }: { card?: RateCardEntry; change: ChangeRequest }) {
  if (!card || !change.newRate) return null
  const payDelta = round2(change.newRate - card.payRate)
  const pctDelta = card.payRate ? (payDelta / card.payRate) * 100 : 0
  const newBill = billFromPay(change.newRate, card.markupPct)
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="flex flex-col gap-0.5 rounded-md bg-muted/50 px-2.5 py-2">
        <span className="text-xs text-muted-foreground">Pro pay</span>
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium tabular">
          <span className="text-muted-foreground">{money(card.payRate, true)}</span>
          <ArrowRightIcon className="size-3 text-muted-foreground" aria-hidden />
          {money(change.newRate, true)}
          <span className="text-xs font-normal text-muted-foreground">
            {signedMoney(payDelta, true)} · {pctDelta >= 0 ? "+" : "−"}
            {Math.abs(pctDelta).toFixed(1)}%
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-0.5 rounded-md bg-muted/50 px-2.5 py-2">
        <span className="text-xs text-muted-foreground">Bill rate</span>
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium tabular">
          <span className="text-muted-foreground">{money(card.billRate, true)}</span>
          <ArrowRightIcon className="size-3 text-muted-foreground" aria-hidden />
          {money(newBill, true)}
          <span className="text-xs font-normal text-muted-foreground">{signedMoney(round2(newBill - card.billRate), true)}/hr</span>
        </span>
      </div>
    </div>
  )
}

// Program queue -------------------------------------------------------------------

export function PendingRevisions({
  pending,
  onDecide,
}: {
  pending: ChangeRequest[]
  onDecide: (changeId: string, approve: boolean) => void
}) {
  const ctx = useRevisionContext()
  const requests = useData((d) => d.requests)
  const venues = useData((d) => d.venues)
  const today = useToday()
  const venueMetro = React.useMemo(() => venueMetroMap(venues), [venues])

  return (
    <Card id="revisions" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitPullRequestArrowIcon className="size-4 text-primary" aria-hidden />
          Rate revisions awaiting you
        </CardTitle>
        <CardDescription>
          Approving publishes a new card version and reprices upcoming requests on the spot, no Mon/Thu revision cycle, no per-work-order
          acceptance.
        </CardDescription>
        <CardAction>
          <StatusBadge tone="warning">{plural(pending.length, "pending")}</StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className={cn("grid gap-3", pending.length > 1 && "lg:grid-cols-2")}>
        {pending.map((change) => {
          const card = change.rateCardId ? ctx.cards.get(change.rateCardId) : undefined
          const position = ctx.positions.get(change.positionId ?? card?.positionId ?? "")
          const supplier = ctx.supplierByContact.get(change.requestedBy)
          const impact =
            card && change.newRate
              ? repriceImpact(repricedRequests(card, requests, venueMetro, today), billFromPay(change.newRate, card.markupPct), today)
              : null
          return (
            <div key={change.id} className="flex flex-col gap-3 rounded-xl border bg-background p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <SupplierMark supplier={supplier} size="md" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {position?.title ?? "Position"} · {card ? metroLabel(card.metro) : "–"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {change.requestedBy}
                      {supplier ? ` · ${supplier.shortName}` : ""} · <TimeAgo value={change.createdAt} />
                    </span>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{change.id}</span>
              </div>
              <div className={cn("flex flex-col gap-3", pending.length === 1 && "lg:grid lg:grid-cols-2 lg:items-center lg:gap-6")}>
                <PayChange card={card} change={change} />
                {change.detail ? (
                  <blockquote className="flex gap-2 text-sm text-muted-foreground">
                    <QuoteIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                    <span className="text-pretty">{splitDecisionNote(change.detail).detail}</span>
                  </blockquote>
                ) : null}
              </div>
              <div className="mt-auto flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-muted-foreground">
                  {impact && impact.count > 0 ? (
                    <>
                      Reprices <span className="font-medium text-foreground">{plural(impact.count, "upcoming request")}</span> ·{" "}
                      <span className="font-medium text-foreground tabular">{signedMoney(impact.total)}</span>
                      {impact.through ? ` through ${formatDate(impact.through, "MMM d")}` : ""}
                    </>
                  ) : (
                    "No upcoming requests affected"
                  )}
                </span>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => onDecide(change.id, false)}>
                    <XIcon data-icon="inline-start" />
                    Decline
                  </Button>
                  <Button size="sm" onClick={() => onDecide(change.id, true)}>
                    <CheckIcon data-icon="inline-start" />
                    Approve
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function DecisionRow({ change, label }: { change: ChangeRequest; label: React.ReactNode }) {
  const { detail, note } = splitDecisionNote(change.detail)
  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-sm font-medium text-pretty">{label}</span>
        <ChangeStatusBadge status={change.status} className="shrink-0" />
      </div>
      <span className="text-xs text-muted-foreground">
        {change.status === "Pending" ? (
          <>
            Sent <TimeAgo value={change.createdAt} /> · in review by the {PROGRAM_NAME} program office
          </>
        ) : (
          <>
            {change.decidedBy ?? "Program office"} · <TimeAgo value={change.decidedAt ?? change.createdAt} />
          </>
        )}
      </span>
      {note ? (
        <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Decision note:</span> {note}
        </p>
      ) : detail && change.status === "Pending" ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </li>
  )
}

export function RecentDecisions({ className }: { className?: string }) {
  const changes = useData((d) => d.changeRequests)
  const ctx = useRevisionContext()
  const decided = React.useMemo(
    () =>
      changes
        .filter((c) => c.type === "Rate revision" && (c.status === "Approved" || c.status === "Declined"))
        .sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt))
        .slice(0, 6),
    [changes]
  )
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="size-4 text-muted-foreground" aria-hidden />
          Recent decisions
        </CardTitle>
        <CardDescription>Rate revisions you&apos;ve approved or declined.</CardDescription>
      </CardHeader>
      <CardContent>
        {decided.length === 0 ? (
          <EmptyState icon={InboxIcon} title="No decisions yet" description="Approved and declined revisions show up here." />
        ) : (
          <ul className="flex flex-col divide-y">
            {decided.map((c) => {
              const card = c.rateCardId ? ctx.cards.get(c.rateCardId) : undefined
              const supplier = ctx.supplierByContact.get(c.requestedBy)
              return (
                <DecisionRow
                  key={c.id}
                  change={c}
                  label={
                    <>
                      {ctx.positions.get(c.positionId ?? "")?.title ?? "Position"} · {card ? metroLabel(card.metro) : "–"}{" "}
                      <span className="font-normal text-muted-foreground">
                        → {money(c.newRate ?? 0, true)}/hr · {supplier?.shortName ?? c.requestedBy}
                      </span>
                    </>
                  }
                />
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function MyRevisions({ className }: { className?: string }) {
  const persona = usePersona()
  const changes = useData((d) => d.changeRequests)
  const ctx = useRevisionContext()
  const mine = React.useMemo(
    () =>
      changes
        .filter((c) => c.type === "Rate revision" && c.requestedBy === persona.name)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [changes, persona]
  )
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitPullRequestArrowIcon className="size-4 text-muted-foreground" aria-hidden />
          Your revision requests
        </CardTitle>
        <CardDescription>Decided in Mise by the {PROGRAM_NAME} program office, you&apos;re notified either way.</CardDescription>
      </CardHeader>
      <CardContent>
        {mine.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title="No revision requests yet"
            description="Use “Request revision” on any rate card to propose a new pay rate."
          />
        ) : (
          <ul className="flex flex-col divide-y">
            {mine.map((c) => {
              const card = c.rateCardId ? ctx.cards.get(c.rateCardId) : undefined
              return (
                <DecisionRow
                  key={c.id}
                  change={c}
                  label={
                    <>
                      {ctx.positions.get(c.positionId ?? "")?.title ?? "Position"} · {card ? metroLabel(card.metro) : "–"}{" "}
                      <span className="font-normal text-muted-foreground">→ {money(c.newRate ?? 0, true)}/hr</span>
                    </>
                  }
                />
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function RateActivity({ className, publishedOnly = false }: { className?: string; publishedOnly?: boolean }) {
  const activities = useData((d) => d.activities)
  const items = React.useMemo(
    () =>
      activities
        .filter((a) => a.kind === "rate" && (!publishedOnly || isPublishedRateActivity(a.text)))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 8),
    [activities, publishedOnly]
  )
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="size-4 text-muted-foreground" aria-hidden />
          {publishedOnly ? "Recent rate changes" : "Rate activity"}
        </CardTitle>
        <CardDescription>
          {publishedOnly
            ? "Every published change reprices upcoming requests automatically."
            : "Published changes and revision requests across the program."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState icon={InboxIcon} title="No rate changes yet" description="Published rate changes appear here." />
        ) : (
          <ol className="relative flex flex-col gap-4 before:absolute before:inset-y-1 before:left-[5px] before:w-px before:bg-border">
            {items.map((a) => (
              <li key={a.id} className="relative flex gap-3 pl-5">
                <span
                  className={cn(
                    "absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-card",
                    isPublishedRateActivity(a.text) ? "bg-primary" : "bg-muted-foreground/40"
                  )}
                  aria-hidden
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm text-pretty">{prettyRateText(a.text)}</span>
                  <TimeAgo value={a.at} className="text-xs text-muted-foreground" />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
