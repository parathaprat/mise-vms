"use client"

import { InfoIcon, TimerResetIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { NumberTicker } from "@/components/ui/number-ticker"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EmptyState } from "@/components/app/misc"
import { formatDate } from "@/lib/dates"
import { num } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { OpsSaved } from "./compute"

function formatHours(value: number): string {
  if (value <= 0) return "0h"
  if (value < 1) return `${Math.max(1, Math.round(value * 60))}m`
  return `${value < 10 ? (Math.round(value * 10) / 10).toString() : num(Math.round(value))}h`
}

export function OpsSavedCard({ ops, className }: { ops: OpsSaved; className?: string }) {
  const total = ops.totalHours
  const rounded = Math.round(total)
  const workdays = total / 8
  const max = ops.items.reduce((m, item) => Math.max(m, item.hours), 0)

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle>Manual work avoided</CardTitle>
        <CardDescription>Since {formatDate(ops.since, "MMM d")}, from live counts in this scope.</CardDescription>
        <CardAction>
          <Badge variant="outline">Estimate</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        {total <= 0 ? (
          <EmptyState
            icon={TimerResetIcon}
            title="Nothing to count yet"
            description="Savings build up as shifts are filled, timesheets approved and invoices paid in Mise."
            className="flex-1 border-border bg-muted/30"
          />
        ) : (
          <>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-1.5">
                <span className="font-heading text-3xl font-semibold tracking-tight tabular">
                  {rounded > 0 ? (
                    <>
                      ≈ <NumberTicker value={rounded} />
                    </>
                  ) : (
                    "< 1"
                  )}
                </span>
                <span className="text-sm text-muted-foreground">{rounded === 1 ? "hour" : "hours"}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {workdays >= 1
                  ? `About ${workdays < 10 ? (Math.round(workdays * 10) / 10).toString() : num(Math.round(workdays))} eight-hour workdays of manual handling`
                  : "Less than one workday of manual handling so far"}
              </p>
            </div>
            <ul className="flex flex-col gap-3.5">
              {ops.items.map((item) => (
                <li key={item.key} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{item.label}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex shrink-0 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                            aria-label={`How "${item.label}" is counted`}
                          >
                            <InfoIcon className="size-3.5" aria-hidden />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64">{item.detail}</TooltipContent>
                      </Tooltip>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular">{formatHours(item.hours)}</span>
                  </div>
                  <Progress value={max > 0 ? (item.hours / max) * 100 : 0} aria-label={`${item.label} share`} />
                  <span className="text-xs text-muted-foreground tabular">
                    {num(item.count)} × {item.minutesEach} min
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Minutes per item are planning assumptions for the manual step, not measured time. Counts update live.
      </CardFooter>
    </Card>
  )
}
