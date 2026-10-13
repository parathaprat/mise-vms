"use client"

import * as React from "react"
import { addDays } from "date-fns"
import {
  FileSignatureIcon,
  HistoryIcon,
  InfoIcon,
  MailIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  UserRoundCheckIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { SupplierMark } from "@/components/app/identity"
import { Sparkline, TimeAgo } from "@/components/app/misc"
import { StatusBadge } from "@/components/app/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { useData, usePolicies } from "@/hooks/use-demo"
import { formatDate, parseLocal } from "@/lib/dates"
import { compactMoney, num, pct, plural } from "@/lib/format"
import { metroById, PROGRAM_NAME } from "@/lib/reference"
import { useStore } from "@/lib/store"
import type { ISODate, Supplier } from "@/lib/types"
import { cn } from "@/lib/utils"

import { scoreFactors, SCORE_WINDOW_DAYS, type SupplierScore } from "../program-data"
import { focusPanelOnOpen, IconTile } from "../shared"
import { GradeBadge, LIMITED_DATA_SHIFTS } from "./supplier-card"
import {
  coiSummary,
  disputeTone,
  distributionStatus,
  formatWindow,
  METRIC_STROKE,
  METRIC_TEXT,
  noShowTone,
  onTimeTone,
  type MetricTone,
} from "./supplier-format"

const COMPLETED_WEEKS = 5

export function SupplierSheet({
  supplier,
  score,
  open,
  onOpenChange,
  today,
}: {
  supplier?: Supplier
  score?: SupplierScore
  open: boolean
  onOpenChange: (open: boolean) => void
  today: ISODate
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        onOpenAutoFocus={focusPanelOnOpen}
        className="gap-0 outline-none data-[side=right]:w-full data-[side=right]:sm:max-w-xl data-[side=right]:lg:max-w-2xl"
      >
        {supplier && score ? (
          <SupplierDetail supplier={supplier} score={score} today={today} />
        ) : (
          <SheetHeader>
            <SheetTitle>Supplier unavailable</SheetTitle>
            <SheetDescription>This supplier is no longer part of the {PROGRAM_NAME} program.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}

function SheetSection({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id: string
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-3 border-b px-4 py-5 last:border-b-0", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={id} className="font-heading text-sm font-semibold tracking-tight">
            {title}
          </h3>
          {description ? <p className="text-xs text-muted-foreground text-pretty">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function ScoreTile({
  label,
  value,
  sub,
  tone = "ok",
  values,
}: {
  label: string
  value: string
  sub?: string
  tone?: MetricTone
  values?: number[]
}) {
  const stroke = METRIC_STROKE[tone]
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border bg-card p-3">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("font-heading text-lg leading-none font-semibold tracking-tight tabular", METRIC_TEXT[tone])}>{value}</dd>
      {values ? (
        <dd aria-hidden>
          <Sparkline values={values} className="h-7" strokeClassName={stroke.stroke} fillClassName={stroke.fill} />
        </dd>
      ) : null}
      {sub ? <dd className="truncate text-xs text-muted-foreground tabular">{sub}</dd> : null}
    </div>
  )
}

const TILE_TONE = {
  success: "bg-success/12 text-success dark:bg-success/18",
  warning: "bg-warning/18 text-warning-foreground dark:bg-warning/20 dark:text-warning",
  danger: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  neutral: "bg-muted text-foreground/70 dark:bg-muted",
}

function ComplianceItem({
  icon,
  tone,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  tone: keyof typeof TILE_TONE
  title: string
  description: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Item variant="outline" size="sm" role="listitem">
      <ItemMedia>
        <IconTile icon={icon} size="md" className={TILE_TONE[tone]} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription className="text-xs">{description}</ItemDescription>
      </ItemContent>
      <ItemActions className="flex-wrap justify-end">{children}</ItemActions>
    </Item>
  )
}

function SupplierDetail({ supplier, score, today }: { supplier: Supplier; score: SupplierScore; today: ISODate }) {
  const policies = usePolicies()
  const setSupplierActive = useStore((s) => s.setSupplierActive)
  const renewSupplierCoi = useStore((s) => s.renewSupplierCoi)
  const workers = useData((d) => d.workers)
  const shifts = useData((d) => d.shifts)
  const venues = useData((d) => d.venues)
  const activities = useData((d) => d.activities)

  const coi = coiSummary(supplier, today)
  const status = distributionStatus(supplier, today)
  const limited = score.assignedPast < LIMITED_DATA_SHIFTS
  const windowLabel = formatWindow(policies.tier1ExclusiveMinutes)
  const coveredVenues = venues.filter((v) => supplier.metros.includes(v.metro)).length

  const confirmedUpcoming = React.useMemo(() => {
    const roster = new Set(workers.filter((w) => w.supplierId === supplier.id).map((w) => w.id))
    return shifts.filter((s) => s.status === "Confirmed" && s.date >= today && !!s.workerId && roster.has(s.workerId)).length
  }, [workers, shifts, supplier.id, today])

  const history = React.useMemo(
    () =>
      activities
        .filter((a) => a.kind === "policy" && a.text.includes(supplier.name))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 4),
    [activities, supplier.name]
  )

  const staffedNote = confirmedUpcoming
    ? `${plural(confirmedUpcoming, "confirmed upcoming shift")} ${confirmedUpcoming === 1 ? "stays" : "stay"} staffed`
    : "no confirmed shifts are affected"
  const stayStaffed = staffedNote.charAt(0).toUpperCase() + staffedNote.slice(1)
  const toggleDescription = !supplier.active
    ? `Paused: ${supplier.shortName} Pros aren't offered new shifts. ${stayStaffed}.`
    : coi.state === "expired"
      ? "On, but Mise excludes this supplier automatically while its certificate of insurance is expired."
      : `Mise offers new shifts to ${supplier.shortName} Pros in ${plural(supplier.metros.length, "market")}. Pausing stops new offers; ${staffedNote}.`

  const tierNote =
    supplier.tier === 1
      ? `First look at every new request, with a ${windowLabel} exclusive window before Tier 2 and 3 suppliers join. Rush requests starting within ${policies.rushLeadTimeHours} hours go to every tier at once.`
      : `Joins requests in its markets once Tier 1's ${windowLabel} exclusive window passes without a fill, or immediately for rush requests starting within ${policies.rushLeadTimeHours} hours.`

  const onToggle = (active: boolean) => {
    setSupplierActive(supplier.id, active)
    if (!active) {
      toast.success(`Distribution paused · ${supplier.name}`, { description: `No new shifts will be offered. ${stayStaffed}.` })
    } else if (coi.state === "expired") {
      toast.warning(`Distribution resumed · ${supplier.name}`, {
        description: "Still excluded until a renewed certificate of insurance is on file.",
      })
    } else {
      toast.success(`Distribution resumed · ${supplier.name}`, {
        description: `Eligible for new requests in ${plural(supplier.metros.length, "market")} starting now.`,
      })
    }
  }

  const onRenew = () => {
    const wasReceiving = status.tone === "success"
    renewSupplierCoi(supplier.id)
    toast.success(`COI verified · ${supplier.shortName}`, {
      description: `Covered through ${formatDate(addDays(parseLocal(today), 365), "MMM d, yyyy")}.${wasReceiving ? "" : " Back in the distribution cascade."}`,
    })
  }

  const recent = (values: number[]) => values.slice(0, COMPLETED_WEEKS)
  const trendStart = score.weekLabels[0]
  const trendEnd = score.weekLabels[COMPLETED_WEEKS]
  const trendLabel =
    trendStart && trendEnd
      ? `${formatDate(trendStart, "MMM d")} – ${formatDate(addDays(parseLocal(trendEnd), -1), "MMM d")}`
      : `${COMPLETED_WEEKS} weeks`
  const factors = scoreFactors(score)
  const noShow = limited ? "ok" : noShowTone(score.noShowRate)
  const onTime = limited ? "ok" : onTimeTone(score.onTimeRate)

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <div className="flex items-center gap-3">
          <SupplierMark supplier={supplier} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <SheetTitle className="truncate text-lg font-semibold tracking-tight">{supplier.name}</SheetTitle>
            <SheetDescription className="truncate">
              Tier {supplier.tier} · {supplier.kind} · {supplier.hq}
            </SheetDescription>
          </div>
          <GradeBadge grade={score.grade} score={score.score} size="lg" />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-2">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          <StatusBadge tone={coi.tone}>{coi.short}</StatusBadge>
          {limited ? <StatusBadge tone="muted">Limited data</StatusBadge> : null}
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SheetSection id="supplier-distribution" title="Distribution">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="supplier-active">Receives new requests</FieldLabel>
              <FieldDescription>{toggleDescription}</FieldDescription>
            </FieldContent>
            <Switch id="supplier-active" checked={supplier.active} onCheckedChange={onToggle} />
          </Field>
          {coi.state === "expired" ? (
            <Alert variant="destructive">
              <ShieldXIcon aria-hidden />
              <AlertTitle>Certificate of insurance expired {formatDate(supplier.coiExpires, "MMM d")}</AlertTitle>
              <AlertDescription>Distribution stays paused until a renewed COI is on file. Confirmed shifts are not affected.</AlertDescription>
            </Alert>
          ) : null}
          <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
            <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
            <span className="text-pretty">
              <span className="font-medium text-foreground">Tier {supplier.tier}.</span> {tierNote}
            </span>
          </p>
        </SheetSection>

        <SheetSection
          id="supplier-scorecard"
          title={`Scorecard · last ${SCORE_WINDOW_DAYS} days`}
          description={`Measured from Mise shift and timesheet records. Trend lines cover ${trendLabel}.`}
        >
          {limited ? (
            <Alert>
              <InfoIcon aria-hidden />
              <AlertTitle>Limited data · {plural(score.assignedPast, "completed shift")}</AlertTitle>
              <AlertDescription>Rates swing with small samples, so tones stay neutral until {LIMITED_DATA_SHIFTS} shifts are on record.</AlertDescription>
            </Alert>
          ) : null}
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <ScoreTile label="Shifts filled" value={num(score.filled)} sub={`${pct(score.fillShare, 1)} of program fills`} values={recent(score.weekly)} />
            <ScoreTile label="Spend" value={compactMoney(score.spend)} sub={`${num(Math.round(score.hours))} hours worked`} values={recent(score.weeklySpend)} />
            <ScoreTile label="Active Pros" value={num(score.activePros)} sub={`of ${num(score.totalPros)} on roster`} />
            <ScoreTile
              label="No-show rate"
              value={pct(score.noShowRate, 1)}
              sub={`${score.noShows} of ${num(score.assignedPast)} shifts`}
              tone={noShow}
              values={recent(score.weeklyNoShowRate)}
            />
            <ScoreTile
              label="On-time arrival"
              value={pct(score.onTimeRate, 1)}
              sub="Clock-in ≤ 15 min after start"
              tone={onTime}
              values={recent(score.weeklyOnTimeRate)}
            />
            <ScoreTile
              label="Timesheet disputes"
              value={pct(score.disputeRate, 1)}
              sub={`${score.disputes} of ${plural(score.entries, "timesheet")}`}
              tone={disputeTone(score.disputeRate)}
            />
          </dl>
          <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground tabular text-pretty">
            <span className="font-medium text-foreground">Score {score.score}</span> = 100
            {factors.map((f) => (
              <span key={f.key}>
                {" "}
                {f.key === "volume" ? "+" : "−"} {Math.abs(f.points).toFixed(1)} {f.label}
              </span>
            ))}
            . A ≥ 90 · B ≥ 75 · C below 75.
          </p>
        </SheetSection>

        <SheetSection id="supplier-compliance" title="Compliance">
          <ItemGroup className="gap-2">
            <ComplianceItem
              icon={coi.state === "valid" ? ShieldCheckIcon : coi.state === "expiring" ? ShieldAlertIcon : ShieldXIcon}
              tone={coi.state === "valid" ? "success" : coi.state === "expiring" ? "warning" : "danger"}
              title="Certificate of insurance"
              description={coi.state === "valid" ? coi.label : `${coi.label}, renewals are verified by the program office.`}
            >
              {coi.state === "valid" ? (
                <StatusBadge tone="success">Current</StatusBadge>
              ) : (
                <Button size="sm" variant={coi.state === "expired" ? "default" : "outline"} onClick={onRenew}>
                  <ShieldCheckIcon data-icon="inline-start" />
                  Mark renewed
                </Button>
              )}
            </ComplianceItem>
            <ComplianceItem
              icon={FileSignatureIcon}
              tone={supplier.msaSigned ? "neutral" : "danger"}
              title="Master services agreement"
              description={`${PROGRAM_NAME} MSA · ${policies.msaFeePct}% program fee, supplier-funded`}
            >
              <StatusBadge tone={supplier.msaSigned ? "success" : "danger"}>{supplier.msaSigned ? "Signed" : "Missing"}</StatusBadge>
            </ComplianceItem>
            <ComplianceItem
              icon={UserRoundCheckIcon}
              tone={supplier.w2 ? "neutral" : "warning"}
              title="W-2 employment"
              description={
                supplier.w2
                  ? `Pros are W-2 employees of ${supplier.shortName}, which runs payroll, taxes and workers' comp.`
                  : `${supplier.shortName} engages Pros as 1099 contractors, review with Legal before expanding.`
              }
            >
              <StatusBadge tone={supplier.w2 ? "success" : "warning"}>{supplier.w2 ? "Verified" : "1099"}</StatusBadge>
            </ComplianceItem>
          </ItemGroup>
        </SheetSection>

        <SheetSection
          id="supplier-markets"
          title="Markets served"
          description={`Mise only offers ${supplier.shortName} requests at venues in these markets, ${coveredVenues} of ${venues.length} venues today.`}
        >
          <ul className="flex flex-wrap gap-1.5">
            {supplier.metros.map((id) => {
              const metro = metroById(id)
              return (
                <li key={id}>
                  <Badge variant="outline">{metro ? `${metro.label}, ${metro.state}` : id}</Badge>
                </li>
              )
            })}
          </ul>
        </SheetSection>

        {history.length ? (
          <SheetSection id="supplier-history" title="Change log">
            <ol className="flex flex-col gap-2.5">
              {history.map((a) => (
                <li key={a.id} className="flex items-start gap-2.5 text-sm">
                  <HistoryIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 text-pretty">{a.text}</span>
                  <TimeAgo value={a.at} className="shrink-0 text-xs text-muted-foreground" />
                </li>
              ))}
            </ol>
          </SheetSection>
        ) : null}
      </div>

      <SheetFooter className="flex-row items-center justify-between gap-3 border-t">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{supplier.contactName}</span>
          <span className="truncate text-xs text-muted-foreground">{supplier.contactEmail}</span>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={`mailto:${supplier.contactEmail}?subject=${encodeURIComponent(`${PROGRAM_NAME} · ${supplier.name}`)}`}>
            <MailIcon data-icon="inline-start" />
            Email account team
          </a>
        </Button>
      </SheetFooter>
    </>
  )
}
