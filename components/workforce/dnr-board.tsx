"use client"

import * as React from "react"
import { BanIcon, PlusIcon, QuoteIcon, SearchXIcon, ShieldCheckIcon } from "lucide-react"

import { VenueMark, WorkerCell } from "@/components/app/identity"
import { EmptyState } from "@/components/app/misc"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/dates"
import { plural } from "@/lib/format"
import type { Venue } from "@/lib/types"

import { UnblockButton } from "./block-dialog"
import type { BlockEntry, ProRow, WorkforceModel } from "./use-workforce"

interface DnrBoardProps {
  model: WorkforceModel
  rows: ProRow[]
  filtered: boolean
  onAdd: (venueId?: string) => void
  onClearFilters: () => void
}

interface DnrItem {
  row: ProRow
  entry: BlockEntry
}

export function DnrBoard({ model, rows, filtered, onAdd, onClearFilters }: DnrBoardProps) {
  const { scopeVenues, canManage, persona } = model
  const byVenue = React.useMemo(() => {
    const map = new Map<string, DnrItem[]>()
    for (const row of rows) {
      for (const entry of row.blocks) {
        const list = map.get(entry.venueId)
        if (list) list.push({ row, entry })
        else map.set(entry.venueId, [{ row, entry }])
      }
    }
    for (const list of map.values()) list.sort((a, b) => b.entry.at.localeCompare(a.entry.at))
    return map
  }, [rows])

  const venues = persona.id === "venue" ? scopeVenues : scopeVenues.filter((v) => byVenue.has(v.id))

  if (venues.length === 0) {
    if (filtered) {
      return (
        <EmptyState
          icon={SearchXIcon}
          title="No blocked Pros match these filters"
          action={
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          }
        />
      )
    }
    return (
      <EmptyState
        icon={ShieldCheckIcon}
        title={persona.id === "supplier" ? "None of your Pros are blocked" : "No do-not-return entries"}
        description={
          persona.id === "supplier"
            ? "When a venue blocks one of your Pros, you'll see the reason here and Mise stops them from being offered there."
            : "Venues can block a Pro from returning. Mise enforces it on every request automatically."
        }
        action={
          canManage ? (
            <Button variant="outline" size="sm" onClick={() => onAdd()}>
              <BanIcon data-icon="inline-start" />
              Add to do-not-return
            </Button>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-sm text-muted-foreground text-pretty">
          {persona.id === "supplier"
            ? "Venues that have asked not to see these Pros again. Mise won't let them be offered for shifts at those venues."
            : "Blocks are enforced on every request: suppliers can't offer these Pros, and any upcoming bookings at the venue reopen for refill automatically."}
        </p>
        {canManage ? (
          <Button variant="outline" className="shrink-0 self-start sm:self-auto" onClick={() => onAdd()}>
            <BanIcon data-icon="inline-start" />
            Add to do-not-return
          </Button>
        ) : null}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {venues.map((venue) => (
          <VenueDnrCard
            key={venue.id}
            venue={venue}
            items={byVenue.get(venue.id) ?? []}
            canManage={canManage}
            supplierView={persona.id === "supplier"}
            filtered={filtered}
            onAdd={() => onAdd(venue.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface VenueDnrCardProps {
  venue: Venue
  items: DnrItem[]
  canManage: boolean
  supplierView: boolean
  filtered: boolean
  onAdd: () => void
}

function VenueDnrCard({ venue, items, canManage, supplierView, filtered, onAdd }: VenueDnrCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <VenueMark venue={venue} size="sm" />
          <span className="truncate">{venue.name}</span>
        </CardTitle>
        <CardDescription>
          {items.length
            ? `${plural(items.length, supplierView ? "of your Pros" : "Pro", supplierView ? "of your Pros" : "Pros")} on the list`
            : "No one on the list"}
        </CardDescription>
        {canManage ? (
          <CardAction>
            <Button variant="outline" size="sm" onClick={onAdd}>
              <PlusIcon data-icon="inline-start" />
              Add
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            {filtered ? "No blocked Pros match your filters here." : "Everyone in this market is eligible to work here."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {items.map(({ row, entry }) => (
              <li key={row.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <WorkerCell
                    worker={row.worker}
                    href={`/workforce/${row.id}`}
                    subtitle={`${row.supplier?.shortName ?? "Supplier"} · ${row.positions[0]?.title ?? "Pro"}`}
                  />
                  {canManage ? <UnblockButton worker={row.worker} venue={venue} /> : null}
                </div>
                <blockquote className="flex gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm text-pretty">
                  <QuoteIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{entry.reason}</span>
                </blockquote>
                <span className="text-xs text-muted-foreground">
                  Added by {entry.by} · {formatDate(entry.at.slice(0, 10), "MMM d, yyyy")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
