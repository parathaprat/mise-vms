"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { ArrowRightIcon, CalendarPlusIcon, SearchXIcon, StarIcon } from "lucide-react"

import { VenueMark, WorkerCell } from "@/components/app/identity"
import { EmptyState } from "@/components/app/misc"
import { StatusBadge } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { parseLocal, relativeDay } from "@/lib/dates"

import { FavoriteControl } from "./favorite-control"
import { eligibleVenuesFor, FLAG_TONE, lastWorkedLabel, type ProRow, type WorkforceModel } from "./use-workforce"

interface FavoritesGridProps {
  model: WorkforceModel
  rows: ProRow[]
  filtered: boolean
  onClearFilters: () => void
}

export function FavoritesGrid({ model, rows, filtered, onClearFilters }: FavoritesGridProps) {
  const isSupplier = model.persona.id === "supplier"
  if (rows.length === 0) {
    if (filtered) {
      return (
        <EmptyState
          icon={SearchXIcon}
          title="No favorites match these filters"
          description="Clear the filters to see every starred Pro."
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
        icon={StarIcon}
        title={isSupplier ? "No venue favorites yet" : "No favorites yet"}
        description={
          isSupplier
            ? "When venues star your Pros, they show up here. Favorites get first look at new shifts."
            : "Star Pros from the directory or their profile. Favorites get first look at every new shift you post."
        }
      />
    )
  }

  const sorted = [...rows].sort(
    (a, b) => b.upcoming - a.upcoming || (b.lastWorked ?? "").localeCompare(a.lastWorked ?? "") || a.name.localeCompare(b.name)
  )

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map((row, index) => (
        <motion.div
          key={row.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: Math.min(index, 12) * 0.025 }}
        >
          <FavoriteCard row={row} model={model} />
        </motion.div>
      ))}
    </div>
  )
}

function FavoriteCard({ row, model }: { row: ProRow; model: WorkforceModel }) {
  const { canManage, persona, today, venuesById, scopeVenues } = model
  const eligible = eligibleVenuesFor(row.worker, scopeVenues)
  const blockedIds = row.blocks.map((b) => b.venueId)
  const topFlag = row.flags[0]
  const now = parseLocal(today)
  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <WorkerCell
          worker={row.worker}
          href={`/workforce/${row.id}`}
          subtitle={`${row.supplier?.shortName ?? "Supplier"} · ${row.positions[0]?.title ?? "Pro"}`}
        />
        {canManage ? (
          <CardAction>
            <FavoriteControl
              worker={row.worker}
              venues={eligible}
              favoriteVenueIds={row.favoriteVenueIds}
              blockedVenueIds={blockedIds}
              variant="icon"
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2.5 text-center">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-muted-foreground">Rating</dt>
            <dd className="text-sm font-medium tabular">{row.worker.rating.toFixed(2)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-muted-foreground">Reliability</dt>
            <dd className="text-sm font-medium tabular">{Math.round(row.worker.reliability * 100)}%</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-muted-foreground">{persona.id === "venue" ? "Shifts here" : "Recent shifts"}</dt>
            <dd className="text-sm font-medium tabular">{row.shiftsHere}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-1.5">
          {row.favoriteVenueIds.map((venueId) => {
            const venue = venuesById.get(venueId)
            return (
              <span key={venueId} className="inline-flex items-center gap-1.5 rounded-md border bg-background py-0.5 pr-2 pl-0.5 text-xs">
                <VenueMark venue={venue} size="xs" />
                {venue?.shortName ?? "Venue"}
              </span>
            )
          })}
          {topFlag ? <StatusBadge tone={FLAG_TONE[topFlag.kind]}>{topFlag.label}</StatusBadge> : null}
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {row.nextShift
            ? `Next shift · ${relativeDay(row.nextShift, now)}`
            : row.lastWorked
              ? `Last worked · ${lastWorkedLabel(row.lastWorked, today)}`
              : "No recent shifts"}
        </span>
        {canManage ? (
          row.worker.status === "Active" ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/requests/new?worker=${row.id}`}>
                <CalendarPlusIcon data-icon="inline-start" />
                Request
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              {row.worker.status}
            </Button>
          )
        ) : (
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/workforce/${row.id}`}>
              Profile
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
