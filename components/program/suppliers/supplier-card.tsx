"use client"

import { ChevronRightIcon } from "lucide-react"

import { SupplierMark } from "@/components/app/identity"
import { Sparkline } from "@/components/app/misc"
import { StatusBadge } from "@/components/app/status-badge"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { compactMoney, num, pct, plural } from "@/lib/format"
import type { ISODate, Supplier } from "@/lib/types"
import { cn } from "@/lib/utils"

import type { Grade, SupplierScore } from "../program-data"
import { coiSummary, disputeTone, distributionStatus, GRADE_STYLE, METRIC_TEXT, noShowTone, onTimeTone, type MetricTone } from "./supplier-format"

export const LIMITED_DATA_SHIFTS = 20

export function GradeBadge({ grade, score, size = "md", className }: { grade: Grade; score: number; size?: "md" | "lg"; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-0.5", className)}>
      <span
        className={cn(
          "flex items-center justify-center font-heading font-semibold",
          size === "lg" ? "size-12 rounded-xl text-2xl" : "size-10 rounded-xl text-xl",
          GRADE_STYLE[grade]
        )}
        aria-label={`Grade ${grade}, score ${score} of 100`}
      >
        {grade}
      </span>
      <span className="text-xs text-muted-foreground tabular" aria-hidden>
        {score}
      </span>
    </div>
  )
}

function Metric({ label, value, sub, tone = "ok" }: { label: string; value: string; sub?: string; tone?: MetricTone }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("font-heading text-base font-semibold tracking-tight tabular", METRIC_TEXT[tone])}>{value}</dd>
      {sub ? <dd className="truncate text-xs text-muted-foreground tabular">{sub}</dd> : null}
    </div>
  )
}

export function SupplierCard({
  supplier,
  score,
  today,
  onOpen,
}: {
  supplier: Supplier
  score: SupplierScore
  today: ISODate
  onOpen: () => void
}) {
  const coi = coiSummary(supplier, today)
  const status = distributionStatus(supplier, today)
  const limited = score.assignedPast < LIMITED_DATA_SHIFTS
  const thisWeek = score.weekly[score.weekly.length - 1] ?? 0

  return (
    <Card className="relative h-full transition-shadow hover:ring-foreground/20 has-focus-visible:ring-2 has-focus-visible:ring-ring/50">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <SupplierMark supplier={supplier} size="md" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <CardTitle className="truncate">
              <button type="button" onClick={onOpen} className="text-left outline-none after:absolute after:inset-0 after:content-['']">
                {supplier.name}
              </button>
            </CardTitle>
            <CardDescription className="truncate text-xs">
              Tier {supplier.tier} · {supplier.kind} · {supplier.hq}
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <GradeBadge grade={score.grade} score={score.score} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <dl className="grid grid-cols-3 gap-x-3 gap-y-3">
          <Metric label="Active Pros" value={num(score.activePros)} sub={`of ${num(score.totalPros)} on roster`} />
          <Metric label="Shifts filled" value={num(score.filled)} sub={`${pct(score.fillShare, 1)} share`} />
          <Metric label="Spend" value={compactMoney(score.spend)} sub={`${num(Math.round(score.hours))} hours`} />
          <Metric
            label="No-show rate"
            value={pct(score.noShowRate, 1)}
            sub={`${score.noShows} of ${num(score.assignedPast)}`}
            tone={limited ? "ok" : noShowTone(score.noShowRate)}
          />
          <Metric label="On-time" value={pct(score.onTimeRate, 1)} sub="≤ 15 min after start" tone={limited ? "ok" : onTimeTone(score.onTimeRate)} />
          <Metric label="Disputes" value={pct(score.disputeRate, 1)} sub={plural(score.disputes, "timesheet")} tone={disputeTone(score.disputeRate)} />
        </dl>

        <div className="flex items-end justify-between gap-4 rounded-lg bg-muted/40 px-3 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-xs text-muted-foreground">Shifts filled · 6 weeks</span>
            <span className="text-sm font-medium tabular">{num(thisWeek)} this week</span>
          </div>
          <Sparkline values={score.weekly} className="h-8 w-28 shrink-0" />
        </div>

        <div className="mt-auto flex flex-wrap gap-1.5">
          <StatusBadge tone={coi.tone}>{coi.short}</StatusBadge>
          <StatusBadge tone={supplier.msaSigned ? "neutral" : "danger"}>{supplier.msaSigned ? "MSA signed" : "MSA missing"}</StatusBadge>
          <StatusBadge tone={supplier.w2 ? "neutral" : "warning"}>{supplier.w2 ? "W-2 Pros" : "1099 Pros"}</StatusBadge>
          {limited ? <StatusBadge tone="muted">Limited data · {plural(score.assignedPast, "shift")}</StatusBadge> : null}
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-3 text-xs">
        <span className="flex min-w-0 items-center gap-2">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          <span className="truncate text-muted-foreground">{plural(supplier.metros.length, "market")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 font-medium">
          View scorecard
          <ChevronRightIcon className="size-3.5" aria-hidden />
        </span>
      </CardFooter>
    </Card>
  )
}
