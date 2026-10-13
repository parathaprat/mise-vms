"use client"

import Link from "next/link"
import { addDays } from "date-fns"
import {
  BadgeAlertIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  FileWarningIcon,
  GaugeIcon,
  MailIcon,
  RadioTowerIcon,
  ShieldCheckIcon,
  UserRoundXIcon,
  type LucideIcon,
} from "lucide-react"

import { SupplierCell, WorkerCell } from "@/components/app/identity"
import { KeyValue } from "@/components/app/misc"
import { StatusBadge, type Tone } from "@/components/app/status-badge"
import { formatCountdown } from "@/components/timesheets/model"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useData, useNow } from "@/hooks/use-demo"
import { daysFromToday, formatDate, formatTime, formatTimeRange, parseLocal, relativeDay, shiftWindow, toISODate } from "@/lib/dates"
import { num, pct, plural, rate, workerName } from "@/lib/format"
import { PROGRAM_NAME, metroById } from "@/lib/reference"
import { certStatus, type CertState } from "@/lib/rules"
import { buildRequestView, groupBy, venueInScope } from "@/lib/selectors"
import type { Shift, StaffingRequest, Supplier, Worker } from "@/lib/types"

import { assignWithToast, rankMatches } from "../actions"
import {
  Callout,
  CopilotButton,
  DetailShell,
  Facts,
  List,
  ListRow,
  MissingDetail,
  OpenButton,
  PrimaryButton,
  Section,
  Stats,
  type DetailContext,
  type KindDetailProps,
} from "../detail-layout"
import { targetId } from "../kinds"

// Staffing gaps -----------------------------------------------------------------------

export function StaffingDetail({ item, ctx }: KindDetailProps) {
  const data = useData((d) => d)
  const now = useNow()
  const requestId = targetId(item)
  const request = ctx.lookups.requests.get(requestId)
  const view = request ? buildRequestView(request, ctx.lookups, now) : null
  const shifts = ctx.lookups.shiftsByRequest.get(requestId) ?? []
  const refs = new Set(item.refIds)
  const open = shifts
    .filter((s) => refs.has(s.id) && !s.workerId && s.status === "Open")
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot)
  if (!view || open.length === 0) return <MissingDetail item={item} ctx={ctx} />

  const { req, venue, position, fill } = view
  const byDate = groupBy(open, (s) => s.date)
  const dates = [...byDate.keys()].sort()
  const firstDate = dates[0]
  const { start } = shiftWindow(firstDate, req.startTime, req.endTime)
  const isSupplier = ctx.persona.id === "supplier"

  return (
    <DetailShell
      item={item}
      ctx={ctx}
      footer={
        <>
          <PrimaryButton ctx={ctx} />
          {ctx.primary?.type !== "navigate" ? <OpenButton item={item} ctx={ctx} label="Open request" /> : null}
          <CopilotButton
            ctx={ctx}
            prompt={
              isSupplier
                ? `Who on our bench can cover the open ${position.title} shifts on ${req.id}?`
                : `Will ${req.id} fill in time? What are my options if it doesn't?`
            }
          />
        </>
      }
    >
      <Stats
        items={[
          { label: "Open", value: num(open.length), hint: plural(dates.length, "date") },
          { label: "Starts", value: formatCountdown(start, now), hint: `${relativeDay(firstDate, now)} · ${formatTime(req.startTime)}` },
          { label: "Filled", value: `${fill.filled}/${fill.total}`, hint: fill.total ? `${pct(fill.filled / fill.total)} of the request` : undefined },
        ]}
      />

      <Section title="Request">
        <Facts>
          <KeyValue label="Venue">{venue.shortName}</KeyValue>
          <KeyValue label="Position">{position.title}</KeyValue>
          <KeyValue label="Event">{req.eventName ?? req.reason}</KeyValue>
          <KeyValue label="Time">{formatTimeRange(req.startTime, req.endTime)}</KeyValue>
          {isSupplier ? <KeyValue label="Pay rate">{rate(req.payRate)}</KeyValue> : <KeyValue label="Bill rate">{rate(req.billRate)}</KeyValue>}
          <KeyValue label="Check-in">{req.checkIn || "–"}</KeyValue>
        </Facts>
      </Section>

      <Section title="Open shifts">
        <List label="Open shifts by date">
          {dates.map((date) => {
            const day = shifts.filter((s) => s.date === date && s.status !== "Cancelled")
            return (
              <ListRow key={date} className="justify-between">
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{relativeDay(date, now)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {formatDate(date, "MMM d")} · {formatTimeRange(req.startTime, req.endTime)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted-foreground tabular">
                    {day.filter((s) => s.workerId).length}/{day.length} filled
                  </span>
                  <StatusBadge tone="warning">{byDate.get(date)?.length ?? 0} open</StatusBadge>
                </div>
              </ListRow>
            )
          })}
        </List>
      </Section>

      {isSupplier ? (
        <BestMatches request={req} date={firstDate} shiftId={byDate.get(firstDate)?.[0]?.id} data={data} ctx={ctx} />
      ) : (
        <Distribution request={req} ctx={ctx} />
      )}
    </DetailShell>
  )
}

function BestMatches({
  request,
  date,
  shiftId,
  data,
  ctx,
}: {
  request: StaffingRequest
  date: string
  shiftId?: string
  data: Parameters<typeof rankMatches>[0]["data"]
  ctx: DetailContext
}) {
  const now = useNow()
  const matches = rankMatches({ data, request, date, today: ctx.today, supplierId: ctx.persona.supplierId }).slice(0, 5)
  const day = relativeDay(date, now)
  return (
    <Section title={`Best matches for ${day}`} action={<span className="text-xs text-muted-foreground">From your bench</span>}>
      {matches.length > 0 && shiftId ? (
        <List label={`Best matches for ${day}`}>
          {matches.map(({ worker, favorite }) => (
            <ListRow key={worker.id}>
              <WorkerCell
                worker={worker}
                favorite={favorite}
                size="sm"
                className="flex-1"
                subtitle={`★ ${worker.rating.toFixed(1)} · ${pct(worker.reliability)} show rate · ${num(worker.lifetimeShifts)} shifts`}
              />
              <Button
                variant="outline"
                size="sm"
                aria-label={`Assign ${workerName(worker)} on ${formatDate(date)}`}
                onClick={() => ctx.commit(() => assignWithToast(shiftId, worker))}
              >
                Assign
              </Button>
            </ListRow>
          ))}
        </List>
      ) : (
        <Callout icon={UserRoundXIcon} title="No eligible Pros are free">
          Everyone qualified on your bench is booked, blocked or missing a required cert for {day}.
        </Callout>
      )}
    </Section>
  )
}

function Distribution({ request, ctx }: { request: StaffingRequest; ctx: DetailContext }) {
  const suppliers = request.supplierIds
    .map((id) => ctx.lookups.suppliers.get(id))
    .filter((s): s is Supplier => !!s)
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
  return (
    <Section title="Live with suppliers">
      <List label="Suppliers on this request">
        {suppliers.map((s) => (
          <ListRow key={s.id} className="justify-between">
            <SupplierCell supplier={s} subtitle={`Tier ${s.tier}`} />
            {s.coiExpires < ctx.today ? <StatusBadge tone="danger">Paused · COI expired</StatusBadge> : <StatusBadge tone="success">Live</StatusBadge>}
          </ListRow>
        ))}
      </List>
      <Callout icon={RadioTowerIcon}>
        Open shifts stay live with every supplier on the request until they&apos;re filled. You&apos;re notified the moment each Pro confirms.
      </Callout>
    </Section>
  )
}

// Pro compliance -------------------------------------------------------------------------

const CERT_TONE: Record<CertState, Tone> = { valid: "success", expiring: "warning", expired: "danger", missing: "muted" }
const CERT_LABEL: Record<CertState, string> = { valid: "Valid", expiring: "Expiring", expired: "Expired", missing: "Missing" }

interface Concern {
  key: string
  icon: LucideIcon
  title: string
  body: string
  destructive?: boolean
}

export function ComplianceDetail({ item, ctx }: KindDetailProps) {
  const data = useData((d) => d)
  const now = useNow()
  const worker = ctx.lookups.workers.get(targetId(item))
  if (!worker) return <MissingDetail item={item} ctx={ctx} />

  const { contractualHoursCap: cap, contractualHoursWarnPct, blockOverCapWorkers } = data.policies
  const supplier = ctx.lookups.suppliers.get(worker.supplierId)
  const first = worker.preferredName ?? worker.firstName
  const share = cap > 0 ? worker.compassHours / cap : 0
  const certs = worker.certs.map((cert) => ({ cert, state: certStatus(worker, cert.type, ctx.today) }))
  const concerns = complianceConcerns({ worker, certs, cap, warnPct: contractualHoursWarnPct, blockOverCap: blockOverCapWorkers, first, supplier })
  const horizon = toISODate(addDays(parseLocal(ctx.today), 7))
  const booked = data.shifts
    .filter((s) => s.workerId === worker.id && s.status === "Confirmed" && s.date >= ctx.today && s.date <= horizon)
    .map((shift) => ({ shift, request: ctx.lookups.requests.get(shift.requestId) }))
    .filter((b): b is { shift: Shift; request: StaffingRequest } => !!b.request && venueInScope(b.request.venueId, ctx.persona))
    .sort((a, b) => a.shift.date.localeCompare(b.shift.date))

  return (
    <DetailShell
      item={item}
      ctx={ctx}
      footer={
        <>
          <PrimaryButton ctx={ctx} />
          <CopilotButton ctx={ctx} prompt={`Is ${workerName(worker)} OK to keep working shifts this week?`} />
        </>
      }
    >
      <WorkerCell
        worker={worker}
        size="lg"
        href={`/workforce/${worker.id}`}
        subtitle={[supplier?.shortName, metroById(worker.metro)?.label, `★ ${worker.rating.toFixed(1)}`, `${pct(worker.reliability)} show rate`]
          .filter(Boolean)
          .join(" · ")}
      />

      {concerns.map((c) => (
        <Callout key={c.key} icon={c.icon} title={c.title} destructive={c.destructive}>
          {c.body}
        </Callout>
      ))}

      <Section title="Contractual hours">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="tabular">
              <span className="font-medium">{num(worker.compassHours)}</span> of {num(cap)} hours
            </span>
            <span className="text-muted-foreground tabular">{num(Math.max(0, cap - worker.compassHours))}h left</span>
          </div>
          <Progress value={Math.min(100, share * 100)} aria-label={`${pct(share)} of the ${cap}-hour cap`} />
        </div>
      </Section>

      <Section title="Certifications">
        {certs.length > 0 ? (
          <List label="Certifications">
            {certs.map(({ cert, state }) => (
              <ListRow key={cert.type} className="justify-between">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{cert.type}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Expires {formatDate(cert.expires, "MMM d, yyyy")}
                    {cert.verified ? " · verified" : " · not verified"}
                  </span>
                </div>
                <StatusBadge tone={CERT_TONE[state]}>{CERT_LABEL[state]}</StatusBadge>
              </ListRow>
            ))}
          </List>
        ) : (
          <p className="text-sm text-muted-foreground">No certifications on file.</p>
        )}
      </Section>

      <Section title="Booked at your venues this week">
        {booked.length > 0 ? (
          <List label="Upcoming shifts">
            {booked.map(({ shift, request }) => (
              <ListRow key={shift.id} className="justify-between">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {relativeDay(shift.date, now)} · {ctx.lookups.positions.get(request.positionId)?.title ?? "Shift"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {ctx.lookups.venues.get(request.venueId)?.shortName ?? "–"} · {formatTimeRange(request.startTime, request.endTime)}
                  </span>
                </div>
                <Link
                  href={`/requests/${request.id}`}
                  className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {request.id}
                </Link>
              </ListRow>
            ))}
          </List>
        ) : (
          <p className="text-sm text-muted-foreground">No confirmed shifts in the next 7 days.</p>
        )}
      </Section>
    </DetailShell>
  )
}

function complianceConcerns({
  worker,
  certs,
  cap,
  warnPct,
  blockOverCap,
  first,
  supplier,
}: {
  worker: Worker
  certs: { cert: Worker["certs"][number]; state: CertState }[]
  cap: number
  warnPct: number
  blockOverCap: boolean
  first: string
  supplier?: Supplier
}): Concern[] {
  const out: Concern[] = []
  const agency = supplier?.shortName ?? "Their supplier"
  for (const { cert, state } of certs) {
    if (state === "expired") {
      out.push({
        key: cert.type,
        icon: BadgeAlertIcon,
        title: `${cert.type} expired ${formatDate(cert.expires, "MMM d")}`,
        body: `${first} can't be booked on shifts that require it until ${agency} uploads a renewal.`,
        destructive: true,
      })
    } else if (state === "expiring") {
      out.push({
        key: cert.type,
        icon: CalendarClockIcon,
        title: `${cert.type} expires ${formatDate(cert.expires, "MMM d")}`,
        body: `${agency} has been asked to renew it. If it lapses, Mise stops booking ${first} on shifts that require it.`,
      })
    }
  }
  if (worker.compassHours >= cap) {
    out.push({
      key: "hours",
      icon: GaugeIcon,
      title: `At the ${cap}-hour contractual cap`,
      body: blockOverCap ? `Mise won't offer ${first} new shifts.` : `Every new booking for ${first} is flagged for review.`,
      destructive: true,
    })
  } else if (worker.compassHours >= cap * (warnPct / 100)) {
    out.push({
      key: "hours",
      icon: GaugeIcon,
      title: `${num(worker.compassHours)} of ${num(cap)} contractual hours`,
      body: `${first} is ${pct(worker.compassHours / cap)} of the way to the cap. ${
        blockOverCap ? `At ${cap}, Mise stops offering them shifts automatically.` : `At ${cap}, every new booking is flagged for review.`
      }`,
    })
  }
  const pending = worker.onboarding.filter((o) => o.status === "Pending")
  if (pending.length > 0) {
    out.push({
      key: "onboarding",
      icon: ClipboardListIcon,
      title: "Onboarding incomplete",
      body: `Still waiting on ${pending.map((o) => o.label.toLowerCase()).join(", ")}.`,
    })
  }
  return out
}

// Supplier insurance -------------------------------------------------------------------------

export function SupplierCoiDetail({ item, ctx }: KindDetailProps) {
  const supplierId = targetId(item)
  const supplier = useData((d) => d.suppliers.find((s) => s.id === supplierId))
  const workers = useData((d) => d.workers)
  const shifts = useData((d) => d.shifts)
  const now = useNow()
  if (!supplier) return <MissingDetail item={item} ctx={ctx} />

  const expired = supplier.coiExpires < ctx.today
  const days = daysFromToday(supplier.coiExpires, now)
  const bench = new Set(workers.filter((w) => w.supplierId === supplier.id).map((w) => w.id))
  const active = workers.filter((w) => w.supplierId === supplier.id && w.status === "Active").length
  const openRequests = [...ctx.lookups.requests.values()].filter(
    (r) => r.state === "active" && r.supplierIds.includes(supplier.id) && r.dates.some((d) => d >= ctx.today)
  ).length
  const upcoming = shifts.filter((s) => s.workerId && bench.has(s.workerId) && s.status === "Confirmed" && s.date >= ctx.today).length
  const contact = supplier.contactName.split(" ")[0]
  const mailto = `mailto:${supplier.contactEmail}?subject=${encodeURIComponent(`${PROGRAM_NAME} certificate of insurance renewal`)}`

  return (
    <DetailShell
      item={item}
      ctx={ctx}
      footer={
        <>
          <PrimaryButton ctx={ctx} />
          <Button variant="outline" asChild>
            <a href={mailto}>
              <MailIcon data-icon="inline-start" />
              Email {contact}
            </a>
          </Button>
          <OpenButton item={item} ctx={ctx} label="Open suppliers" />
          <CopilotButton ctx={ctx} prompt={`What's our exposure if ${supplier.shortName}'s insurance lapses?`} />
        </>
      }
    >
      {expired ? (
        <Callout icon={FileWarningIcon} title={`Expired ${formatDate(supplier.coiExpires, "MMM d")} · distribution paused`} destructive>
          Mise skips {supplier.shortName} on every open and new request until a renewed certificate is verified.
        </Callout>
      ) : (
        <Callout icon={CalendarClockIcon} title={`Expires ${formatDate(supplier.coiExpires, "MMM d")} · in ${plural(days, "day")}`}>
          A renewal reminder already went to {supplier.contactEmail}. If nothing arrives by then, distribution to their Pros pauses
          automatically.
        </Callout>
      )}

      <Stats
        items={[
          { label: "Active Pros", value: num(active) },
          { label: "Open requests", value: num(openRequests), hint: "they're on" },
          { label: "Upcoming shifts", value: num(upcoming), hint: "confirmed" },
        ]}
      />

      <Section title="Supplier">
        <Facts>
          <KeyValue label="Supplier">
            <SupplierCell supplier={supplier} />
          </KeyValue>
          <KeyValue label="Tier">Tier {supplier.tier}</KeyValue>
          <KeyValue label="Type">
            {supplier.kind} · {supplier.w2 ? "W-2" : "1099"}
          </KeyValue>
          <KeyValue label="HQ">{supplier.hq}</KeyValue>
          <KeyValue label="Contact">
            <a href={mailto} className="underline-offset-4 hover:underline">
              {supplier.contactName}
            </a>
          </KeyValue>
          <KeyValue label="MSA">{supplier.msaSigned ? "Signed" : "Not signed"}</KeyValue>
        </Facts>
      </Section>

      <Callout icon={ShieldCheckIcon} title="Before you mark it renewed">
        Check the coverage limits and that Compass Group USA is named as additional insured on the new certificate.
      </Callout>
    </DetailShell>
  )
}
