"use client"

import Link from "next/link"
import * as React from "react"
import { addDays, differenceInMinutes } from "date-fns"
import {
  AlertTriangleIcon,
  BadgeCheckIcon,
  CoinsIcon,
  InboxIcon,
  ReceiptTextIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TimerIcon,
  UsersRoundIcon,
  ZapIcon,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { LiveDot } from "@/components/app/misc"
import { useUi } from "@/components/shell/ui-store"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
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
  parseLocal,
  shiftWindow,
  toISODate,
  weekStartOf,
} from "@/lib/dates"
import { compactMoney, money, num, pct } from "@/lib/format"
import { payableShiftHours } from "@/lib/rules"
import { entryInScope, venueInScope, type InboxKind } from "@/lib/selectors"

import {
  AttentionList,
  eventGroupsForDate,
  greeting,
  HomeSection,
  SectionCard,
  TodayEventRow,
  UpcomingEventRow,
  useScopedActivities,
  ViewAllButton,
  HomeHero,
} from "./shared"

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-5)",
]

const INBOX_ICONS: Partial<Record<InboxKind, typeof InboxIcon>> = {
  timesheets: TimerIcon,
  tips: CoinsIcon,
  "tips-draft": CoinsIcon,
  invoice: ReceiptTextIcon,
  "invoice-dispute": AlertTriangleIcon,
  staffing: UsersRoundIcon,
  compliance: ShieldCheckIcon,
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function VenueHome() {
  const persona = usePersona()
  const now = useNow()
  const views = useRequestViews()
  const lookups = useLookups()
  const inbox = useInbox()
  const timeEntries = useData((d) => d.timeEntries)
  const shifts = useData((d) => d.shifts)
  const costCenters = useData((d) => d.costCenters)
  const venues = useData((d) => d.venues)
  const askCopilot = useUi((s) => s.askCopilot)
  const today = toISODate(now)

  const todayGroups = React.useMemo(
    () => eventGroupsForDate(views, lookups, today, now),
    [views, lookups, today, now]
  )

  const upcomingGroups = React.useMemo(() => {
    const out = []
    for (let i = 1; i <= 7; i++) {
      out.push(
        ...eventGroupsForDate(views, lookups, toISODate(addDays(now, i)), now)
      )
    }
    return out
  }, [views, lookups, now])

  const metrics = React.useMemo(() => {
    const weekStart = weekStartOf(now)
    const weekStartISO = toISODate(weekStart)
    const weekEndISO = toISODate(addDays(weekStart, 6))
    const horizonISO = toISODate(addDays(now, 6))
    const trailingISO = toISODate(addDays(now, -7))
    let onSite = 0
    let arriving = 0
    let total7 = 0
    let filled7 = 0
    let scheduled = 0
    const autoWorkOrders = new Set<string>()
    for (const s of shifts) {
      const req = lookups.requests.get(s.requestId)
      if (!req || req.state !== "active" || !venueInScope(req.venueId, persona))
        continue
      if (s.status === "Checked in") onSite++
      if (s.date === today && s.status === "Confirmed") {
        const { start } = shiftWindow(s.date, req.startTime, req.endTime)
        if (start > now) arriving++
      }
      if (
        s.date >= today &&
        s.date <= horizonISO &&
        s.status !== "Cancelled" &&
        !s.backfillFor
      ) {
        const { end } = shiftWindow(s.date, req.startTime, req.endTime)
        if (end > now) {
          total7++
          if (s.workerId && s.status !== "No-show") filled7++
        }
      }
      if (
        s.date >= weekStartISO &&
        s.date <= weekEndISO &&
        s.workerId &&
        (s.status === "Confirmed" || s.status === "Checked in")
      ) {
        scheduled += payableShiftHours(req) * req.billRate
      }
      if (
        s.workerId &&
        s.assignedAt &&
        s.assignedAt.slice(0, 10) >= trailingISO
      )
        autoWorkOrders.add(`${s.requestId}|${s.workerId}`)
    }
    let actual = 0
    let approvedThisWeek = 0
    let autoApproved = 0
    const approvalHours: number[] = []
    for (const e of timeEntries) {
      if (!entryInScope(e, lookups, persona)) continue
      if (e.date >= weekStartISO && e.date <= weekEndISO) actual += e.amount
      if (e.approvedAt && e.approvedAt.slice(0, 10) >= trailingISO) {
        approvedThisWeek++
        if (e.status === "Auto-approved") autoApproved++
        if (e.clockOut)
          approvalHours.push(
            Math.max(
              0,
              differenceInMinutes(
                parseLocal(e.approvedAt),
                parseLocal(e.clockOut)
              ) / 60
            )
          )
      }
    }
    const budget = costCenters
      .filter((c) => venueInScope(c.venueId, persona) && c.active)
      .reduce((s, c) => s + c.weeklyBudget, 0)
    return {
      onSite,
      arriving,
      fillRate: total7 ? filled7 / total7 : 1,
      open7: total7 - filled7,
      actual,
      committed: actual + scheduled,
      budget,
      autoWorkOrders: autoWorkOrders.size,
      approvedThisWeek,
      autoApproved,
      medianApproval: median(approvalHours),
    }
  }, [shifts, timeEntries, lookups, persona, costCenters, now, today])

  const myVenues = React.useMemo(
    () => venues.filter((v) => venueInScope(v.id, persona)),
    [venues, persona]
  )

  const chart = React.useMemo(() => {
    const thisWeek = weekStartOf(now)
    const weeks = Array.from({ length: 6 }, (_, i) =>
      toISODate(addDays(thisWeek, (i - 5) * 7))
    )
    const rows = weeks.map(
      (w) =>
        ({ week: w, label: formatDate(w, "MMM d") }) as Record<
          string,
          string | number
        >
    )
    for (const e of timeEntries) {
      const req = lookups.requests.get(e.requestId)
      if (!req || !venueInScope(req.venueId, persona)) continue
      const wk = toISODate(weekStartOf(parseLocal(e.date)))
      const row = rows.find((r) => r.week === wk)
      if (!row) continue
      row[req.venueId] = Math.round(
        ((row[req.venueId] as number) ?? 0) + e.amount
      )
    }
    const config: ChartConfig = {}
    myVenues.forEach((v, i) => {
      config[v.id] = {
        label: v.shortName,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }
    })
    return { rows, config }
  }, [timeEntries, lookups, persona, myVenues, now])

  const attention = inbox.filter((i) => i.priority !== "low").slice(0, 6)
  const pendingTimesheets = inbox
    .filter((i) => i.kind === "timesheets")
    .reduce((s, i) => s + (i.count ?? 0), 0)
  const liveCount = todayGroups.filter(
    (g) => now >= g.start && now < g.end
  ).length
  const activities = useScopedActivities(14)
  const budgetPct = metrics.budget ? metrics.committed / metrics.budget : 0

  return (
    <>
      <HomeHero
        eyebrow={formatDate(now, "EEEE, MMMM d")}
        title={`${greeting(now)}, ${persona.firstName}`}
        description={
          todayGroups.length
            ? `${todayGroups.length} ${todayGroups.length === 1 ? "event" : "events"} across ${myVenues.length} ${myVenues.length === 1 ? "venue" : "venues"} today${liveCount ? `, ${liveCount} live right now` : ""}. ${attention.length ? `${attention.length} ${attention.length === 1 ? "thing needs" : "things need"} your call.` : "Nothing needs your call."}`
            : "No events today. Here's what's coming up across your venues."
        }
        actions={
          <>
            <Button
              onClick={() => askCopilot("What needs my attention today?")}
            >
              <SparklesIcon data-icon="inline-start" />
              Brief me
            </Button>
            {pendingTimesheets > 0 ? (
              <Button variant="outline" asChild>
                <Link href="/timesheets">
                  <TimerIcon data-icon="inline-start" />
                  Review {pendingTimesheets} timesheets
                </Link>
              </Button>
            ) : null}
          </>
        }
        stats={[
          {
            label: "Pros on site now",
            live: metrics.onSite > 0,
            value: <NumberTicker value={metrics.onSite} />,
            hint: metrics.arriving
              ? `${num(metrics.arriving)} more arriving today`
              : "Checked in on site",
            href: "/schedule?view=live",
          },
          {
            label: "Shifts filled · next 7 days",
            value: (
              <>
                <NumberTicker value={Math.round(metrics.fillRate * 100)} />%
              </>
            ),
            progress: metrics.fillRate,
            hint: metrics.open7
              ? `${num(metrics.open7)} open shifts filling`
              : "Every shift confirmed",
            href: "/requests?tab=open",
          },
          {
            label: "Needs your call",
            value: <NumberTicker value={attention.length} />,
            hint: pendingTimesheets
              ? `${num(pendingTimesheets)} timesheets waiting`
              : "Inbox is clear",
            href: "/inbox",
          },
          {
            label: "Labor this week",
            value: compactMoney(metrics.committed),
            progress: budgetPct,
            hint: `${pct(budgetPct)} of ${compactMoney(metrics.budget)} budget`,
            href: "/insights",
          },
        ]}
        ticker={activities}
      />

      <HomeSection
        eyebrow="Right now"
        title="Run today"
      >
        <div className="grid items-stretch gap-4 xl:grid-cols-3">
          <SectionCard
            className="h-full xl:col-span-2"
            title={
              <span className="flex items-center gap-2">
                Today
                {liveCount ? (
                  <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    <LiveDot className="size-1.5" calm /> live
                  </span>
                ) : null}
              </span>
            }
            action={
              <ViewAllButton href="/schedule?view=live" label="Live board" />
            }
            contentClassName="flex flex-1 flex-col gap-2"
          >
            {todayGroups.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No events scheduled today.
              </p>
            ) : (
              todayGroups.map((g) => (
                <TodayEventRow key={g.key} group={g} now={now} />
              ))
            )}
            {todayGroups.length ? (
              <dl className="mt-auto grid grid-cols-5 divide-x rounded-xl border bg-muted/30">
                {[
                  [
                    "Confirmed",
                    todayGroups.reduce((s, g) => s + g.stats.filled, 0),
                  ],
                  [
                    "On site",
                    todayGroups.reduce((s, g) => s + g.stats.checkedIn, 0),
                  ],
                  [
                    "Late",
                    todayGroups.reduce(
                      (s, g) => s + (now < g.end ? g.stats.late : 0),
                      0
                    ),
                  ],
                  [
                    "No-shows",
                    todayGroups.reduce((s, g) => s + g.stats.noShows, 0),
                  ],
                  [
                    "Open",
                    todayGroups.reduce(
                      (s, g) => s + (now < g.end ? g.stats.open : 0),
                      0
                    ),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex flex-col gap-0.5 px-3 py-2.5"
                  >
                    <dt className="text-[11px] text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="text-sm font-semibold tabular">
                      {num(Number(value))}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </SectionCard>

          <SectionCard
            className="h-full"
            title="Needs your call"
            action={<ViewAllButton href="/inbox" label="Inbox" />}
            contentClassName="flex flex-1 flex-col"
          >
            <AttentionList
              items={attention}
              icons={INBOX_ICONS}
              limit={5}
              emptyText="You're all caught up. Mise will flag the next decision the moment it lands."
            />
          </SectionCard>
        </div>
      </HomeSection>

      <HomeSection
        eyebrow="Ahead"
        title="Stay ahead of the week"
      >
        <div className="grid items-stretch gap-4 xl:grid-cols-3">
          <SectionCard
            className="h-full xl:col-span-2"
            title="Coming up"
            action={<ViewAllButton href="/schedule" label="Schedule" />}
            contentClassName="flex flex-1 flex-col"
          >
            {upcomingGroups.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nothing scheduled in the next week.
              </p>
            ) : (
              upcomingGroups
                .slice(0, 7)
                .map((g) => <UpcomingEventRow key={g.key} group={g} />)
            )}
          </SectionCard>

          <SectionCard
            className="h-full"
            title="Week overview"
            contentClassName="flex flex-1 flex-col gap-1"
          >
            {[
              {
                icon: ZapIcon,
                label: "Work orders created",
                value: num(metrics.autoWorkOrders),
                hint: "Created when a Pro confirms",
              },
              {
                icon: BadgeCheckIcon,
                label: "Timesheets approved",
                value: num(metrics.approvedThisWeek),
                hint: `${num(metrics.autoApproved)} approved by policy`,
              },
              {
                icon: TimerIcon,
                label: "Median time to approve",
                value: metrics.medianApproval
                  ? `${metrics.medianApproval.toFixed(1)}h`
                  : "–",
                hint: "From clock-out to approval",
              },
              {
                icon: UsersRoundIcon,
                label: "Open shifts, next 7 days",
                value: num(metrics.open7),
                hint: "Still filling with suppliers",
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center gap-3 rounded-lg px-1 py-2"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/70">
                  <row.icon className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{row.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {row.hint}
                  </span>
                </div>
                <span className="font-heading text-lg font-semibold tabular">
                  {row.value}
                </span>
              </div>
            ))}
          </SectionCard>
        </div>
      </HomeSection>

      <HomeSection
        eyebrow="Trends"
        title="Know where labor is going"
      >
        <SectionCard
          title="Labor spend by week"
          action={<ViewAllButton href="/insights" label="Insights" />}
        >
          <ChartContainer
            config={chart.config}
            className="aspect-auto h-[240px] w-full"
          >
            <BarChart data={chart.rows} margin={{ left: 4, right: 4, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) => compactMoney(v)}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {chart.config[String(name)]?.label}
                        </span>
                        <span className="font-medium tabular">
                          {money(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {myVenues.map((v, i) => (
                <Bar
                  key={v.id}
                  dataKey={v.id}
                  stackId="spend"
                  fill={`var(--color-${v.id})`}
                  radius={i === myVenues.length - 1 ? [4, 4, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </SectionCard>
      </HomeSection>
    </>
  )
}
