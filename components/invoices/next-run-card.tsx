"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRightIcon, CalendarClockIcon, ChevronDownIcon, ClockIcon, PlayIcon, ReceiptTextIcon } from "lucide-react"
import { toast } from "sonner"

import { SupplierMark, VenueMark } from "@/components/app/identity"
import { EmptyState } from "@/components/app/misc"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatDate } from "@/lib/dates"
import { hours, money, plural } from "@/lib/format"
import { getActions } from "@/lib/store"
import type { Persona } from "@/lib/types"
import { cn } from "@/lib/utils"

import type { AccrualTile } from "./invoice-utils"

const INITIAL_TILES = 6

interface NextRunCardProps {
  tiles: AccrualTile[]
  persona: Persona
  runAt: Date
  pendingTimesheets: number
  onRan: (count: number) => void
}

export function NextRunCard({ tiles, persona, runAt, pendingTimesheets, onRan }: NextRunCardProps) {
  const [showAll, setShowAll] = React.useState(false)
  const isSupplier = persona.id === "supplier"
  const valueOf = React.useCallback((t: AccrualTile) => (isSupplier ? t.estimatedNet : t.amount), [isSupplier])

  const { total, totalHours, max } = React.useMemo(() => {
    let total = 0
    let totalHours = 0
    let max = 0
    for (const t of tiles) {
      const v = valueOf(t)
      total += v
      totalHours += t.hours
      max = Math.max(max, v)
    }
    return { total, totalHours, max }
  }, [tiles, valueOf])

  const visible = showAll ? tiles : tiles.slice(0, INITIAL_TILES)

  function runCycle() {
    const count = getActions().runInvoiceCycle()
    if (count === 0) {
      toast("Nothing accruing right now", {
        description: "Every approved timesheet and tip batch is already on an invoice.",
      })
      return
    }
    toast.success(`${plural(count, "invoice")} issued`, {
      description: "Consolidated from approved timesheets and tips, every line traces to a shift and an approver.",
    })
    onRan(count)
  }

  return (
    <Card id="next-run">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClockIcon className="size-4 text-muted-foreground" aria-hidden />
          Next invoice run
        </CardTitle>
        <CardDescription>
          {formatDate(runAt, "EEEE, MMM d")} at 6:00 AM · approved hours and tips not yet invoiced, consolidated into one
          invoice per supplier and venue.
        </CardDescription>
        {persona.id === "program" ? (
          <CardAction>
            <Button size="sm" onClick={runCycle}>
              <PlayIcon data-icon="inline-start" />
              Run invoice cycle now
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {tiles.length === 0 ? (
          <EmptyState
            icon={ReceiptTextIcon}
            title="Nothing accruing yet"
            description={
              pendingTimesheets > 0
                ? `Approved hours and tips queue here for ${formatDate(runAt, "EEEE")}'s run. ${plural(pendingTimesheets, "timesheet")} in your scope ${pendingTimesheets === 1 ? "is" : "are"} still awaiting approval.`
                : `Approved hours and tips queue here for ${formatDate(runAt, "EEEE")}'s run.`
            }
            action={
              pendingTimesheets > 0 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/timesheets">
                    Review timesheets
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
              ) : undefined
            }
            className="gap-3 p-5"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-heading text-2xl font-semibold tracking-tight tabular">{money(total)}</span>
              <span className="text-sm text-muted-foreground">
                {isSupplier ? "estimated net to you" : "accruing"} · {hours(totalHours)} approved ·{" "}
                {plural(tiles.length, "invoice")} on {formatDate(runAt, "EEEE")}
              </span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((tile) => (
                <AccrualTileItem key={`${tile.supplierId}|${tile.venueId}`} tile={tile} isSupplier={isSupplier} value={valueOf(tile)} max={max} />
              ))}
            </ul>
            {tiles.length > INITIAL_TILES ? (
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${tiles.length}`}
                <ChevronDownIcon data-icon="inline-end" className={cn("transition-transform", showAll && "rotate-180")} />
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
      {tiles.length > 0 ? (
        <CardFooter className="gap-2 text-xs text-muted-foreground">
          <ClockIcon className="size-3.5 shrink-0" aria-hidden />
          {pendingTimesheets > 0 ? (
            <span>
              {plural(pendingTimesheets, "timesheet")} still awaiting approval will join the run once approved.{" "}
              <Link href="/timesheets" className="font-medium text-foreground underline-offset-4 hover:underline">
                Review timesheets
              </Link>
            </span>
          ) : (
            <span>Every worked shift in your scope is approved, nothing is holding up this run.</span>
          )}
        </CardFooter>
      ) : null}
    </Card>
  )
}

function AccrualTileItem({ tile, isSupplier, value, max }: { tile: AccrualTile; isSupplier: boolean; value: number; max: number }) {
  const title = isSupplier ? (tile.venue?.name ?? "Unknown venue") : (tile.supplier?.shortName ?? "Unknown supplier")
  const subtitle = isSupplier ? (tile.venue ? `${tile.venue.city}, ${tile.venue.state}` : "") : (tile.venue?.name ?? "")
  return (
    <li className="flex flex-col gap-2.5 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2.5">
        {isSupplier ? <VenueMark venue={tile.venue} size="sm" /> : <SupplierMark supplier={tile.supplier} size="sm" />}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{title}</span>
          <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
        </div>
        <span className="ml-auto text-sm font-semibold tabular">{money(value)}</span>
      </div>
      <Progress value={max > 0 ? (value / max) * 100 : 0} aria-label={`${title} share of accruing amount`} />
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular">
        <span>{hours(tile.hours)}</span>
        <span>{plural(tile.entries.length, "timesheet")}</span>
        {tile.tips > 0 ? <span>{money(tile.tips)} tips</span> : null}
      </div>
    </li>
  )
}
