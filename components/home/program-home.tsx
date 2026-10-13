"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { addDays, startOfMonth } from "date-fns"
import {
  AlertTriangleIcon,
  ClipboardCheckIcon,
  InboxIcon,
  ReceiptTextIcon,
  ShieldAlertIcon,
  SparklesIcon,
  UsersRoundIcon,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { FillMeter } from "@/components/app/fill-meter"
import { SupplierCell, VenueCell } from "@/components/app/identity"
import { LiveDot } from "@/components/app/misc"
import { StatusBadge } from "@/components/app/status-badge"
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
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  useData,
  useInbox,
  useLookups,
  useNow,
  usePersona,
} from "@/hooks/use-demo"
import {
  formatDate,
  parseLocal,
  shiftWindow,
  toISODate,
  weekStartOf,
} from "@/lib/dates"
import { compactMoney, money, num, pct } from "@/lib/format"
import type { InboxKind } from "@/lib/selectors"

import {
  AttentionList,
  greeting,
  HomeHero,
  HomeSection,
  SectionCard,
  useScopedActivities,
  ViewAllButton,
} from "./shared"

const INBOX_ICONS: Partial<Record<InboxKind, typeof InboxIcon>> = {
  "request-approval": ClipboardCheckIcon,
  change: UsersRoundIcon,
  "invoice-dispute": AlertTriangleIcon,
  "supplier-coi": ShieldAlertIcon,
  invoice: ReceiptTextIcon,
}

export function ProgramHome() {
  const persona = usePersona()
  const now = useNow()
  const router = useRouter()
  const lookups = useLookups()
  const inbox = useInbox()
  const data = useData((d) => d)
  const askCopilot = useUi((s) => s.askCopilot)
  const today = toISODate(now)

  const venueRows = React.useMemo(() => {
    const horizon = toISODate(addDays(now, 6))
    const weekStartISO = toISODate(addDays(now, -6))
    const rows = new Map(
      data.venues.map((v) => [
        v.id,
        {
          venue: v,
          onSite: 0,
          total: 0,
          filled: 0,
          open: 0,
          eventsToday: new Set<string>(),
          spendWeek: 0,
        },
      ])
    )
    for (const s of data.shifts) {
      const req = lookups.requests.get(s.requestId)
      if (!req || req.state !== "active") continue
      const row = rows.get(req.venueId)
      if (!row) continue
      if (s.status === "Checked in") row.onSite++
      if (s.date === today) row.eventsToday.add(req.eventName ?? "service")
      if (
        s.date >= today &&
        s.date <= horizon &&
        s.status !== "Cancelled" &&
        !s.backfillFor
      ) {
        const { end } = shiftWindow(s.date, req.startTime, req.endTime)
        if (end > now) {
          row.total++
          if (s.workerId && s.status !== "No-show") row.filled++
          else if (!s.workerId) row.open++
        }
      }
    }
    for (const e of data.timeEntries) {
      if (e.date < weekStartISO) continue
      const req = lookups.requests.get(e.requestId)
      const row = req ? rows.get(req.venueId) : undefined
      if (row) row.spendWeek += e.amount
    }
    return [...rows.values()].sort(
      (a, b) => b.open - a.open || b.total - a.total
    )
  }, [data.venues, data.shifts, data.timeEntries, lookups, now, today])

  const totals = React.useMemo(() => {
    const onSite = venueRows.reduce((s, r) => s + r.onSite, 0)
    const total = venueRows.reduce((s, r) => s + r.total, 0)
    const filled = venueRows.reduce((s, r) => s + r.filled, 0)
    const monthStart = toISODate(startOfMonth(now))
    const spendMtd = data.timeEntries
      .filter((e) => e.date >= monthStart)
      .reduce((s, e) => s + e.amount, 0)
    const approvals =
      data.requests.filter((r) => r.state === "pending").length +
      data.changeRequests.filter((c) => c.status === "Pending").length
    const liveVenues = venueRows.filter((r) => r.onSite > 0).length
    return {
      onSite,
      fillRate: total ? filled / total : 1,
      open: total - filled,
      spendMtd,
      approvals,
      liveVenues,
    }
  }, [venueRows, data.timeEntries, data.requests, data.changeRequests, now])

  const suppliers = React.useMemo(() => {
    const from = toISODate(addDays(now, -30))
    const stats = new Map(
      data.suppliers.map((s) => [
        s.id,
        { supplier: s, filled: 0, noShows: 0, past: 0 },
      ])
    )
    let allFilled = 0
    for (const s of data.shifts) {
      if (!s.workerId || s.date < from || s.date > today) continue
      const w = lookups.workers.get(s.workerId)
      const row = w ? stats.get(w.supplierId) : undefined
      if (!row) continue
      row.filled++
      allFilled++
      if (s.status === "No-show") row.noShows++
      if (s.status === "Completed" || s.status === "No-show") row.past++
    }
    return [...stats.values()].map((r) => {
      const days = Math.round(
        (parseLocal(r.supplier.coiExpires).getTime() - now.getTime()) /
          86_400_000
      )
      return {
        ...r,
        share: allFilled ? r.filled / allFilled : 0,
        noShowRate: r.past ? r.noShows / r.past : 0,
        coiDays: days,
      }
    })
  }, [data.suppliers, data.shifts, lookups, now, today])

  const brandChart = React.useMemo(() => {
    const thisWeek = weekStartOf(now)
    const weeks = Array.from({ length: 6 }, (_, i) =>
      toISODate(addDays(thisWeek, (i - 5) * 7))
    )
    const rows = weeks.map((w) => ({
      week: w,
      label: formatDate(w, "MMM d"),
      levy: 0,
      chartwells: 0,
    }))
    for (const e of data.timeEntries) {
      const req = lookups.requests.get(e.requestId)
      const venue = req ? lookups.venues.get(req.venueId) : undefined
      if (!venue) continue
      const row = rows.find(
        (r) => r.week === toISODate(weekStartOf(parseLocal(e.date)))
      )
      if (!row) continue
      if (venue.brand === "Levy") row.levy += e.amount
      else row.chartwells += e.amount
    }
    const config: ChartConfig = {
      levy: { label: "Levy", color: "var(--chart-1)" },
      chartwells: { label: "Chartwells", color: "var(--chart-2)" },
    }
    return {
      rows: rows.map((r) => ({
        ...r,
        levy: Math.round(r.levy),
        chartwells: Math.round(r.chartwells),
      })),
      config,
    }
  }, [data.timeEntries, lookups, now])

  const attention = inbox.slice(0, 6)
  const activities = useScopedActivities(14)

  return (
    <>
      <HomeHero
        eyebrow={formatDate(now, "EEEE, MMMM d")}
        title={`${greeting(now)}, ${persona.firstName}`}
        description={`FlexForce across ${data.venues.length} venues and ${data.suppliers.length} suppliers. ${totals.liveVenues} venues live right now · ${totals.approvals} ${totals.approvals === 1 ? "approval" : "approvals"} waiting on the program office.`}
        actions={
          <>
            <Button asChild>
              <Link href="/inbox">
                <InboxIcon data-icon="inline-start" />
                Review approvals
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                askCopilot("Show requests waiting for my approval")
              }
            >
              <SparklesIcon data-icon="inline-start" />
              Brief me
            </Button>
          </>
        }
        stats={[
          {
            label: "On site now",
            live: totals.onSite > 0,
            value: <NumberTicker value={totals.onSite} />,
            hint: `${totals.liveVenues} of ${data.venues.length} venues live`,
            href: "/schedule?view=live",
          },
          {
            label: "Shifts filled · next 7 days",
            value: (
              <>
                <NumberTicker value={Math.round(totals.fillRate * 100)} />%
              </>
            ),
            progress: totals.fillRate,
            hint: `${num(totals.open)} shifts still filling`,
            href: "/requests?tab=open",
          },
          {
            label: "Labor · month to date",
            value: compactMoney(totals.spendMtd),
            hint: "At bill rate, all venues",
            href: "/insights",
          },
          {
            label: "Waiting on you",
            value: <NumberTicker value={totals.approvals} />,
            hint: "Requests, headcount and rates",
            href: "/inbox",
          },
        ]}
        ticker={activities}
      />

      <HomeSection
        eyebrow="Right now"
        title="Run the program"
      >
        <div className="grid items-stretch gap-4 xl:grid-cols-3">
          <SectionCard
            className="h-full min-w-0 xl:col-span-2"
            title="Venues at a glance"
            action={<ViewAllButton href="/locations" label="Locations" />}
            contentClassName="overflow-x-auto"
          >
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Venue</TableHead>
                  <TableHead className="text-right">On site</TableHead>
                  <TableHead className="w-44">Next 7 days</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Last 7 days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {venueRows.map((r) => (
                  <TableRow
                    key={r.venue.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/requests?venue=${r.venue.id}`)}
                  >
                    <TableCell>
                      <VenueCell
                        venue={r.venue}
                        subtitle={`${r.venue.brand} · ${r.venue.city}, ${r.venue.state}`}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {r.onSite > 0 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <LiveDot className="size-1.5" />
                          {r.onSite}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.total ? (
                        <FillMeter
                          fill={{
                            total: r.total,
                            filled: r.filled,
                            checkedIn: 0,
                            completed: 0,
                          }}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No shifts
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {r.open > 0 ? (
                        <span className="text-warning-foreground dark:text-warning">
                          {r.open}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {compactMoney(r.spendWeek)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>

          <div className="flex h-full min-w-0 flex-col gap-4">
            <SectionCard
              title={
                <span className="flex items-center gap-2">
                  Waiting on you
                  {attention.length ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground/8 px-1.5 text-[11px] font-semibold text-foreground/80 tabular">
                      {attention.length}
                    </span>
                  ) : null}
                </span>
              }
              action={<ViewAllButton href="/inbox" label="Inbox" />}
              contentClassName="pt-0"
            >
              <AttentionList
                limit={3}
                items={attention}
                icons={INBOX_ICONS}
                emptyText="No approvals waiting. Policies are handling the routine."
              />
            </SectionCard>
            <SectionCard
              title="Suppliers · last 30 days"
              action={<ViewAllButton href="/suppliers" label="Scorecards" />}
              contentClassName="flex flex-col gap-3"
            >
              {suppliers.map((s) => (
                <div key={s.supplier.id} className="flex items-center gap-3">
                  <SupplierCell
                    supplier={s.supplier}
                    className="w-28 shrink-0 sm:w-36"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Progress value={s.share * 100} className="h-1.5" />
                    <span className="text-[11px] text-muted-foreground tabular">
                      {pct(s.share)} of fills · {pct(s.noShowRate, 1)} no-shows
                    </span>
                  </div>
                  {s.coiDays < 0 ? (
                    <StatusBadge tone="danger">COI expired</StatusBadge>
                  ) : s.coiDays <= 30 ? (
                    <StatusBadge tone="warning">COI {s.coiDays}d</StatusBadge>
                  ) : (
                    <StatusBadge tone="success">Compliant</StatusBadge>
                  )}
                </div>
              ))}
            </SectionCard>
          </div>
        </div>
      </HomeSection>

      <HomeSection
        eyebrow="Trends"
        title="Follow labor spend"
      >
        <SectionCard
          title="Labor spend by brand"
          action={<ViewAllButton href="/insights" label="Insights" />}
        >
          <ChartContainer
            config={brandChart.config}
            className="aspect-auto h-[240px] w-full"
          >
            <BarChart
              data={brandChart.rows}
              margin={{ left: 4, right: 4, top: 8 }}
            >
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
                          {brandChart.config[String(name)]?.label}
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
              <Bar dataKey="levy" stackId="b" fill="var(--color-levy)" />
              <Bar
                dataKey="chartwells"
                stackId="b"
                fill="var(--color-chartwells)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </SectionCard>
      </HomeSection>
    </>
  )
}
