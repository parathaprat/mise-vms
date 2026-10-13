"use client"

import * as React from "react"
import { addDays } from "date-fns"
import { LockIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"

import { TimeAgo } from "@/components/app/misc"
import { PageHeader } from "@/components/app/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Kbd } from "@/components/ui/kbd"
import { useData, useNow, usePersona, usePolicies } from "@/hooks/use-demo"
import { parseLocal, toLocal } from "@/lib/dates"
import { plural } from "@/lib/format"
import { PERSONAS, PROGRAM_NAME } from "@/lib/reference"
import { estimateRequestCost } from "@/lib/rules"
import { venueInScope } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { Policies } from "@/lib/types"
import { cn } from "@/lib/utils"

import { IconTile, RestrictedState } from "../shared"
import { changedKeys, draftErrors, draftFrom, draftPatch, type BooleanKey, type Draft, type NumericKey } from "./policy-config"
import { PolicyHistory } from "./policy-history"
import { POLICY_SECTIONS, PolicySections, type PolicyStats } from "./policy-sections"

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

export function PoliciesPage() {
  const persona = usePersona()
  if (persona.id === "supplier") {
    return (
      <>
        <PageHeader title="Policies" />
        <RestrictedState
          title={`Policies are managed by the ${PROGRAM_NAME} program office`}
          description="The rules that affect you, the Tier 1 window, timesheet auto-approval and the program fee, are spelled out on every request and invoice."
          href="/requests"
          cta="View requests"
        />
      </>
    )
  }
  return <PoliciesView key={persona.id} />
}

function PoliciesView() {
  const persona = usePersona()
  const canEdit = persona.id === "program"
  const saved = usePolicies()
  const updatePolicies = useStore((s) => s.updatePolicies)
  const requests = useData((d) => d.requests)
  const timeEntries = useData((d) => d.timeEntries)
  const workers = useData((d) => d.workers)
  const tipBatches = useData((d) => d.tipBatches)
  const changeRequests = useData((d) => d.changeRequests)
  const costCenters = useData((d) => d.costCenters)
  const activities = useData((d) => d.activities)
  const now = useNow()

  const [edits, setEdits] = React.useState<Partial<Draft>>({})
  const draft = React.useMemo(() => ({ ...draftFrom(saved), ...edits }) as Draft, [saved, edits])
  const errors = React.useMemo(() => draftErrors(draft), [draft])
  const dirty = React.useMemo(() => changedKeys(draft, saved), [draft, saved])
  const errorCount = Object.keys(errors).length

  const stats = React.useMemo<PolicyStats>(() => {
    const since = toLocal(addDays(now, -30))
    const inScope = (venueId?: string) => !venueId || venueInScope(venueId, persona)
    const requestVenue = new Map(requests.map((r) => [r.id, r.venueId]))
    const activeCostCenters = costCenters.filter((c) => c.active && inScope(c.venueId))
    return {
      requestCosts: requests.filter((r) => r.state !== "draft" && r.createdAt >= since && inScope(r.venueId)).map((r) => estimateRequestCost(r)),
      pendingCleanClockOuts: timeEntries
        .filter((e) => e.status === "Pending" && e.anomalies.length === 0 && !e.dispute && !!e.clockOut && inScope(requestVenue.get(e.requestId)))
        .map((e) => parseLocal(e.clockOut ?? "").getTime()),
      nowMs: now.getTime(),
      workerHours: workers.filter((w) => w.status === "Active").map((w) => w.compassHours),
      pendingTips: tipBatches.filter((b) => b.status === "Pending approval" && inScope(b.venueId)).length,
      pendingRateRevisions: changeRequests.filter((c) => c.type === "Rate revision" && c.status === "Pending").length,
      favoritesFirstCostCenters: activeCostCenters.filter((c) => c.favoritesFirst).length,
      activeCostCenters: activeCostCenters.length,
    }
  }, [now, persona, requests, timeEntries, workers, tipBatches, changeRequests, costCenters])

  const history = React.useMemo(
    () =>
      activities
        .filter((a) => a.kind === "policy" && (!a.venueId || venueInScope(a.venueId, persona)))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [activities, persona]
  )
  const latest = history[0]

  const onNumberChange = React.useCallback((key: NumericKey, value: string) => setEdits((e) => ({ ...e, [key]: value })), [])
  const onToggle = React.useCallback((key: BooleanKey, value: boolean) => setEdits((e) => ({ ...e, [key]: value })), [])
  const discard = () => setEdits({})

  const save = React.useCallback(() => {
    if (!canEdit || dirty.length === 0) return
    if (errorCount > 0) {
      toast.error(`Fix ${plural(errorCount, "field")} before saving`)
      return
    }
    const patch = draftPatch(draft, saved)
    const keys = Object.keys(patch) as (keyof Policies)[]
    setEdits({})
    if (keys.length === 0) return
    updatePolicies(patch)
    const sections = POLICY_SECTIONS.filter((s) => s.keys.some((k) => keys.includes(k))).map((s) => s.title)
    toast.success(`Policies updated · ${plural(keys.length, "change")}`, {
      description: `${listJoin(sections)}. In effect now and logged to the change history.`,
    })
  }, [canEdit, dirty.length, errorCount, draft, saved, updatePolicies])

  React.useEffect(() => {
    if (!canEdit) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [canEdit, save])

  React.useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" })
  }, [])

  const program = PERSONAS.program

  return (
    <>
      <PageHeader
        title="Policies"
        actions={
          latest ? (
            <p className="text-xs text-muted-foreground">
              Last change <TimeAgo value={latest.at} /> · {latest.actor}
            </p>
          ) : null
        }
      />

      {!canEdit ? (
        <Alert>
          <LockIcon aria-hidden />
          <AlertTitle>Policies are managed by the {PROGRAM_NAME} program office.</AlertTitle>
          <AlertDescription>
            These are the rules Mise enforces at your venues. To propose a change, email{" "}
            <a href={`mailto:${program.email}?subject=${encodeURIComponent(`${PROGRAM_NAME} policy change`)}`}>{program.name}</a>, {program.title}.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PolicySections
            draft={draft}
            saved={saved}
            errors={errors}
            disabled={!canEdit}
            stats={stats}
            onNumberChange={onNumberChange}
            onToggle={onToggle}
          />
          {canEdit ? <SaveBar count={dirty.length} errorCount={errorCount} onDiscard={discard} onSave={save} /> : null}
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-28 xl:max-h-[calc(100svh-8.5rem)] xl:overflow-y-auto">
          <Card size="sm" className="hidden xl:flex">
            <CardHeader>
              <CardTitle>On this page</CardTitle>
            </CardHeader>
            <CardContent>
              <nav aria-label="Policy sections">
                <ul className="flex flex-col">
                  {POLICY_SECTIONS.map((s) => {
                    const edited = s.keys.some((k) => dirty.includes(k))
                    return (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          className="flex items-center gap-2.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <IconTile icon={s.icon} size="sm" className="size-6 bg-muted text-foreground/70 dark:bg-muted" />
                          <span className="min-w-0 flex-1 truncate">{s.title}</span>
                          {edited ? (
                            <span className="size-1.5 shrink-0 rounded-full bg-primary">
                              <span className="sr-only">Edited</span>
                            </span>
                          ) : null}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </nav>
            </CardContent>
          </Card>
          <PolicyHistory activities={history} />
        </aside>
      </div>
    </>
  )
}

function SaveBar({ count, errorCount, onDiscard, onSave }: { count: number; errorCount: number; onDiscard: () => void; onSave: () => void }) {
  return (
    <AnimatePresence>
      {count > 0 ? (
        <motion.div
          key="save-bar"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="sticky bottom-4 z-20"
          role="region"
          aria-label="Unsaved policy changes"
        >
          <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-popover/95 px-4 py-2.5 text-popover-foreground shadow-lg backdrop-blur supports-backdrop-filter:bg-popover/80">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-50" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <p className="text-sm font-medium tabular" aria-live="polite">
              {plural(count, "unsaved change")}
            </p>
            <p className={cn("text-xs", errorCount ? "text-destructive" : "text-muted-foreground")}>
              {errorCount ? `Fix ${plural(errorCount, "field")} to save` : "Takes effect the moment you save"}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onDiscard}>
                Discard
              </Button>
              <Button size="sm" onClick={onSave} disabled={errorCount > 0}>
                Save changes
                <Kbd className="hidden bg-primary-foreground/15 text-primary-foreground sm:inline-flex">⌘S</Kbd>
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
