"use client"

import Link from "next/link"
import { format } from "date-fns"
import { PlusIcon, RadioIcon } from "lucide-react"

import { FillMeter } from "@/components/app/fill-meter"
import { VenueMark } from "@/components/app/identity"
import { KeyValue } from "@/components/app/misc"
import { RequestStatusBadge } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { hours, money, num, plural } from "@/lib/format"
import { draftQuery } from "@/lib/parse-request"
import type { ISODate, PersonaId, RequestStatus } from "@/lib/types"

import { compactTimeRange, dayLabel, type DayRequest, type EventBlock } from "./schedule-data"

function dayStatus(r: DayRequest, now: Date): RequestStatus {
  if (r.view.req.state === "draft") return "Draft"
  if (r.view.req.state === "pending") return "Pending approval"
  if (now >= r.end) return "Completed"
  if (now >= r.start) return "In progress"
  return r.fill.total > 0 && r.fill.filled >= r.fill.total ? "Filled" : "Open"
}

interface EventSheetProps {
  block: EventBlock | null
  open: boolean
  onOpenChange: (open: boolean) => void
  now: Date
  today: ISODate
  personaId: PersonaId
  onOpenDay: (date: ISODate) => void
}

export function EventSheet({ block, open, onOpenChange, ...rest }: EventSheetProps) {
  return (
    <Sheet open={open && !!block} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        {block ? <EventSheetBody block={block} onClose={() => onOpenChange(false)} {...rest} /> : null}
      </SheetContent>
    </Sheet>
  )
}

type BodyProps = Omit<EventSheetProps, "block" | "open" | "onOpenChange"> & { block: EventBlock; onClose: () => void }

function EventSheetBody({ block, now, today, personaId, onOpenDay, onClose }: BodyProps) {
  const active = block.requests.filter((r) => !r.tentative)
  const pending = block.requests.filter((r) => r.tentative)
  const headcount = block.requests.reduce((sum, r) => sum + r.fill.total, 0)
  const scheduledHours = block.requests.reduce((sum, r) => sum + r.hours, 0)
  const started = now >= block.start
  const canAdd = personaId !== "supplier" && block.date >= today && now < block.end
  const addHref = `/requests/new?draft=${draftQuery({
    venueId: block.venue.id,
    dates: [block.date],
    startTime: format(block.start, "HH:mm"),
    endTime: format(block.end, "HH:mm"),
    eventName: block.isService ? undefined : block.name,
  })}`

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <div className="flex items-start gap-3">
          <VenueMark venue={block.venue} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="text-pretty">{block.name}</SheetTitle>
            <SheetDescription>
              {block.venue.name} · {dayLabel(block.date, now)} · <span className="tabular">{compactTimeRange(block.start, block.end)}</span>
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <dl className="grid grid-cols-3 gap-4 border-b p-4">
          <KeyValue label="Staffed">
            {active.length ? (
              <FillMeter fill={block.fill} live={started} className="pt-1" />
            ) : (
              <span className="text-muted-foreground">Awaiting approval</span>
            )}
          </KeyValue>
          <KeyValue label={personaId === "supplier" ? "Est. billings" : "Est. labor"}>
            <span className="tabular">{money(block.cost + block.pendingCost)}</span>
          </KeyValue>
          <KeyValue label="Scheduled">
            <span className="tabular">{hours(scheduledHours)}</span>
          </KeyValue>
        </dl>

        <section className="flex flex-col gap-2 p-4" aria-label="Positions">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">Positions</h3>
            <span className="text-xs text-muted-foreground tabular">
              {plural(block.requests.length, "request")} · {plural(headcount, "Pro")}
            </span>
          </div>
          <ItemGroup className="gap-2">
            {block.requests.map((r) => {
              const { req, position } = r.view
              return (
                <div key={r.key} role="listitem">
                  <Item asChild variant="outline" size="sm" className={r.tentative ? "border-dashed" : undefined}>
                    <Link href={`/requests/${req.id}`} onClick={onClose}>
                      <ItemContent className="min-w-0">
                        <ItemTitle>{position.title}</ItemTitle>
                        <ItemDescription className="text-xs tabular">
                          {plural(r.fill.total, "Pro")} · {compactTimeRange(r.start, r.end)} · {req.id}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <RequestStatusBadge status={dayStatus(r, now)} />
                      </ItemActions>
                      <ItemFooter className="gap-3">
                        {r.tentative ? (
                          <span className="text-xs text-muted-foreground">Goes out to suppliers once approved</span>
                        ) : (
                          <FillMeter fill={r.fill} live={now >= r.start} className="flex-1" />
                        )}
                        <span className="shrink-0 text-xs text-muted-foreground tabular">{money(r.cost)}</span>
                      </ItemFooter>
                    </Link>
                  </Item>
                </div>
              )
            })}
          </ItemGroup>
          {pending.length > 0 && active.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {plural(pending.length, "request")} ({money(block.pendingCost)}) still awaiting approval and not counted as staffed.
            </p>
          ) : null}
          {block.fill.noShows > 0 ? (
            <p className="text-xs text-muted-foreground">
              {num(block.fill.noShows)} {block.fill.noShows === 1 ? "no-show" : "no-shows"} recorded for this event.
            </p>
          ) : null}
        </section>
      </div>

      {active.length > 0 || canAdd ? (
        <SheetFooter className="flex-row justify-end border-t">
          {active.length > 0 ? (
            <Button variant="outline" onClick={() => onOpenDay(block.date)}>
              <RadioIcon data-icon="inline-start" />
              {block.date === today ? "Watch live" : "Open day board"}
            </Button>
          ) : null}
          {canAdd ? (
            <Button asChild>
              <Link href={addHref} onClick={onClose}>
                <PlusIcon data-icon="inline-start" />
                Add a position
              </Link>
            </Button>
          ) : null}
        </SheetFooter>
      ) : null}
    </>
  )
}
