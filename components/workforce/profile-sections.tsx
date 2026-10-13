"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  CalendarPlusIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  HistoryIcon,
  HourglassIcon,
  MessageSquareTextIcon,
  ShieldCheckIcon,
  ThumbsUpIcon,
  TimerIcon,
  TriangleAlertIcon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react"

import { EmptyState, KeyValue, TimeAgo } from "@/components/app/misc"
import {
  EntryStatusBadge,
  ShiftStatusBadge,
  StatusBadge,
  type Tone,
} from "@/components/app/status-badge"
import { ACTIVITY_ICON } from "@/components/shell/notifications"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  daysFromToday,
  formatDate,
  formatTimeRange,
  parseLocal,
  relativeDay,
} from "@/lib/dates"
import { hours as formatHours, money, num, plural, rate } from "@/lib/format"
import type { CertState } from "@/lib/rules"
import { cn } from "@/lib/utils"

import { complianceAction, type ComplianceAction } from "./compliance-board"
import {
  HOURS_BAR,
  HOURS_LABEL,
  HOURS_TEXT,
  HOURS_TONE,
  hoursLevel,
} from "./hours-meter"
import type { CertRow, ProProfileData, TimelineKind } from "./use-pro-profile"

interface SectionProps {
  profile: ProProfileData
}

function firstName(profile: ProProfileData): string {
  const { worker } = profile.row
  return worker.preferredName ?? worker.firstName
}

function ActionButton({ action }: { action: ComplianceAction }) {
  const [done, setDone] = React.useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={done}
      onClick={() => {
        action.run()
        setDone(true)
      }}
    >
      {done ? <CheckIcon data-icon="inline-start" /> : null}
      {done ? action.doneLabel : action.label}
    </Button>
  )
}

// Contractual hours ------------------------------------------------------------

export function ContractualHoursCard({ profile }: SectionProps) {
  const { hours, model, row } = profile
  const { used, cap, warnPct, booked, bookedShifts, weeklyPace, crossing } =
    hours
  const level = hoursLevel(used, cap, warnPct)
  const usedPct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0
  const bookedPct = cap > 0 ? Math.min(100 - usedPct, (booked / cap) * 100) : 0
  const reviewAt = Math.round((cap * warnPct) / 100)
  const blocking = model.policies.blockOverCapWorkers
  const first = firstName(profile)

  let projection: React.ReactNode
  if (used >= cap) {
    projection = (
      <>
        Reached{" "}
        <span className="font-normal text-muted-foreground">
          · {blocking ? "new bookings held" : "policy still allows booking"}
        </span>
      </>
    )
  } else if (crossing?.via === "booked") {
    projection = (
      <>
        {formatDate(crossing.date, "EEE, MMM d")}{" "}
        <span className="font-normal text-muted-foreground">
          · on a booked shift
        </span>
      </>
    )
  } else if (crossing) {
    projection = (
      <>
        ~{formatDate(crossing.date, "MMM d")}{" "}
        <span className="font-normal text-muted-foreground">
          · at current pace
        </span>
      </>
    )
  } else {
    projection = (
      <span className="font-normal text-muted-foreground">
        Not within 6 months
      </span>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contractual hours</CardTitle>
        <CardDescription>
          Approved hours across Compass venues, counted automatically.
        </CardDescription>
        <CardAction>
          <StatusBadge tone={HOURS_TONE[level]}>
            {HOURS_LABEL[level]}
          </StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "font-heading text-3xl font-semibold tracking-tight tabular",
                  HOURS_TEXT[level]
                )}
              >
                {num(used)}
              </span>
              <span className="text-sm text-muted-foreground tabular">
                of {num(cap)} hours
              </span>
            </p>
            <p className="text-sm text-muted-foreground tabular">
              {used >= cap
                ? `${formatHours(used - cap)} over the cap`
                : `${formatHours(cap - used)} remaining`}
            </p>
          </div>
          <div
            className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={cap}
            aria-valuenow={used}
            aria-label={`${used} of ${cap} contractual hours used`}
          >
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width] duration-700",
                HOURS_BAR[level]
              )}
              style={{ width: `${usedPct}%` }}
            />
            {bookedPct > 0 ? (
              <div
                className="absolute inset-y-0 rounded-r-full bg-primary/30"
                style={{ left: `${usedPct}%`, width: `${bookedPct}%` }}
              />
            ) : null}
            <div
              className="absolute inset-y-0 w-px bg-foreground/30"
              style={{ left: `${warnPct}%` }}
              aria-hidden
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className={cn("size-2 rounded-full", HOURS_BAR[level])}
                aria-hidden
              />
              Approved · <span className="tabular">{formatHours(used)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primary/30" aria-hidden />
              Booked ahead ·{" "}
              <span className="tabular">{formatHours(booked)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-px bg-foreground/30" aria-hidden />
              Review at{" "}
              <span className="tabular">
                {num(reviewAt)}h ({warnPct}%)
              </span>
            </span>
          </div>
        </div>
        <dl className="grid gap-4 border-t pt-4 sm:grid-cols-3">
          <KeyValue label="Weekly pace · last 4 weeks">
            <span className="tabular">
              {weeklyPace > 0
                ? `${formatHours(weeklyPace)} / week`
                : "No recent hours"}
            </span>
          </KeyValue>
          <KeyValue label="Booked ahead">
            <span className="tabular">
              {booked > 0
                ? `${formatHours(booked)} · ${plural(bookedShifts, "shift")}`
                : "Nothing booked"}
            </span>
          </KeyValue>
          <KeyValue
            label={used >= cap ? "Contractual cap" : "Projected to reach cap"}
          >
            {projection}
          </KeyValue>
        </dl>
        {level !== "ok" ? (
          <Alert>
            {level === "cap" ? <HourglassIcon /> : <TriangleAlertIcon />}
            <AlertTitle>
              {level === "cap"
                ? blocking
                  ? `Mise is holding new bookings for ${first}`
                  : `${first} is past the ${cap}-hour cap`
                : `${first} is approaching the ${cap}-hour cap`}
            </AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <p>
                {level === "cap"
                  ? blocking
                    ? "Program policy blocks Pros at the contractual cap. Start a conversion review or rotate in other Pros."
                    : "Program policy still allows booking. Review for conversion before adding more hours."
                  : crossing?.via === "booked"
                    ? `Booked shifts take them past the cap on ${formatDate(crossing.date, "MMM d")}.`
                    : crossing
                      ? `At the current pace they reach the cap around ${formatDate(crossing.date, "MMM d")}.`
                      : `Past ${warnPct}% of the cap, counted across every Compass venue.`}
              </p>
              <ActionButton
                action={complianceAction(
                  level === "cap" ? "hours-cap" : "hours-warn",
                  model.persona.id,
                  row,
                  model.today
                )}
              />
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}

// Certifications ---------------------------------------------------------------

const CERT_TONE: Record<CertState, Tone> = {
  valid: "success",
  expiring: "warning",
  expired: "danger",
  missing: "danger",
}

function certLabel(cert: CertRow, today: string): string {
  if (cert.state === "valid") return "Valid"
  if (cert.state === "expired") return "Expired"
  if (cert.state === "missing") return "Missing"
  const days = cert.expires ? daysFromToday(cert.expires, parseLocal(today)) : 0
  return days <= 0 ? "Expires today" : `Expires in ${days}d`
}

export function CertificationsCard({ profile }: SectionProps) {
  const { certs, model, row } = profile
  const { today } = model
  const expired = certs.some((c) => c.state === "expired")
  const expiring = certs.some((c) => c.state === "expiring")
  const issues = certs.filter((c) => c.state !== "valid").length
  const missing = certs.filter((c) => c.state === "missing")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certifications</CardTitle>
        <CardDescription>
          {issues
            ? `${plural(issues, "certification")} need${issues === 1 ? "s" : ""} attention. Mise keeps ${firstName(profile)} off shifts that require an expired or missing certificate.`
            : "Everything required for their positions is current. Mise re-checks expirations before every booking."}
        </CardDescription>
        {expired || expiring ? (
          <CardAction>
            <ActionButton
              action={complianceAction(
                expired ? "cert-expired" : "cert-expiring",
                model.persona.id,
                row,
                today
              )}
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {certs.length === 0 ? (
          <EmptyState
            icon={ShieldCheckIcon}
            title="No certifications on file"
            description="None of their positions require one."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 text-xs text-muted-foreground">
                    Certification
                  </TableHead>
                  <TableHead className="h-9 text-xs text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="h-9 text-xs text-muted-foreground">
                    Expires
                  </TableHead>
                  <TableHead className="h-9 text-xs text-muted-foreground">
                    Verification
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certs.map((cert) => (
                  <TableRow key={cert.type}>
                    <TableCell className="min-w-48 whitespace-normal">
                      <div className="flex flex-col">
                        <span className="font-medium">{cert.type}</span>
                        <span className="text-xs text-muted-foreground">
                          {cert.requiredFor.length
                            ? `Required for ${cert.requiredFor.map((p) => p.title).join(", ")}`
                            : "Optional"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={CERT_TONE[cert.state]}>
                        {certLabel(cert, today)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="tabular">
                      {cert.expires
                        ? formatDate(cert.expires, "MMM d, yyyy")
                        : "–"}
                    </TableCell>
                    <TableCell>
                      {!cert.expires ? (
                        <span className="text-muted-foreground">
                          Not on file
                        </span>
                      ) : cert.verified ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <BadgeCheckIcon className="size-3.5" aria-hidden />
                          Verified
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Pending review
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {missing.length ? (
          <p className="text-xs text-muted-foreground">
            {missing.map((c) => c.type).join(" and ")}{" "}
            {missing.length === 1 ? "is" : "are"} required in this market but
            not on file, {row.supplier?.shortName ?? "the supplier"} uploads it
            once the Pro is certified.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

// Upcoming shifts --------------------------------------------------------------

const COLLAPSED_SHIFTS = 5

function DateTile({ date }: { date: string }) {
  return (
    <div
      className="flex w-11 shrink-0 flex-col items-center rounded-lg border bg-muted/30 py-1"
      aria-hidden
    >
      <span className="text-[10px] font-medium text-muted-foreground uppercase">
        {formatDate(date, "MMM")}
      </span>
      <span className="text-base leading-tight font-semibold tabular">
        {formatDate(date, "d")}
      </span>
    </div>
  )
}

export function UpcomingShiftsCard({
  profile,
  requestHref,
}: SectionProps & { requestHref?: string }) {
  const { upcoming, model } = profile
  const [expanded, setExpanded] = React.useState(false)
  const now = parseLocal(model.today)
  const visible = expanded ? upcoming : upcoming.slice(0, COLLAPSED_SHIFTS)
  const total = upcoming.reduce((sum, item) => sum + item.hours, 0)
  const where = model.persona.id === "venue" ? " at your venues" : ""

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming shifts</CardTitle>
        <CardDescription>
          {upcoming.length
            ? `${plural(upcoming.length, "shift")} booked${where} · ${formatHours(total)} scheduled`
            : `Nothing booked${where} yet.`}
        </CardDescription>
        {requestHref && upcoming.length ? (
          <CardAction>
            <Button size="sm" variant="outline" asChild>
              <Link href={requestHref}>
                <CalendarPlusIcon data-icon="inline-start" />
                Book again
              </Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarDaysIcon}
            title="No upcoming shifts"
            description={
              requestHref
                ? `Request ${firstName(profile)} directly and they get first look before the shift goes to the wider pool.`
                : "Shifts show up here as soon as they're confirmed."
            }
            action={
              requestHref ? (
                <Button size="sm" asChild>
                  <Link href={requestHref}>
                    <CalendarPlusIcon data-icon="inline-start" />
                    Request {firstName(profile)}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col divide-y">
            {visible.map((item) => (
              <li key={item.shift.id}>
                <Link
                  href={`/requests/${item.request.id}`}
                  className="group flex items-center gap-3 rounded-md py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <DateTile date={item.shift.date} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {item.position?.title ?? "Shift"} ·{" "}
                      {item.venue?.shortName ?? "Venue"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {relativeDay(item.shift.date, now)} ·{" "}
                      {formatTimeRange(
                        item.request.startTime,
                        item.request.endTime
                      )}
                      {item.request.eventName
                        ? ` · ${item.request.eventName}`
                        : ""}
                    </span>
                  </div>
                  <ShiftStatusBadge
                    status={item.shift.status}
                    className="hidden sm:inline-flex"
                  />
                  <ChevronRightIcon
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {upcoming.length > COLLAPSED_SHIFTS ? (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? "Show fewer"
              : `Show ${upcoming.length - COLLAPSED_SHIFTS} more`}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

// Recent work ------------------------------------------------------------------

const RECENT_ROWS = 8

export function RecentWorkCard({ profile }: SectionProps) {
  const { recent, model } = profile
  const now = parseLocal(model.today)
  const last30 = recent.filter((w) => daysFromToday(w.entry.date, now) >= -30)
  const hours30 = last30.reduce((sum, w) => sum + w.hours, 0)
  const where = model.persona.id === "venue" ? " at your venues" : ""

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent work</CardTitle>
        <CardDescription>
          {recent.length
            ? `${formatHours(hours30)} across ${plural(last30.length, "shift")} in the last 30 days${where}. Hours land here the moment they clock out.`
            : `No timesheets${where} yet.`}
        </CardDescription>
        {recent.length ? (
          <CardAction>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/timesheets">
                Timesheets
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {recent.length === 0 ? (
          <EmptyState
            icon={TimerIcon}
            title="No timesheets yet"
            description={`Geofenced clock-ins create timesheets automatically, so there's nothing to upload when ${firstName(profile)} works their first shift.`}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 text-xs text-muted-foreground">
                    Date
                  </TableHead>
                  <TableHead className="h-9 text-xs text-muted-foreground">
                    Shift
                  </TableHead>
                  <TableHead className="h-9 text-right text-xs text-muted-foreground">
                    Hours
                  </TableHead>
                  <TableHead className="h-9 text-right text-xs text-muted-foreground">
                    Amount
                  </TableHead>
                  <TableHead className="h-9 text-xs text-muted-foreground">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.slice(0, RECENT_ROWS).map((w) => (
                  <TableRow key={w.entry.id}>
                    <TableCell className="text-muted-foreground tabular">
                      {formatDate(w.entry.date, "MMM d")}
                    </TableCell>
                    <TableCell className="max-w-64">
                      <Link
                        href={`/timesheets?request=${w.request.id}`}
                        className="flex min-w-0 flex-col hover:underline"
                      >
                        <span className="truncate font-medium">
                          {w.position?.title ?? "Shift"} ·{" "}
                          {w.venue?.shortName ?? "Venue"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {w.request.eventName ?? w.request.id}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {formatHours(w.hours)}
                      {w.entry.overtimeHours > 0 ? (
                        <span className="block text-xs text-muted-foreground">
                          {formatHours(w.entry.overtimeHours)} OT
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {money(w.entry.amount, true)}
                    </TableCell>
                    <TableCell>
                      <EntryStatusBadge status={w.entry.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Onboarding -------------------------------------------------------------------

export function OnboardingCard({ profile }: SectionProps) {
  const { row, model } = profile
  const items = row.worker.onboarding
  const complete = items.filter((o) => o.status === "Complete").length
  const pending = items.length - complete
  const pct = items.length ? Math.round((complete / items.length) * 100) : 100

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding</CardTitle>
        <CardDescription>
          {pending
            ? `${plural(pending, "step")} left. Not bookable until every step clears.`
            : "Cleared for Compass shifts."}
        </CardDescription>
        <CardAction>
          <span className="text-sm font-medium tabular">
            {complete}/{items.length}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Progress value={pct} aria-label={`Onboarding ${pct}% complete`} />
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2.5 text-sm">
              {item.status === "Complete" ? (
                <CircleCheckIcon
                  className="size-4 shrink-0 text-success"
                  aria-label="Complete"
                />
              ) : (
                <CircleDashedIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-label="Pending"
                />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  item.status === "Pending" && "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular">
                {item.completedAt
                  ? formatDate(item.completedAt, "MMM d, yyyy")
                  : "Pending"}
              </span>
            </li>
          ))}
        </ul>
        {pending ? (
          <div>
            <ActionButton
              action={complianceAction(
                "onboarding",
                model.persona.id,
                row,
                model.today
              )}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// Positions --------------------------------------------------------------------

export function PositionsCard({ profile }: SectionProps) {
  const { positions, model, row } = profile
  const isSupplier = model.persona.id === "supplier"
  const withYou = model.persona.id === "venue" ? " with you" : ""

  return (
    <Card>
      <CardHeader>
        <CardTitle>Positions</CardTitle>
        <CardDescription>
          {isSupplier ? "Pay rates" : "Bill rates"} from the FlexForce{" "}
          {row.metroLabel} rate card.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <EmptyState icon={CalendarDaysIcon} title="No positions on file" />
        ) : (
          <ul className="flex flex-col divide-y">
            {positions.map((item) => (
              <li
                key={item.position.id}
                className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {item.position.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.position.category} ·{" "}
                    {item.shifts
                      ? `${plural(item.shifts, "recent shift")}${withYou}`
                      : "No recent shifts"}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-medium tabular">
                    {item.rateCard
                      ? rate(
                          isSupplier
                            ? item.rateCard.payRate
                            : item.rateCard.billRate
                        )
                      : "–"}
                  </span>
                  {item.missing.length ? (
                    <StatusBadge tone="danger">
                      Needs {item.missing.join(", ")}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="success">Cleared</StatusBadge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// Captain notes ----------------------------------------------------------------

export function CaptainNotesCard({ profile }: SectionProps) {
  const { notes, model } = profile
  return (
    <Card>
      <CardHeader>
        <CardTitle>Captain notes</CardTitle>
        <CardDescription>
          {model.persona.id === "supplier"
            ? "What venue leads say after each shift, shared with you automatically."
            : "Left by venue leads when they approve hours. Suppliers see them too."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {notes.length === 0 ? (
          <EmptyState
            icon={MessageSquareTextIcon}
            title="No notes yet"
            description="Notes appear after their first shift with a captain."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((note) => (
              <li key={note.id}>
                <figure className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
                  <blockquote className="text-sm text-pretty">
                    &ldquo;{note.text}&rdquo;
                  </blockquote>
                  <figcaption className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {note.tone === "coaching" ? (
                      <StatusBadge tone="warning" dot={false}>
                        Coaching
                      </StatusBadge>
                    ) : (
                      <ThumbsUpIcon className="size-3" aria-hidden />
                    )}
                    <span className="font-medium text-foreground">
                      {note.author}
                    </span>
                    <span>
                      · {note.venue?.shortName ?? "Venue"} ·{" "}
                      {formatDate(note.date, "MMM d")}
                    </span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// Activity ---------------------------------------------------------------------

const COLLAPSED_TIMELINE = 8

function timelineIcon(kind: TimelineKind): LucideIcon {
  if (kind === "shift") return CalendarCheckIcon
  if (kind === "joined") return UserPlusIcon
  return ACTIVITY_ICON[kind] ?? HistoryIcon
}

export function ActivityCard({ profile }: SectionProps) {
  const { timeline } = profile
  const [expanded, setExpanded] = React.useState(false)
  const visible = expanded ? timeline : timeline.slice(0, COLLAPSED_TIMELINE)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          Bookings, check-ins, roster changes and timesheet edits in one audit
          trail.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ol className="relative flex flex-col gap-4 before:absolute before:inset-y-2 before:left-3.5 before:w-px before:bg-border">
          {visible.map((item) => {
            const Icon = timelineIcon(item.kind)
            return (
              <li key={item.id} className="relative flex gap-3">
                <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="text-sm text-pretty hover:underline"
                    >
                      {item.text}
                    </Link>
                  ) : (
                    <span className="text-sm text-pretty">{item.text}</span>
                  )}
                  {item.at.includes("T") ? (
                    <TimeAgo
                      value={item.at}
                      className="self-start text-xs text-muted-foreground"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground tabular">
                      {formatDate(item.at, "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
        {timeline.length > COLLAPSED_TIMELINE ? (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show less" : `Show all ${num(timeline.length)}`}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
