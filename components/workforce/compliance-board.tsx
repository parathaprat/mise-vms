"use client"

import * as React from "react"
import { addDays } from "date-fns"
import {
  CheckIcon,
  GaugeIcon,
  HourglassIcon,
  ListChecksIcon,
  SearchXIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { WorkerCell } from "@/components/app/identity"
import { EmptyState } from "@/components/app/misc"
import { StatusBadge, type Tone } from "@/components/app/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { daysFromToday, formatDate, parseLocal, relativeDay, toISODate } from "@/lib/dates"
import { workerName } from "@/lib/format"
import type { ComplianceFlag } from "@/lib/selectors"
import type { PersonaId, Policies } from "@/lib/types"
import { cn } from "@/lib/utils"

import { HoursMeter } from "./hours-meter"
import { FLAG_TONE, type ProRow, type WorkforceModel } from "./use-workforce"

type FlagKind = ComplianceFlag["kind"]

interface GroupDef {
  kind: FlagKind
  icon: LucideIcon
  title: (p: Policies) => string
  description: (p: Policies, persona: PersonaId) => string
}

const GROUPS: GroupDef[] = [
  {
    kind: "cert-expired",
    icon: ShieldXIcon,
    title: () => "Expired certifications",
    description: () => "Mise keeps these Pros off shifts that require the certification until a renewal is verified.",
  },
  {
    kind: "hours-cap",
    icon: HourglassIcon,
    title: (p) => `At the ${p.contractualHoursCap}-hour contractual cap`,
    description: (p) =>
      p.blockOverCapWorkers
        ? "New bookings are blocked by program policy. Review for conversion or rotation."
        : "Program policy still allows booking. Review them for conversion.",
  },
  {
    kind: "cert-expiring",
    icon: ShieldAlertIcon,
    title: () => "Certifications expiring within 30 days",
    description: (_p, persona) =>
      persona === "supplier"
        ? "Mise reminds the Pro automatically. A nudge from you speeds it up."
        : "Renewal reminders go to the Pro and their supplier automatically.",
  },
  {
    kind: "hours-warn",
    icon: GaugeIcon,
    title: () => "Approaching the contractual cap",
    description: (p) => `Past ${p.contractualHoursWarnPct}% of the ${p.contractualHoursCap}-hour cap, counted across every Compass venue.`,
  },
  {
    kind: "onboarding",
    icon: ListChecksIcon,
    title: () => "Onboarding incomplete",
    description: () => "Not yet cleared for Compass shifts until every onboarding step is complete.",
  },
]

const ICON_TONE: Record<Tone, string> = {
  neutral: "bg-muted text-foreground",
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/18 text-warning-foreground dark:text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info/12 text-info",
}

const COLLAPSED_ROWS = 6

interface ComplianceBoardProps {
  model: WorkforceModel
  rows: ProRow[]
  filtered: boolean
  onClearFilters: () => void
}

export function ComplianceBoard({ model, rows, filtered, onClearFilters }: ComplianceBoardProps) {
  const groups = React.useMemo(
    () =>
      GROUPS.map((group) => ({
        group,
        rows: rows
          .filter((r) => r.flags.some((f) => f.kind === group.kind))
          .sort((a, b) => b.upcoming - a.upcoming || (a.nextShift ?? "~").localeCompare(b.nextShift ?? "~") || a.name.localeCompare(b.name)),
      })).filter((g) => g.rows.length > 0),
    [rows]
  )

  if (groups.length === 0) {
    return filtered ? (
      <EmptyState
        icon={SearchXIcon}
        title="No compliance flags match these filters"
        action={
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={ShieldCheckIcon}
        title="Everyone is compliant"
        description="No expired certifications, contractual-hour risks, or unfinished onboarding in this view."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ group, rows: groupRows }) => (
        <ComplianceGroup key={group.kind} group={group} rows={groupRows} model={model} />
      ))}
    </div>
  )
}

function ComplianceGroup({ group, rows, model }: { group: GroupDef; rows: ProRow[]; model: WorkforceModel }) {
  const [expanded, setExpanded] = React.useState(false)
  const [done, setDone] = React.useState<Set<string>>(() => new Set())
  const tone = FLAG_TONE[group.kind]
  const Icon = group.icon
  const visible = expanded ? rows : rows.slice(0, COLLAPSED_ROWS)
  const booked = rows.filter((r) => r.upcoming > 0).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", ICON_TONE[tone])}>
            <Icon className="size-3.5" aria-hidden />
          </span>
          <span>{group.title(model.policies)}</span>
          <Badge variant="secondary" className="tabular">
            {rows.length}
          </Badge>
        </CardTitle>
        <CardDescription>
          {group.description(model.policies, model.persona.id)}
          {booked ? ` ${booked} ${booked === 1 ? "is" : "are"} booked on upcoming shifts.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ul className="flex flex-col divide-y">
          {visible.map((row) => {
            const action = complianceAction(group.kind, model.persona.id, row, model.today)
            const isDone = done.has(row.id)
            return (
              <li key={row.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:gap-4">
                <WorkerCell
                  worker={row.worker}
                  href={`/workforce/${row.id}`}
                  subtitle={`${row.supplier?.shortName ?? "Supplier"} · ${row.metroLabel}`}
                  className="md:w-60 md:shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <FlagDetail kind={group.kind} row={row} model={model} />
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  {row.nextShift ? (
                    <StatusBadge tone="primary" className="shrink-0">
                      Booked {relativeDay(row.nextShift, parseLocal(model.today))}
                      {row.upcoming > 1 ? ` +${row.upcoming - 1}` : ""}
                    </StatusBadge>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isDone}
                    onClick={() => {
                      action.run()
                      setDone((prev) => new Set(prev).add(row.id))
                    }}
                  >
                    {isDone ? <CheckIcon data-icon="inline-start" /> : null}
                    {isDone ? action.doneLabel : action.label}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
        {rows.length > COLLAPSED_ROWS ? (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show fewer" : `Show ${rows.length - COLLAPSED_ROWS} more`}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

function flaggedCerts(kind: "cert-expired" | "cert-expiring", row: Pick<ProRow, "worker">, today: string) {
  const soon = toISODate(addDays(parseLocal(today), 30))
  return row.worker.certs.filter((c) => (kind === "cert-expired" ? c.expires < today : c.expires >= today && c.expires <= soon))
}

function FlagDetail({ kind, row, model }: { kind: FlagKind; row: ProRow; model: WorkforceModel }) {
  const { today, policies } = model
  if (kind === "cert-expired" || kind === "cert-expiring") {
    const certs = flaggedCerts(kind, row, today)
    return (
      <div className="flex flex-col gap-0.5">
        {certs.map((c) => {
          const days = daysFromToday(c.expires, parseLocal(today))
          return (
            <span key={c.type} className="text-sm">
              <span className="font-medium">{c.type}</span>
              <span className="text-muted-foreground">
                {" "}
                · {kind === "cert-expired" ? `expired ${formatDate(c.expires, "MMM d")}` : `expires ${formatDate(c.expires, "MMM d")} (${days === 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`})`}
              </span>
            </span>
          )
        })}
      </div>
    )
  }
  if (kind === "hours-cap" || kind === "hours-warn") {
    return (
      <HoursMeter
        hours={row.worker.compassHours}
        cap={policies.contractualHoursCap}
        warnPct={policies.contractualHoursWarnPct}
        className="max-w-xs"
      />
    )
  }
  const pending = row.worker.onboarding
    .filter(
      (item) =>
        item.status === "Pending" ||
        (!!item.expiresAt && item.expiresAt < today)
    )
    .map((item) =>
      item.expiresAt && item.expiresAt < today
        ? `${item.label} expired ${formatDate(item.expiresAt, "MMM d")}`
        : item.label
    )
  return (
    <span className="text-sm">
      <span className="text-muted-foreground">Safety gate: </span>
      {pending.join(", ")}
    </span>
  )
}

export interface ComplianceAction {
  label: string
  doneLabel: string
  run: () => void
}

export function complianceAction(kind: FlagKind, persona: PersonaId, row: Pick<ProRow, "worker" | "supplier">, today: string): ComplianceAction {
  const name = workerName(row.worker)
  const first = row.worker.preferredName ?? row.worker.firstName
  const supplier = row.supplier?.shortName ?? "their supplier"
  if (kind === "cert-expired" || kind === "cert-expiring") {
    const certs = flaggedCerts(kind, row, today)
      .map((c) => c.type)
      .join(" and ")
    if (persona === "supplier") {
      return {
        label: "Send reminder",
        doneLabel: "Reminder sent",
        run: () => toast.success(`Reminder texted to ${first}`, { description: `Includes a link to upload the renewed ${certs} certificate.` }),
      }
    }
    return {
      label: "Request renewal",
      doneLabel: "Requested",
      run: () => toast.success(`Renewal requested from ${supplier}`, { description: `Mise will verify ${name}'s ${certs} certificate as soon as it's uploaded.` }),
    }
  }
  if (kind === "hours-cap" || kind === "hours-warn") {
    if (persona === "program") {
      return {
        label: "Start conversion review",
        doneLabel: "Review opened",
        run: () => toast.success(`Conversion review opened for ${name}`, { description: "HR business partners get the full Compass hours history across every venue." }),
      }
    }
    if (persona === "supplier") {
      return {
        label: "Plan rotation",
        doneLabel: "Rotation noted",
        run: () => toast.success(`Rotation plan noted for ${name}`, { description: "Mise will suggest alternate Pros on upcoming requests." }),
      }
    }
    return {
      label: "Flag for conversion",
      doneLabel: "Flagged",
      run: () => toast.success(`${name} flagged for conversion`, { description: "The FlexForce program team will follow up with next steps." }),
    }
  }
  if (persona === "supplier") {
    return {
      label: "Nudge Pro",
      doneLabel: "Nudged",
      run: () => toast.success(`Nudge sent to ${first}`, { description: "They'll get a text with the remaining onboarding steps." }),
    }
  }
  return {
    label: "Ask supplier to expedite",
    doneLabel: "Asked",
    run: () => toast.success(`${supplier} asked to expedite onboarding`, { description: `${name} can be booked as soon as every step is complete.` }),
  }
}
