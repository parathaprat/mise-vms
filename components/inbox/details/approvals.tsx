"use client"

import Link from "next/link"
import * as React from "react"
import { addDays } from "date-fns"
import { ArrowRightIcon, CircleDollarSignIcon, ClipboardCheckIcon, QuoteIcon, XIcon } from "lucide-react"

import { FillMeter } from "@/components/app/fill-meter"
import { SupplierCell } from "@/components/app/identity"
import { KeyValue } from "@/components/app/misc"
import { RequestStatusBadge, StatusBadge, type Tone } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useData, useNow, usePolicies } from "@/hooks/use-demo"
import { formatDate, formatDateList, formatDateTime, formatTimeRange, parseLocal, timeAgo, toISODate } from "@/lib/dates"
import { hours, money, num, pct, plural, rate, round2 } from "@/lib/format"
import { metroById } from "@/lib/reference"
import { billFromPay, payableShiftHours, totalSlots } from "@/lib/rules"
import { buildRequestView, type Lookups } from "@/lib/selectors"
import type { ApprovalStep, ChangeRequest, ISODate, Policies, RateCardEntry, StaffingRequest, Supplier } from "@/lib/types"

import { declineRequestWithToast, decideChangeWithToast } from "../actions"
import {
  Callout,
  CopilotButton,
  DetailShell,
  Facts,
  List,
  ListRow,
  MissingDetail,
  NoteForm,
  OpenButton,
  PrimaryButton,
  Section,
  Stats,
  type DetailContext,
  type KindDetailProps,
} from "../detail-layout"
import { targetId } from "../kinds"

const STEP_TONE: Record<ApprovalStep["status"], Tone> = {
  Approved: "success",
  "Auto-approved": "success",
  Pending: "warning",
  Rejected: "danger",
}

function DeclineButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" onClick={onClick}>
      <XIcon data-icon="inline-start" />
      Decline
    </Button>
  )
}

// Staffing request approval -------------------------------------------------------

export function RequestApprovalDetail({ item, ctx }: KindDetailProps) {
  const now = useNow()
  const policies = usePolicies()
  const [declining, setDeclining] = React.useState(false)
  const request = ctx.lookups.requests.get(targetId(item))
  const view = request ? buildRequestView(request, ctx.lookups, now) : null
  if (!view || view.req.state !== "pending") return <MissingDetail item={item} ctx={ctx} />

  const { req, venue, position, costCenter, estimate, hoursPerShift } = view
  const limit = policies.autoApproveRequestsUnder
  const share = costCenter.weeklyBudget > 0 ? estimate / costCenter.weeklyBudget : 0
  const waitingOn = req.approvals.find((s) => s.status === "Pending")
  const signOff = waitingOn && waitingOn.approverName !== ctx.persona.name ? `${waitingOn.approverName}'s` : "your"
  const suppliers = req.supplierIds
    .map((id) => ctx.lookups.suppliers.get(id))
    .filter((s): s is Supplier => !!s)
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))

  return (
    <DetailShell
      item={item}
      ctx={ctx}
      footer={
        declining ? (
          <NoteForm
            label={`Tell ${req.createdBy} why`}
            description="The request goes back as declined and nothing is distributed to suppliers."
            placeholder="e.g. Cover this with the existing headcount on JP-4003 instead."
            submitLabel="Decline request"
            destructive
            onCancel={() => setDeclining(false)}
            onSubmit={(note) => ctx.commit(() => declineRequestWithToast(req.id, note))}
          />
        ) : (
          <>
            <PrimaryButton ctx={ctx} />
            <DeclineButton onClick={() => setDeclining(true)} />
            <OpenButton item={item} ctx={ctx} label="Open request" />
            <CopilotButton ctx={ctx} prompt={`Should I approve ${req.id}? Compare it with similar requests at ${venue.shortName}`} />
          </>
        )
      }
    >
      <Stats
        items={[
          { label: "Shifts", value: num(totalSlots(req)), hint: `${req.headcount} × ${plural(req.dates.length, "date")}` },
          { label: "Hours each", value: hours(hoursPerShift), hint: formatTimeRange(req.startTime, req.endTime) },
          { label: "Bill rate", value: rate(req.billRate), hint: `${rate(req.payRate)} to Pros` },
        ]}
      />

      {estimate >= limit ? (
        <Callout icon={CircleDollarSignIcon} title={`${money(estimate - limit)} over the ${money(limit)} auto-approve limit`}>
          Requests under {money(limit)} distribute the moment they&apos;re submitted. This one needs {signOff} sign-off first.
        </Callout>
      ) : waitingOn ? (
        <Callout icon={ClipboardCheckIcon} title={waitingOn.label}>
          This one needs {signOff} sign-off{waitingOn.note ? `, ${waitingOn.note}` : ""}.
        </Callout>
      ) : null}

      <Section title="Request">
        <Facts>
          <KeyValue label="Venue">{venue.shortName}</KeyValue>
          <KeyValue label="Position">{position.title}</KeyValue>
          <KeyValue label="Event">{req.eventName ?? req.reason}</KeyValue>
          <KeyValue label="Dates">{formatDateList(req.dates, now)}</KeyValue>
          <KeyValue label="Hire type">{req.hireType}</KeyValue>
          <KeyValue label="Requested by">
            {req.createdBy} · <span className="font-normal text-muted-foreground">{timeAgo(req.createdAt, now)}</span>
          </KeyValue>
        </Facts>
      </Section>

      <Section
        title="Budget"
        action={
          <span className="text-xs text-muted-foreground">
            {costCenter.code} · GL {costCenter.glCode}
          </span>
        }
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{costCenter.name}</span>
            <span className="shrink-0 text-muted-foreground tabular">
              <span className="font-medium text-foreground">{money(estimate)}</span> of {money(costCenter.weeklyBudget)} a week
            </span>
          </div>
          <Progress value={Math.min(100, share * 100)} aria-label={`${pct(share)} of the weekly budget`} />
          <p className="text-xs text-muted-foreground">
            {pct(share)} of the cost center&apos;s weekly budget · approver {costCenter.approverName}
          </p>
        </div>
      </Section>

      <Section title="Distribution on approval">
        <List label="Suppliers">
          {suppliers.map((s) => (
            <ListRow key={s.id} className="justify-between">
              <SupplierCell supplier={s} subtitle={`Tier ${s.tier} · ${s.kind}`} />
              {s.coiExpires < ctx.today ? (
                <StatusBadge tone="danger">COI expired: skipped</StatusBadge>
              ) : s.tier === 1 ? (
                <StatusBadge tone="primary" dot={false}>
                  First {policies.tier1ExclusiveMinutes} min
                </StatusBadge>
              ) : (
                <span className="text-xs text-muted-foreground">Then open to all</span>
              )}
            </ListRow>
          ))}
        </List>
      </Section>

      {req.approvals.length > 0 ? (
        <Section title="Approval chain">
          <List label="Approval chain">
            {req.approvals.map((step) => (
              <ListRow key={step.id} className="justify-between">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{step.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[step.approverName, step.at ? formatDateTime(step.at) : null, step.note].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <StatusBadge tone={STEP_TONE[step.status]}>{step.status}</StatusBadge>
              </ListRow>
            ))}
          </List>
        </Section>
      ) : null}

      {req.notes || req.duties ? (
        <Section title="Notes for Pros">
          <p className="text-sm text-pretty text-muted-foreground">{[req.duties, req.notes].filter(Boolean).join(" ")}</p>
        </Section>
      ) : null}
    </DetailShell>
  )
}

// Change requests -------------------------------------------------------------------

interface ImpactRow {
  label: string
  from?: string
  to: string
  hint?: string
}

interface ImpactContext {
  request?: StaffingRequest
  card?: RateCardEntry
  lookups: Lookups
  policies: Policies
  today: ISODate
  now: Date
}

/** What approving would change, mirroring how the store applies each change type. */
function changeImpact(change: ChangeRequest, { request, card, lookups, policies, today, now }: ImpactContext): ImpactRow[] {
  switch (change.type) {
    case "Headcount increase": {
      if (!request || !change.delta) return []
      const upcoming = request.dates.filter((d) => d >= today).length
      const shifts = change.delta * upcoming
      return [
        {
          label: "Headcount",
          from: num(request.headcount),
          to: num(request.headcount + change.delta),
          hint: `+${pct(change.delta / request.headcount)} · auto-approves up to ${policies.autoApproveHeadcountPct}%`,
        },
        { label: "New shifts", to: num(shifts), hint: `${change.delta} more × ${plural(upcoming, "upcoming date")}` },
        { label: "Added cost", to: money(round2(shifts * payableShiftHours(request) * request.billRate)), hint: `at ${rate(request.billRate)}` },
      ]
    }
    case "Rate revision": {
      if (!card || !change.newRate) return []
      const bill = billFromPay(change.newRate, card.markupPct)
      const position = lookups.positions.get(card.positionId)?.title ?? "matching"
      const metro = metroById(card.metro)?.label ?? card.metro
      const repriced = [...lookups.requests.values()].filter(
        (r) =>
          r.positionId === card.positionId &&
          lookups.venues.get(r.venueId)?.metro === card.metro &&
          r.state !== "cancelled" &&
          [...r.dates].sort()[0] >= today
      ).length
      const delta = (change.newRate - card.payRate) / card.payRate
      return [
        { label: "Pay rate", from: rate(card.payRate), to: rate(change.newRate), hint: `${delta >= 0 ? "+" : ""}${pct(delta, 1)} for Pros` },
        { label: "Bill rate", from: rate(card.billRate), to: rate(bill), hint: `${pct(card.markupPct)} supplier markup` },
        { label: "Repriced", to: plural(repriced, "request"), hint: `Upcoming ${position} requests in ${metro}` },
      ]
    }
    case "Date extension": {
      if (!request) return []
      const added = request.dates.map((d) => toISODate(addDays(parseLocal(d), 7))).filter((d) => !request.dates.includes(d))
      const shifts = added.length * request.headcount
      return [
        { label: "Dates", from: formatDateList(request.dates, now), to: formatDateList([...request.dates, ...added], now), hint: `+${plural(added.length, "date")}` },
        { label: "New shifts", to: num(shifts), hint: `${request.headcount} × ${plural(added.length, "new date")}` },
        { label: "Added cost", to: money(round2(shifts * payableShiftHours(request) * request.billRate)), hint: `at ${rate(request.billRate)}` },
      ]
    }
    default:
      return []
  }
}

function ImpactList({ rows }: { rows: ImpactRow[] }) {
  return (
    <List label="Impact">
      {rows.map((row) => (
        <ListRow key={row.label} className="justify-between">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm">{row.label}</span>
            {row.hint ? <span className="truncate text-xs text-muted-foreground">{row.hint}</span> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-sm font-medium tabular">
            {row.from ? (
              <>
                <span className="font-normal text-muted-foreground">{row.from}</span>
                <ArrowRightIcon className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="sr-only">to</span>
              </>
            ) : null}
            <span>{row.to}</span>
          </div>
        </ListRow>
      ))}
    </List>
  )
}

function ChangeContext({ request, card, ctx }: { request?: StaffingRequest; card?: RateCardEntry; ctx: DetailContext }) {
  const now = useNow()
  if (request) {
    const view = buildRequestView(request, ctx.lookups, now)
    return (
      <Section
        title="Request"
        action={
          <Link href={`/requests/${request.id}`} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {request.id}
          </Link>
        }
      >
        <Facts>
          <KeyValue label="Venue">{view?.venue.shortName ?? "–"}</KeyValue>
          <KeyValue label="Event">{request.eventName ?? request.reason}</KeyValue>
          <KeyValue label="Dates">{formatDateList(request.dates, now)}</KeyValue>
          <KeyValue label="Time">{formatTimeRange(request.startTime, request.endTime)}</KeyValue>
          <KeyValue label="Filled">{view ? <FillMeter fill={view.fill} className="max-w-40" /> : "–"}</KeyValue>
          <KeyValue label="Status">{view ? <RequestStatusBadge status={view.status} /> : "–"}</KeyValue>
        </Facts>
      </Section>
    )
  }
  if (card) {
    return (
      <Section title="Rate card">
        <Facts>
          <KeyValue label="Position">{ctx.lookups.positions.get(card.positionId)?.title ?? "–"}</KeyValue>
          <KeyValue label="Market">{metroById(card.metro)?.label ?? card.metro}</KeyValue>
          <KeyValue label="Version">v{card.version}</KeyValue>
          <KeyValue label="Effective since">{formatDate(card.effectiveFrom, "MMM d, yyyy")}</KeyValue>
          <KeyValue label="Last updated by">{card.updatedBy}</KeyValue>
        </Facts>
      </Section>
    )
  }
  return null
}

export function ChangeDetail({ item, ctx }: KindDetailProps) {
  const changeId = targetId(item)
  const change = useData((d) => d.changeRequests.find((c) => c.id === changeId))
  const rateCards = useData((d) => d.rateCards)
  const policies = usePolicies()
  const now = useNow()
  const [declining, setDeclining] = React.useState(false)
  if (!change || change.status !== "Pending") return <MissingDetail item={item} ctx={ctx} />

  const request = change.requestId ? ctx.lookups.requests.get(change.requestId) : undefined
  const card = change.rateCardId ? rateCards.find((r) => r.id === change.rateCardId) : undefined
  const impact = changeImpact(change, { request, card, lookups: ctx.lookups, policies, today: ctx.today, now })

  return (
    <DetailShell
      item={item}
      ctx={ctx}
      footer={
        declining ? (
          <NoteForm
            label={`Tell ${change.requestedBy} why`}
            description="They're notified with your note. Nothing changes on the request."
            placeholder="e.g. Let's revisit once the playoff schedule is set."
            submitLabel="Decline change"
            destructive
            onCancel={() => setDeclining(false)}
            onSubmit={(note) => ctx.commit(() => decideChangeWithToast(change.id, false, note))}
          />
        ) : (
          <>
            <PrimaryButton ctx={ctx} />
            <DeclineButton onClick={() => setDeclining(true)} />
            <OpenButton item={item} ctx={ctx} label={change.requestId ? "Open request" : "Open rate cards"} />
            <CopilotButton ctx={ctx} prompt={`What happens if I approve "${change.summary}"?`} />
          </>
        )
      }
    >
      <Callout icon={QuoteIcon} title={`${change.requestedBy} · ${timeAgo(change.createdAt, now)}`}>
        {change.detail}
      </Callout>
      {impact.length > 0 ? (
        <Section title="If you approve">
          <ImpactList rows={impact} />
        </Section>
      ) : null}
      <ChangeContext request={request} card={card} ctx={ctx} />
    </DetailShell>
  )
}
