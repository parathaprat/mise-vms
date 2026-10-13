"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowUpRightIcon, CircleCheckBigIcon, CircleDashedIcon } from "lucide-react"

import { WorkerCell } from "@/components/app/identity"
import { EmptyState } from "@/components/app/misc"
import { StatusBadge } from "@/components/app/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatClock } from "@/lib/dates"
import { num, plural, workerName } from "@/lib/format"
import type { PersonaId } from "@/lib/types"
import { cn } from "@/lib/utils"

import { compactClock, durationLabel, SERVICE_LABEL, type AttentionItem, type LiveRow } from "./schedule-data"

const VISIBLE = 6

interface NeedsAttentionProps {
  items: AttentionItem[]
  personaId: PersonaId
  isToday: boolean
  nextGap?: LiveRow
  className?: string
}

export function NeedsAttention({ items, personaId, isToday, nextGap, className }: NeedsAttentionProps) {
  const [expanded, setExpanded] = React.useState(false)
  const shown = expanded ? items : items.slice(0, VISIBLE)
  const urgent = items.filter((i) => i.urgency >= 150).length

  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="border-b py-4">
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>
          {items.length ? "Late Pros, no-shows and gaps starting within 3 hours" : isToday ? "Nothing needs you right now" : "Nothing flagged for this day"}
        </CardDescription>
        {items.length ? (
          <CardAction>
            <Badge variant={urgent ? "destructive" : "secondary"} className="tabular">
              {urgent ? `${num(urgent)} urgent` : num(items.length)}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="p-2">
        {items.length === 0 ? (
          <EmptyState
            icon={CircleCheckBigIcon}
            title="All clear"
            description={
              nextGap
                ? `Next gap: ${plural(nextGap.counts.open, "open shift")} for ${nextGap.view.position.title} at ${nextGap.view.venue.shortName}, starting ${compactClock(nextGap.start)}.`
                : isToday
                  ? "No late Pros, no-shows or gaps starting in the next 3 hours."
                  : "No no-shows or staffing gaps flagged for this day."
            }
            className="border-0 py-8"
          />
        ) : (
          <ItemGroup className="gap-1">
            {shown.map((item) => (
              <div key={item.id} role="listitem">
                <AttentionRow item={item} personaId={personaId} />
              </div>
            ))}
          </ItemGroup>
        )}
      </CardContent>
      {items.length > VISIBLE ? (
        <CardFooter className="justify-center py-2">
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show fewer" : `Show ${num(items.length - VISIBLE)} more`}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}

function rowContext(row: LiveRow) {
  return `${row.view.position.title} · ${row.view.venue.shortName}`
}

function RequestLink({ row, label }: { row: LiveRow; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={`/requests/${row.view.req.id}`} aria-label={`${label} ${row.view.req.id}`}>
            <ArrowUpRightIcon />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label} {row.view.req.id}
      </TooltipContent>
    </Tooltip>
  )
}

function AttentionRow({ item, personaId }: { item: AttentionItem; personaId: PersonaId }) {
  if (item.kind === "late") {
    return (
      <Item size="sm" className="hover:bg-muted/40">
        <ItemContent className="min-w-0">
          <WorkerCell
            worker={item.worker}
            href={item.worker ? `/workforce/${item.worker.id}` : undefined}
            subtitle={`${rowContext(item.row)} · ${item.shift.backfillFor ? "backfill" : `due ${compactClock(item.row.start)}`}`}
          />
        </ItemContent>
        <ItemActions>
          <StatusBadge tone="warning" pulse>
            {durationLabel(item.minutes)} late
          </StatusBadge>
          <RequestLink row={item.row} label="Open" />
        </ItemActions>
      </Item>
    )
  }

  if (item.kind === "noshow") {
    const state = item.backfillState
    const badge = !item.backfill ? (
      <StatusBadge tone="danger">No backfill</StatusBadge>
    ) : state === "onsite" || state === "completed" ? (
      <StatusBadge tone="success">Backfilled</StatusBadge>
    ) : state === "late" ? (
      <StatusBadge tone="warning">Backfill late</StatusBadge>
    ) : (
      <StatusBadge tone="info" pulse>
        Backfill en route
      </StatusBadge>
    )
    const replacement = item.backfillWorker ? workerName(item.backfillWorker) : null
    const detail = item.backfill
      ? state === "onsite" || state === "completed"
        ? `${replacement ?? "Replacement"} on site${item.backfill.checkInAt ? ` since ${formatClock(item.backfill.checkInAt)}` : ""}`
        : `${replacement ?? "Replacement"} dispatched${item.backfill.assignedAt ? ` at ${formatClock(item.backfill.assignedAt)}` : ""}`
      : personaId === "supplier"
        ? "Send a replacement Pro"
        : "Mise couldn’t find an eligible replacement"
    return (
      <Item size="sm" className="hover:bg-muted/40">
        <ItemContent className="min-w-0">
          <WorkerCell worker={item.worker} href={item.worker ? `/workforce/${item.worker.id}` : undefined} subtitle={`No-show · ${rowContext(item.row)} · ${detail}`} />
        </ItemContent>
        <ItemActions>
          {badge}
          <RequestLink row={item.row} label="Open" />
        </ItemActions>
      </Item>
    )
  }

  const started = item.startsInMinutes <= 0
  return (
    <Item size="sm" asChild className="hover:bg-muted/40">
      <Link href={`/requests/${item.row.view.req.id}`}>
        <ItemMedia>
          <span className="flex size-8 items-center justify-center rounded-full bg-warning/18 text-warning-foreground dark:bg-warning/20 dark:text-warning">
            <CircleDashedIcon className="size-4" aria-hidden />
          </span>
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>
            {plural(item.open, "open shift")} · {item.row.view.position.title}
          </ItemTitle>
          <ItemDescription className="truncate text-xs">
            {item.row.view.venue.shortName} · {item.row.view.req.eventName ?? SERVICE_LABEL} ·{" "}
            {started ? `started ${durationLabel(-item.startsInMinutes)} ago` : `starts in ${durationLabel(item.startsInMinutes)}`}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <StatusBadge tone={started ? "danger" : "warning"}>{started ? "Short-staffed" : personaId === "supplier" ? "Fill now" : "Unfilled"}</StatusBadge>
        </ItemActions>
      </Link>
    </Item>
  )
}
