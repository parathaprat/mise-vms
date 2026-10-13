"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRightIcon,
  HandshakeIcon,
  LayersIcon,
  ShieldAlertIcon,
  StarIcon,
  TimerIcon,
  UserRoundXIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

import { hueStyle, SupplierMark } from "@/components/app/identity"
import { PageHeader } from "@/components/app/page-header"
import { StatCard } from "@/components/app/stat-card"
import { BlurFade } from "@/components/ui/blur-fade"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useData, usePersona, usePolicies } from "@/hooks/use-demo"
import { num, pct, plural } from "@/lib/format"
import { PROGRAM_NAME } from "@/lib/reference"
import type { ISODate, Supplier } from "@/lib/types"
import { cn } from "@/lib/utils"

import { coiStatus, receivesRequests, SCORE_WINDOW_DAYS, supplierScorecards, type SupplierScore } from "../program-data"
import { IconTile, RestrictedState, SectionHeading, useDialogState, useToday } from "../shared"
import { SupplierCard } from "./supplier-card"
import { formatWindow } from "./supplier-format"
import { SupplierSheet } from "./supplier-sheet"

type SortKey = "tier" | "score" | "spend"

const DESCRIPTION = `Scorecards, compliance and distribution for every ${PROGRAM_NAME} supplier, measured on real shift outcomes, not self-reported numbers.`

const NO_SHOW_TARGET = 0.025

export function SuppliersPage() {
  const persona = usePersona()
  if (persona.id === "venue") {
    return (
      <>
        <PageHeader title="Suppliers" description={DESCRIPTION} />
        <RestrictedState
          title="Supplier scorecards are managed by the program office"
          description={`The ${PROGRAM_NAME} program office manages supplier performance, compliance and distribution. Your requests are routed to qualified suppliers automatically.`}
          href="/requests"
          cta="View requests"
        />
      </>
    )
  }
  if (persona.id === "supplier") {
    return (
      <>
        <PageHeader title="Suppliers" description={DESCRIPTION} />
        <RestrictedState
          title={`This area is for the ${PROGRAM_NAME} program office`}
          description="Your fill rate, no-show rate and on-time arrival are on Insights, measured exactly the way the program office sees them."
          href="/insights"
          cta="Open Insights"
        />
      </>
    )
  }
  return <SuppliersView />
}

function sortSuppliers(suppliers: Supplier[], scores: Map<string, SupplierScore>, key: SortKey): Supplier[] {
  const score = (s: Supplier) => scores.get(s.id)
  return [...suppliers].sort((a, b) => {
    const sa = score(a)
    const sb = score(b)
    if (key === "spend") return (sb?.spend ?? 0) - (sa?.spend ?? 0)
    if (key === "score") return (sb?.score ?? 0) - (sa?.score ?? 0) || a.tier - b.tier
    return a.tier - b.tier || (sb?.score ?? 0) - (sa?.score ?? 0)
  })
}

function exclusionLabel(supplier: Supplier): string {
  if (!supplier.active) return `${supplier.shortName} paused`
  return `${supplier.shortName} excluded · COI expired`
}

function complianceAlerts(suppliers: Supplier[], today: ISODate): string[] {
  const out: { label: string; urgency: number }[] = []
  for (const s of suppliers) {
    const coi = coiStatus(s, today)
    if (coi.state === "expired") out.push({ label: `${s.shortName} COI expired`, urgency: coi.days })
    else if (coi.state === "expiring") out.push({ label: `${s.shortName} COI in ${plural(coi.days, "day")}`, urgency: coi.days })
    if (!s.msaSigned) out.push({ label: `${s.shortName} MSA missing`, urgency: -1000 })
  }
  return out.sort((a, b) => a.urgency - b.urgency).map((a) => a.label)
}

function SuppliersView() {
  const suppliers = useData((d) => d.suppliers)
  const workers = useData((d) => d.workers)
  const shifts = useData((d) => d.shifts)
  const timeEntries = useData((d) => d.timeEntries)
  const requests = useData((d) => d.requests)
  const costCenters = useData((d) => d.costCenters)
  const policies = usePolicies()
  const today = useToday()

  const [sort, setSort] = React.useState<SortKey>("tier")
  const sheet = useDialogState<string>()

  const scores = React.useMemo(
    () => supplierScorecards({ suppliers, workers, shifts, timeEntries, requests }, today),
    [suppliers, workers, shifts, timeEntries, requests, today]
  )
  const ordered = React.useMemo(() => sortSuppliers(suppliers, scores, sort), [suppliers, scores, sort])

  const kpis = React.useMemo(() => {
    const receiving = suppliers.filter((s) => receivesRequests(s, today))
    const excluded = suppliers.filter((s) => !receivesRequests(s, today))
    let filled = 0
    let tier1Filled = 0
    let noShows = 0
    let assigned = 0
    for (const s of suppliers) {
      const row = scores.get(s.id)
      if (!row) continue
      filled += row.filled
      if (s.tier === 1) tier1Filled += row.filled
      noShows += row.noShows
      assigned += row.assignedPast
    }
    return {
      receiving: receiving.length,
      excluded,
      filled,
      tier1Filled,
      tier1Share: filled ? tier1Filled / filled : 0,
      noShows,
      assigned,
      noShowRate: assigned ? noShows / assigned : 0,
      alerts: complianceAlerts(suppliers, today),
    }
  }, [suppliers, scores, today])

  const tier1 = suppliers.filter((s) => s.tier === 1)
  const cascade = sortSuppliers(
    suppliers.filter((s) => s.tier !== 1),
    scores,
    "tier"
  )
  const activeCostCenters = costCenters.filter((c) => c.active)
  const favoritesFirst = activeCostCenters.filter((c) => c.favoritesFirst).length
  const windowLabel = formatWindow(policies.tier1ExclusiveMinutes)
  const shareRows = suppliers
    .map((s) => ({ supplier: s, filled: scores.get(s.id)?.filled ?? 0 }))
    .sort((a, b) => b.filled - a.filled)

  const openSupplier = sheet.value ? suppliers.find((s) => s.id === sheet.value) : undefined

  return (
    <>
      <PageHeader
        title="Suppliers"
        description={DESCRIPTION}
        actions={
          <Button variant="outline" asChild>
            <Link href="/policies#distribution">
              <LayersIcon data-icon="inline-start" />
              Distribution rules
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active suppliers"
          icon={HandshakeIcon}
          value={
            <>
              {kpis.receiving}
              <span className="text-base font-medium text-muted-foreground"> / {suppliers.length}</span>
            </>
          }
          hint={kpis.excluded.length ? kpis.excluded.map(exclusionLabel).join(" · ") : "Every supplier is receiving requests"}
        />
        <StatCard
          label="Tier-1 fill share"
          icon={ZapIcon}
          value={pct(kpis.tier1Share, 1)}
          hint={`${tier1.map((s) => s.shortName).join(", ") || "Tier 1"} · ${num(kpis.tier1Filled)} of ${num(kpis.filled)} fills`}
        />
        <StatCard
          label="Avg no-show rate"
          icon={UserRoundXIcon}
          value={pct(kpis.noShowRate, 1)}
          hint={
            <>
              <span className={cn("font-medium", kpis.noShowRate <= NO_SHOW_TARGET ? "text-success" : "text-destructive")}>
                {kpis.noShowRate <= NO_SHOW_TARGET ? "On target" : "Above target"}
              </span>{" "}
              · {plural(kpis.noShows, "no-show")} in {num(kpis.assigned)} shifts · goal ≤ {pct(NO_SHOW_TARGET, 1)}
            </>
          }
        />
        <StatCard
          label="Compliance alerts"
          icon={ShieldAlertIcon}
          value={kpis.alerts.length}
          hint={kpis.alerts.length ? <span className="line-clamp-2">{kpis.alerts.join(" · ")}</span> : "All certificates and agreements current"}
          className={cn(kpis.alerts.length > 0 && "ring-warning/40")}
        />
      </div>

      <section aria-labelledby="scorecards-heading" className="flex flex-col gap-3">
        <SectionHeading
          id="scorecards-heading"
          title="Scorecards"
          description={`Last ${SCORE_WINDOW_DAYS} days. Grades weigh no-shows first, then on-time arrival and timesheet disputes.`}
          action={
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={sort}
              onValueChange={(v) => v && setSort(v as SortKey)}
              aria-label="Sort suppliers"
            >
              <ToggleGroupItem value="tier">Tier</ToggleGroupItem>
              <ToggleGroupItem value="score">Score</ToggleGroupItem>
              <ToggleGroupItem value="spend">Spend</ToggleGroupItem>
            </ToggleGroup>
          }
        />
        <div className="grid gap-4 md:grid-cols-2">
          {ordered.map((supplier, i) => {
            const score = scores.get(supplier.id)
            if (!score) return null
            return (
              <BlurFade key={supplier.id} delay={0.04 * i} className="h-full">
                <SupplierCard supplier={supplier} score={score} today={today} onOpen={() => sheet.show(supplier.id)} />
              </BlurFade>
            )
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>How a new request is distributed</CardTitle>
            <CardDescription>Mise tenders every request automatically, no supplier emails, no manual work orders.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col">
              <CascadeStep
                step={1}
                icon={StarIcon}
                title="Venue favorites first"
                description={`${favoritesFirst} of ${plural(activeCostCenters.length, "active cost center")} offer shifts to their favorite Pros first, whichever supplier employs them.`}
              />
              <CascadeStep
                step={2}
                icon={TimerIcon}
                title={`Tier 1 exclusive window · ${windowLabel}`}
                description={`New requests go to Tier 1 alone for the first ${policies.tier1ExclusiveMinutes} minutes. Rush requests starting within ${policies.rushLeadTimeHours} hours skip the window.`}
              >
                <SupplierChips suppliers={tier1} today={today} onOpen={sheet.show} />
              </CascadeStep>
              <CascadeStep
                step={3}
                icon={LayersIcon}
                title="Tier 2 & 3 cascade"
                description="Seats still open cascade to every active supplier serving the venue's market with a current certificate of insurance."
              >
                <SupplierChips suppliers={cascade} today={today} onOpen={sheet.show} />
              </CascadeStep>
            </ol>
          </CardContent>
          <CardFooter className="justify-between gap-3">
            <span className="text-xs text-muted-foreground">Window and rush thresholds live in Policies.</span>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/policies#distribution">
                Edit rules
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Fill share</CardTitle>
            <CardDescription>
              {num(kpis.filled)} filled shifts · last {SCORE_WINDOW_DAYS} days
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div
              role="img"
              aria-label={shareRows.map((r) => `${r.supplier.shortName} ${pct(kpis.filled ? r.filled / kpis.filled : 0, 1)}`).join(", ")}
              className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
            >
              {shareRows
                .filter((r) => r.filled > 0)
                .map((r) => (
                  <div
                    key={r.supplier.id}
                    className="hue-solid h-full min-w-1 transition-[width] duration-500"
                    style={{ ...hueStyle(r.supplier.hue), width: `${(r.filled / Math.max(1, kpis.filled)) * 100}%` }}
                  />
                ))}
            </div>
            <ul className="flex flex-col gap-1">
              {shareRows.map((r) => (
                <li key={r.supplier.id}>
                  <button
                    type="button"
                    onClick={() => sheet.show(r.supplier.id)}
                    className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span className="hue-solid size-2 shrink-0 rounded-full" style={hueStyle(r.supplier.hue)} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{r.supplier.name}</span>
                    <span className="text-xs text-muted-foreground tabular">{num(r.filled)}</span>
                    <span className="w-12 text-right font-medium tabular">{pct(kpis.filled ? r.filled / kpis.filled : 0, 1)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <SupplierSheet
        supplier={openSupplier}
        score={sheet.value ? scores.get(sheet.value) : undefined}
        open={sheet.open}
        onOpenChange={sheet.onOpenChange}
        today={today}
      />
    </>
  )
}

function CascadeStep({
  step,
  icon,
  title,
  description,
  children,
}: {
  step: number
  icon: LucideIcon
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0 before:absolute before:top-10 before:bottom-1.5 before:left-4 before:w-px before:bg-border last:before:hidden">
      <IconTile icon={icon} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <p className="text-sm font-medium">
          <span className="sr-only">Step {step}: </span>
          {title}
        </p>
        <p className="text-xs text-muted-foreground text-pretty">{description}</p>
        {children ? <div className="pt-1.5">{children}</div> : null}
      </div>
    </li>
  )
}

function SupplierChips({ suppliers, today, onOpen }: { suppliers: Supplier[]; today: ISODate; onOpen: (id: string) => void }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {suppliers.map((s) => {
        const receiving = receivesRequests(s, today)
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onOpen(s.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border bg-background py-1 pr-2 pl-1 text-xs font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
                !receiving && "border-dashed text-muted-foreground"
              )}
            >
              <SupplierMark supplier={s} size="xs" className={cn(!receiving && "opacity-60")} />
              {s.shortName}
              <span className="font-normal text-muted-foreground">
                · Tier {s.tier}
                {receiving ? "" : !s.active ? " · paused" : " · COI expired"}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
