"use client"

import {
  BadgeCheckIcon,
  CircleAlertIcon,
  Clock3Icon,
  ScanLineIcon,
  ShieldCheckIcon,
  UsersRoundIcon,
} from "lucide-react"

import { WorkerAvatar } from "@/components/app/identity"
import { StatusBadge } from "@/components/app/status-badge"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useData } from "@/hooks/use-demo"
import { pct, plural, workerName } from "@/lib/format"
import { certStatus, requiredCertsFor } from "@/lib/rules"
import { backgroundCheckState } from "@/lib/safety"
import type { Lookups } from "@/lib/selectors"
import type { Invoice, TimeEntry } from "@/lib/types"

interface InvoiceTrustCardProps {
  invoice: Invoice
  entryMap: Map<string, TimeEntry>
  lookups: Lookups
}

export function InvoiceTrustCard({
  invoice,
  entryMap,
  lookups,
}: InvoiceTrustCardProps) {
  const overtimeMultiplier = useData(
    (data) => data.policies.overtimeMultiplier
  )
  const entries = [...entryMap.values()]
  const workers = [
    ...new Map(
      entries
        .map((entry) => lookups.workers.get(entry.workerId))
        .filter((worker) => !!worker)
        .map((worker) => [worker.id, worker])
    ).values(),
  ]

  const onSite = entries.filter((entry) => entry.source !== "Manual").length
  const approved = entries.filter(
    (entry) => !!entry.approvedAt && !!entry.approvedBy
  ).length
  const clean = entries.filter(
    (entry) => entry.anomalies.length === 0 && entry.adjustments.length === 0
  ).length
  const rateLines = invoice.lines.filter(
    (line) => line.kind === "labor" || line.kind === "overtime"
  )
  const matchingRates = rateLines.filter((line) => {
    const request = line.requestId
      ? lookups.requests.get(line.requestId)
      : undefined
    if (!request) return false
    const expected =
      line.kind === "overtime"
        ? request.billRate * overtimeMultiplier
        : request.billRate
    return Math.abs(line.rate - expected) < 0.01
  }).length
  const safetyReady = entries.filter((entry) => {
    const worker = lookups.workers.get(entry.workerId)
    const request = lookups.requests.get(entry.requestId)
    if (!worker || !request) return false
    const venue = lookups.venues.get(request.venueId)
    const position = lookups.positions.get(request.positionId)
    if (!venue || !position) return false
    return (
      backgroundCheckState(worker, entry.date) === "ready" &&
      requiredCertsFor(position, venue).every((cert) => {
        const state = certStatus(worker, cert, entry.date)
        return state !== "missing" && state !== "expired"
      })
    )
  }).length

  const exceptions =
    (entries.length - onSite) +
    (entries.length - approved) +
    (rateLines.length - matchingRates) +
    (entries.length - safetyReady)
  const ready = entries.length > 0 && exceptions === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {ready ? (
            <BadgeCheckIcon className="size-4 text-success" aria-hidden />
          ) : (
            <CircleAlertIcon className="size-4 text-warning" aria-hidden />
          )}
          Invoice check
        </CardTitle>
        <CardAction>
          <StatusBadge tone={ready ? "success" : "warning"}>
            {ready ? "Ready to approve" : `${exceptions} to review`}
          </StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <TrustCheck
            icon={UsersRoundIcon}
            label="Named workers"
            value={plural(workers.length, "worker")}
            detail={`${safetyReady}/${entries.length} safety ready`}
            passed={safetyReady === entries.length}
          />
          <TrustCheck
            icon={ScanLineIcon}
            label="On-site time"
            value={`${onSite}/${entries.length} verified`}
            detail={entries.length ? `${pct(onSite / entries.length)} from geofence or kiosk` : "No time recorded"}
            passed={onSite === entries.length}
          />
          <TrustCheck
            icon={ShieldCheckIcon}
            label="Agreed rates"
            value={`${matchingRates}/${rateLines.length} match`}
            detail="Against the awarded request rate"
            passed={matchingRates === rateLines.length}
          />
          <TrustCheck
            icon={Clock3Icon}
            label="Approved hours"
            value={`${approved}/${entries.length} approved`}
            detail={`${clean}/${entries.length} needed no adjustment`}
            passed={approved === entries.length}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <span className="mr-1 text-xs font-medium text-muted-foreground">
            People on this invoice
          </span>
          {workers.slice(0, 6).map((worker) => (
            <span
              key={worker.id}
              className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
            >
              <WorkerAvatar worker={worker} size="sm" />
              {workerName(worker)}
            </span>
          ))}
          {workers.length > 6 ? (
            <span className="text-xs text-muted-foreground">
              +{workers.length - 6} more
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function TrustCheck({
  icon: Icon,
  label,
  value,
  detail,
  passed,
}: {
  icon: typeof UsersRoundIcon
  label: string
  value: string
  detail: string
  passed: boolean
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background">
        <Icon
          className={passed ? "size-4 text-success" : "size-4 text-warning"}
          aria-hidden
        />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular">{value}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
    </div>
  )
}
