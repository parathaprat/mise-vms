"use client"

import Link from "next/link"
import * as React from "react"
import { addMinutes } from "date-fns"
import { AnimatePresence, motion } from "motion/react"
import {
  EllipsisIcon,
  RefreshCwIcon,
  StarIcon,
  UserPlusIcon,
  UserRoundIcon,
} from "lucide-react"
import { toast } from "sonner"

import { WorkerCell } from "@/components/app/identity"
import { EmptyState } from "@/components/app/misc"
import { ShiftStatusBadge, StatusBadge } from "@/components/app/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useData, useLookups, useNow, usePersona } from "@/hooks/use-demo"
import {
  formatClock,
  formatDate,
  minutesBetween,
  parseLocal,
  shiftWindow,
  toISODate,
} from "@/lib/dates"
import { workerName } from "@/lib/format"
import { workOrderId, type RequestView } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { Shift } from "@/lib/types"
import { cn } from "@/lib/utils"

import { AssignProDialog, ReleaseProDialog } from "./request-dialogs"

const STATUS_ORDER: Record<Shift["status"], number> = {
  "Checked in": 0,
  Confirmed: 1,
  Completed: 2,
  "No-show": 3,
  Open: 4,
  Cancelled: 5,
}

export function RequestRoster({ view }: { view: RequestView }) {
  const persona = usePersona()
  const now = useNow()
  const lookups = useLookups()
  const rosters = useData((d) => d.rosters)
  const toggleFavorite = useStore((s) => s.toggleFavorite)
  const shifts = React.useMemo(
    () => lookups.shiftsByRequest.get(view.req.id) ?? [],
    [lookups, view.req.id]
  )
  const dates = React.useMemo(
    () => [...view.req.dates].sort(),
    [view.req.dates]
  )
  const today = toISODate(now)
  const defaultDate = dates.find((d) => d >= today) ?? dates[dates.length - 1]
  const [date, setDate] = React.useState(defaultDate)
  const [assignShift, setAssignShift] = React.useState<Shift | null>(null)
  const [releaseShift, setReleaseShift] = React.useState<Shift | null>(null)
  const favorites = new Set(
    rosters.find((r) => r.venueId === view.venue.id)?.favorites ?? []
  )
  const activeDate = dates.includes(date) ? date : defaultDate

  const dayShifts = React.useMemo(
    () =>
      shifts
        .filter((s) => s.date === activeDate && s.status !== "Cancelled")
        .sort(
          (a, b) =>
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.slot - b.slot
        ),
    [shifts, activeDate]
  )
  const cancelled = shifts.filter(
    (s) => s.date === activeDate && s.status === "Cancelled"
  ).length
  const { start, end } = shiftWindow(
    activeDate,
    view.req.startTime,
    view.req.endTime
  )
  const isPast = now >= end
  const canBook = view.req.state === "active" && !isPast
  const canManage = persona.id !== "supplier" && view.req.state === "active"
  const backfillOf = new Map(
    shifts.filter((s) => s.backfillFor).map((s) => [s.backfillFor!, s])
  )

  if (view.req.state === "draft" || view.req.state === "pending") {
    return (
      <EmptyState
        icon={UserRoundIcon}
        title={
          view.req.state === "draft"
            ? "Not distributed yet"
            : "Waiting for program approval"
        }
        description={
          view.req.state === "draft"
            ? "Submit the draft and Mise starts offering these shifts to qualified Pros immediately."
            : "Distribution starts the moment the program office approves. Suppliers can't see this request yet."
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {dates.length > 1 ? (
        <div className="-mx-1 overflow-x-auto px-1">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={activeDate}
            onValueChange={(v) => v && setDate(v)}
            className="w-max"
          >
            {dates.map((d) => (
              <ToggleGroupItem key={d} value={d} className="px-3">
                {formatDate(d, "EEE MMM d")}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}
      {cancelled ? (
        <p className="text-xs text-muted-foreground">
          {cancelled} cancelled {cancelled === 1 ? "slot" : "slots"} hidden.
        </p>
      ) : null}
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        <AnimatePresence initial={false}>
          {dayShifts.map((s) => {
            const worker = s.workerId
              ? lookups.workers.get(s.workerId)
              : undefined
            const supplier = worker
              ? lookups.suppliers.get(worker.supplierId)
              : undefined
            const late =
              s.status === "Confirmed" && now > addMinutes(start, 15) && !isPast
            const backfill =
              s.status === "No-show" ? backfillOf.get(s.id) : undefined
            const backfillWorker = backfill?.workerId
              ? lookups.workers.get(backfill.workerId)
              : undefined
            if (!worker) {
              return (
                <motion.li
                  key={`${s.id}:open`}
                  layout
                  className="flex items-center gap-3 bg-muted/20 px-4 py-3"
                >
                  <span className="w-8 shrink-0 text-xs text-muted-foreground tabular">
                    #{s.slot}
                  </span>
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
                    {view.req.liveFill ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <UserRoundIcon className="size-3.5" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">
                      {isPast ? "Unfilled" : "Open"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {isPast
                        ? "No Pro was confirmed for this slot, nothing is billed."
                        : view.req.liveFill
                          ? "Offering to qualified Pros now…"
                          : view.req.favoritesFirst
                            ? "Offered to favorites first, then all qualified Pros"
                            : "Open to qualified Pros from every supplier on this request"}
                    </span>
                  </div>
                  {canBook ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAssignShift(s)}
                    >
                      <UserPlusIcon data-icon="inline-start" />
                      {persona.id === "supplier" ? "Assign" : "Book a Pro"}
                    </Button>
                  ) : null}
                </motion.li>
              )
            }
            return (
              <motion.li
                key={`${s.id}:${s.workerId}`}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className={cn(
                  "relative flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3",
                  s.status === "No-show" && "bg-destructive/[0.03]"
                )}
              >
                {s.assignedAt &&
                parseLocal(s.assignedAt).getTime() >= now.getTime() - 75_000 ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 animate-fade-out bg-brand/35"
                  />
                ) : null}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="w-8 shrink-0 text-xs text-muted-foreground tabular">
                    #{s.slot}
                  </span>
                  <WorkerCell
                    worker={worker}
                    href={`/workforce/${worker.id}`}
                    favorite={favorites.has(worker.id)}
                    subtitle={`${supplier?.shortName ?? ""} · ★ ${worker.rating.toFixed(2)} · ${Math.round(worker.reliability * 100)}% reliable`}
                    className="min-w-0"
                  />
                  {s.backfillFor ? (
                    <Badge variant="outline">Backfill</Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-11 sm:pl-0">
                  <span className="hidden font-mono text-[11px] text-muted-foreground md:inline">
                    {workOrderId(view.req.id, worker.id)}
                  </span>
                  {late ? (
                    <StatusBadge tone="warning" pulse>
                      Late ·{" "}
                      {Math.max(
                        0,
                        Math.round((now.getTime() - start.getTime()) / 60000)
                      )}
                      m
                    </StatusBadge>
                  ) : (
                    <ShiftStatusBadge status={s.status} />
                  )}
                  <span className="w-36 text-xs text-muted-foreground tabular">
                    {s.status === "Checked in" && s.checkInAt
                      ? `In at ${formatClock(s.checkInAt)}${minutesBetween(`${s.date}T${view.req.startTime}`, s.checkInAt) > 15 ? " · late" : ""}`
                      : s.status === "Completed"
                        ? `${formatClock(s.checkInAt)} – ${s.checkOutAt ? formatClock(s.checkOutAt) : "no clock-out"}`
                        : s.status === "No-show"
                          ? backfillWorker
                            ? `Backfilled by ${workerName(backfillWorker)}`
                            : "Not backfilled"
                          : s.assignedAt
                            ? `Confirmed ${formatDate(s.assignedAt.slice(0, 10), "MMM d")}`
                            : "Confirmed"}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${workerName(worker)}`}
                      >
                        <EllipsisIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem asChild>
                          <Link href={`/workforce/${worker.id}`}>
                            <UserRoundIcon />
                            View profile
                          </Link>
                        </DropdownMenuItem>
                        {persona.id === "venue" ? (
                          <DropdownMenuItem
                            onSelect={() => {
                              toggleFavorite(view.venue.id, worker.id)
                              toast.success(
                                favorites.has(worker.id)
                                  ? "Removed from favorites"
                                  : `${workerName(worker)} added to favorites`
                              )
                            }}
                          >
                            <StarIcon />
                            {favorites.has(worker.id)
                              ? "Remove favorite"
                              : "Add to favorites"}
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuGroup>
                      {canManage && s.status === "Confirmed" && now < start ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              onSelect={() => setReleaseShift(s)}
                            >
                              <RefreshCwIcon />
                              Release & refill
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      <AssignProDialog
        view={view}
        shift={assignShift}
        open={!!assignShift}
        onOpenChange={(o) => !o && setAssignShift(null)}
      />
      <ReleaseProDialog
        view={view}
        shift={releaseShift}
        open={!!releaseShift}
        onOpenChange={(o) => !o && setReleaseShift(null)}
      />
    </div>
  )
}
