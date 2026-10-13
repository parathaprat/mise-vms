"use client"

import Link from "next/link"
import * as React from "react"
import { addDays, startOfDay } from "date-fns"
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  ClockIcon,
  InboxIcon,
  SparklesIcon,
  UsersRoundIcon,
} from "lucide-react"

import { FillMeter } from "@/components/app/fill-meter"
import { VenueMark } from "@/components/app/identity"
import { StatusBadge } from "@/components/app/status-badge"
import { useUi } from "@/components/shell/ui-store"
import { Button } from "@/components/ui/button"
import { NumberTicker } from "@/components/ui/number-ticker"
import {
  useData,
  useInbox,
  useLookups,
  useNow,
  usePersona,
  useRequestViews,
} from "@/hooks/use-demo"
import {
  formatDate,
  formatTimeRange,
  relativeDay,
  shiftWindow,
  toISODate,
} from "@/lib/dates"
import { lineTotals } from "@/lib/invoice"
import { compactMoney, money, num, pct } from "@/lib/format"
import { invoiceInScope, type InboxKind } from "@/lib/selectors"

import {
  ActivityFeed,
  AttentionList,
  greeting,
  HomeSection,
  SectionCard,
  useScopedActivities,
  ViewAllButton,
  HomeHero,
} from "./shared"

const INBOX_ICONS: Partial<Record<InboxKind, typeof InboxIcon>> = {
  staffing: UsersRoundIcon,
  dispute: AlertTriangleIcon,
}

export function SupplierHome() {
  const persona = usePersona()
  const now = useNow()
  const views = useRequestViews()
  const lookups = useLookups()
  const inbox = useInbox()
  const shifts = useData((d) => d.shifts)
  const timeEntries = useData((d) => d.timeEntries)
  const invoices = useData((d) => d.invoices)
  const payments = useData((d) => d.payments)
  const msaFeePct = useData((d) => d.policies.msaFeePct)
  const askCopilot = useUi((s) => s.askCopilot)
  const today = toISODate(now)
  const supplierId = persona.supplierId ?? ""

  const orders = React.useMemo(() => {
    const horizon = toISODate(addDays(now, 7))
    return views
      .filter(
        (v) =>
          v.req.state === "active" &&
          v.nextDate &&
          v.nextDate <= horizon &&
          v.fill.open > 0
      )
      .map((v) => {
        const nextShifts = (lookups.shiftsByRequest.get(v.req.id) ?? []).filter(
          (s) => s.date === v.nextDate
        )
        const open = nextShifts.filter(
          (s) => !s.workerId && s.status === "Open"
        ).length
        const { start } = shiftWindow(
          v.nextDate!,
          v.req.startTime,
          v.req.endTime
        )
        return { view: v, open, start }
      })
      .filter((o) => o.open > 0 && o.start > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
  }, [views, lookups, now])

  const metrics = React.useMemo(() => {
    let onSite = 0
    let mine30 = 0
    let all30 = 0
    let noShows = 0
    let past = 0
    const from = toISODate(addDays(now, -30))
    for (const s of shifts) {
      if (!s.workerId) continue
      const req = lookups.requests.get(s.requestId)
      if (!req || !req.supplierIds.includes(supplierId)) continue
      const isMine = lookups.workers.get(s.workerId)?.supplierId === supplierId
      if (isMine && s.status === "Checked in") onSite++
      if (s.date >= from && s.date <= today) {
        all30++
        if (isMine) {
          mine30++
          if (s.status === "No-show") noShows++
          if (s.status === "Completed" || s.status === "No-show") past++
        }
      }
    }
    let lateCount = 0
    let entries = 0
    let disputes = 0
    for (const e of timeEntries) {
      if (
        lookups.workers.get(e.workerId)?.supplierId !== supplierId ||
        e.date < from
      )
        continue
      entries++
      if (e.anomalies.includes("late_arrival")) lateCount++
      if (e.status === "Disputed") disputes++
    }
    const myInvoices = invoices.filter((i) => invoiceInScope(i, persona))
    const receivable = myInvoices
      .filter(
        (i) =>
          i.status === "Pending approval" ||
          i.status === "Approved" ||
          i.status === "Disputed"
      )
      .reduce((s, i) => s + lineTotals(i.lines, msaFeePct).netToSupplier, 0)
    const myWorkers = [...lookups.workers.values()].filter(
      (w) => w.supplierId === supplierId && w.status === "Active"
    )
    const avgRating = myWorkers.length
      ? myWorkers.reduce((s, w) => s + w.rating, 0) / myWorkers.length
      : 0
    return {
      onSite,
      share: all30 ? mine30 / all30 : 0,
      noShowRate: past ? noShows / past : 0,
      onTime: entries ? 1 - lateCount / entries : 1,
      disputes,
      receivable,
      avgRating,
      activePros: myWorkers.length,
    }
  }, [
    shifts,
    timeEntries,
    invoices,
    lookups,
    supplierId,
    persona,
    msaFeePct,
    now,
    today,
  ])

  const myPayments = React.useMemo(
    () =>
      payments
        .filter((p) => p.supplierId === supplierId)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5),
    [payments, supplierId]
  )
  const openTotal = orders.reduce((s, o) => s + o.open, 0)
  const activities = useScopedActivities(14)
  const responses = inbox.filter((i) => i.kind === "dispute")

  return (
    <>
      <HomeHero
        eyebrow={formatDate(now, "EEEE, MMMM d")}
        title={`${greeting(now)}, ${persona.firstName}`}
        description={
          openTotal
            ? `${num(openTotal)} open ${openTotal === 1 ? "shift" : "shifts"} across ${new Set(orders.map((o) => o.view.venue.id)).size} venues this week. Confirm a Pro and the work order is created for you.`
            : "Every shift you were sent this week is filled. Nice work."
        }
        actions={
          <>
            <Button asChild>
              <Link href="/requests?tab=open">
                <UsersRoundIcon data-icon="inline-start" />
                Fill shifts
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                askCopilot("Which shifts can we still fill this week?")
              }
            >
              <SparklesIcon data-icon="inline-start" />
              Brief me
            </Button>
          </>
        }
        stats={[
          {
            label: "Open shifts · this week",
            value: <NumberTicker value={openTotal} />,
            hint: `${orders.length} requests still filling`,
            href: "/requests?tab=open",
          },
          {
            label: "Your Pros on site",
            live: metrics.onSite > 0,
            value: <NumberTicker value={metrics.onSite} />,
            hint: `${num(metrics.activePros)} active Pros`,
            href: "/schedule?view=live",
          },
          {
            label: "Your share of fills · 30 days",
            value: (
              <>
                <NumberTicker value={Math.round(metrics.share * 100)} />%
              </>
            ),
            progress: metrics.share,
            hint: `${pct(metrics.noShowRate, 1)} no-show rate`,
            href: "/insights",
          },
          {
            label: "Receivables",
            value: compactMoney(metrics.receivable),
            hint: "Net of the 2% program fee",
            href: "/invoices",
          },
        ]}
        ticker={activities}
      />

      <HomeSection
        eyebrow="Right now"
        title="Fill and respond"
        description="The shifts you can fill and the questions waiting on you."
      >
        <div className="grid items-stretch gap-4 xl:grid-cols-3">
          <SectionCard
            className="h-full min-w-0 xl:col-span-2"
            title="Orders to fill"
            description="Soonest first. Assign Pros from the request page, confirmations create work orders instantly."
            action={
              <ViewAllButton href="/requests?tab=open" label="All open" />
            }
            contentClassName="flex flex-col gap-2"
          >
            {orders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Every distributed shift is covered. Nice work.
              </p>
            ) : (
              orders.slice(0, 6).map(({ view, open, start }) => {
                const hoursOut = Math.max(
                  0,
                  Math.round((start.getTime() - now.getTime()) / 3_600_000)
                )
                return (
                  <Link
                    key={view.req.id}
                    href={`/requests/${view.req.id}`}
                    className="group/order flex flex-col gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <VenueMark venue={view.venue} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {open} × {view.position.title}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {view.venue.shortName} ·{" "}
                          {view.req.eventName ?? "Shift"} ·{" "}
                          {relativeDay(view.nextDate!, startOfDay(now))}{" "}
                          {formatTimeRange(
                            view.req.startTime,
                            view.req.endTime
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 sm:w-72">
                      <FillMeter fill={view.fill} className="flex-1" />
                      <StatusBadge
                        tone={
                          hoursOut <= 24
                            ? "danger"
                            : hoursOut <= 72
                              ? "warning"
                              : "primary"
                        }
                        dot={false}
                      >
                        <ClockIcon />
                        {hoursOut < 24
                          ? `${hoursOut}h`
                          : `${Math.round(hoursOut / 24)}d`}
                      </StatusBadge>
                      <ArrowRightIcon className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                )
              })
            )}
          </SectionCard>

          <div className="flex h-full min-w-0 flex-col gap-4">
            <SectionCard
              title={
                <span className="flex items-center gap-2">
                  Needs your response
                  {responses.length ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/8 px-1.5 text-[11px] font-semibold text-foreground/80 tabular">
                      {responses.length}
                    </span>
                  ) : null}
                </span>
              }
              description="Disputes venues raised on your Pros' hours."
              action={
                <ViewAllButton
                  href="/timesheets?tab=disputed"
                  label="Disputes"
                />
              }
              contentClassName="pt-0"
            >
              <AttentionList
                limit={3}
                items={responses}
                icons={INBOX_ICONS}
                emptyText="No open disputes. Venues confirmed every hour you billed."
              />
            </SectionCard>
            <SectionCard
              title="Payments"
              description="Auto-matched to invoices."
              action={
                <ViewAllButton href="/invoices?tab=payments" label="All" />
              }
              contentClassName="flex flex-col gap-1"
            >
              {myPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(p.date, "MMM d")} · {p.invoiceIds.length}{" "}
                      invoices
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium tabular">
                      {money(p.amount)}
                    </span>
                    <StatusBadge
                      tone={
                        p.status === "Settled"
                          ? "success"
                          : p.status === "Processing"
                            ? "info"
                            : "primary"
                      }
                    >
                      {p.status}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            </SectionCard>
          </div>
        </div>
      </HomeSection>

      <HomeSection
        eyebrow="Performance"
        title="Keep quality on track"
        description="How venues experience your Pros and what just changed."
      >
        <div className="grid items-stretch gap-4 xl:grid-cols-3">
          <SectionCard
            className="h-full"
            title="Your scorecard"
            description="How Compass venues experience your Pros, last 30 days."
            contentClassName="grid flex-1 grid-cols-2 gap-3"
          >
            {[
              {
                label: "Avg Pro rating",
                value: metrics.avgRating
                  ? `★ ${metrics.avgRating.toFixed(2)}`
                  : "–",
              },
              { label: "On-time arrival", value: pct(metrics.onTime) },
              { label: "No-show rate", value: pct(metrics.noShowRate, 1) },
              { label: "Open disputes", value: num(metrics.disputes) },
            ].map((m) => (
              <div
                key={m.label}
                className="flex flex-col gap-1 rounded-xl border bg-muted/30 p-3"
              >
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <span className="font-heading text-xl font-semibold tabular">
                  {m.value}
                </span>
              </div>
            ))}
          </SectionCard>
          <SectionCard
            className="h-full xl:col-span-2"
            title="Recent activity"
            description="Confirmations, check-ins and decisions on your orders."
          >
            <ActivityFeed items={activities} limit={5} />
          </SectionCard>
        </div>
      </HomeSection>
    </>
  )
}
