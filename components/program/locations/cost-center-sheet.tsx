"use client"

import * as React from "react"
import { CarIcon, LockIcon, MapPinIcon, ShirtIcon, SmartphoneIcon, StarIcon } from "lucide-react"
import { toast } from "sonner"

import { VenueMark } from "@/components/app/identity"
import { LiveDot } from "@/components/app/misc"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useData, usePersona } from "@/hooks/use-demo"
import { formatDate, formatTimeRange } from "@/lib/dates"
import { money, plural } from "@/lib/format"
import { PROGRAM_NAME } from "@/lib/reference"
import { useStore } from "@/lib/store"
import type { CostCenter, ParkingKind, Venue } from "@/lib/types"
import { cn } from "@/lib/utils"

import { costCenterEditable, firstDateOf, type CostCenterSpend } from "../program-data"
import { BudgetBar, focusPanelOnOpen, useToday } from "../shared"

const PARKING_OPTIONS: { value: ParkingKind; label: string; briefing: string }[] = [
  { value: "Free", label: "Free staff parking", briefing: "Free staff parking" },
  { value: "Validated", label: "Validated parking", briefing: "Validated parking" },
  { value: "Paid", label: "Paid parking", briefing: "Paid parking" },
  { value: "None", label: "No parking on site", briefing: "No parking on site" },
]

const FIELD_LABELS: Record<keyof Draft, string> = {
  name: "name",
  glCode: "GL code",
  weeklyBudget: "weekly budget",
  approverName: "approver",
  checkIn: "check-in",
  parking: "parking",
  parkingNotes: "parking notes",
  attire: "attire",
  favoritesFirst: "favorites-first",
  active: "status",
}

interface Draft {
  name: string
  glCode: string
  weeklyBudget: string
  approverName: string
  checkIn: string
  parking: ParkingKind
  parkingNotes: string
  attire: string
  favoritesFirst: boolean
  active: boolean
}

type Patch = Partial<Omit<CostCenter, "id" | "venueId">>

function draftFrom(cc: CostCenter): Draft {
  return {
    name: cc.name,
    glCode: cc.glCode,
    weeklyBudget: cc.weeklyBudget.toLocaleString("en-US"),
    approverName: cc.approverName,
    checkIn: cc.checkIn,
    parking: cc.parking,
    parkingNotes: cc.parkingNotes,
    attire: cc.attire,
    favoritesFirst: cc.favoritesFirst,
    active: cc.active,
  }
}

function parseBudget(value: string): number {
  const n = Number.parseFloat(value.replace(/[$,\s]/g, ""))
  return Number.isFinite(n) ? Math.round(n) : Number.NaN
}

function buildPatch(cc: CostCenter, d: Draft): Patch {
  const patch: Patch = {}
  if (d.name.trim() !== cc.name) patch.name = d.name.trim()
  if (d.glCode.trim() !== cc.glCode) patch.glCode = d.glCode.trim()
  const budget = parseBudget(d.weeklyBudget)
  if (Number.isFinite(budget) && budget !== cc.weeklyBudget) patch.weeklyBudget = budget
  if (d.approverName.trim() !== cc.approverName) patch.approverName = d.approverName.trim()
  if (d.checkIn.trim() !== cc.checkIn) patch.checkIn = d.checkIn.trim()
  if (d.parking !== cc.parking) patch.parking = d.parking
  if (d.parkingNotes.trim() !== cc.parkingNotes) patch.parkingNotes = d.parkingNotes.trim()
  if (d.attire.trim() !== cc.attire) patch.attire = d.attire.trim()
  if (d.favoritesFirst !== cc.favoritesFirst) patch.favoritesFirst = d.favoritesFirst
  if (d.active !== cc.active) patch.active = d.active
  return patch
}

function listLabels(keys: string[]): string {
  const labels = keys.map((k) => FIELD_LABELS[k as keyof Draft] ?? k)
  if (labels.length <= 1) return labels[0] ?? ""
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
}

interface CostCenterSheetProps {
  costCenter?: CostCenter
  open: boolean
  onOpenChange: (open: boolean) => void
  spend?: CostCenterSpend
  weekLabel: string
}

export function CostCenterSheet({ costCenter, open, onOpenChange, spend, weekLabel }: CostCenterSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        onOpenAutoFocus={focusPanelOnOpen}
        className="gap-0 outline-none data-[side=right]:w-full data-[side=right]:sm:max-w-xl data-[side=right]:xl:max-w-4xl"
      >
        {costCenter ? (
          <CostCenterForm
            key={costCenter.id}
            costCenter={costCenter}
            spend={spend}
            weekLabel={weekLabel}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <SheetHeader>
            <SheetTitle>Cost center unavailable</SheetTitle>
            <SheetDescription>It may have been removed, or it belongs to a venue outside your scope.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}

function CostCenterForm({
  costCenter: cc,
  spend,
  weekLabel,
  onDone,
}: {
  costCenter: CostCenter
  spend?: CostCenterSpend
  weekLabel: string
  onDone: () => void
}) {
  const persona = usePersona()
  const venue = useData((d) => d.venues.find((v) => v.id === cc.venueId))
  const requests = useData((d) => d.requests)
  const positions = useData((d) => d.positions)
  const updateCostCenter = useStore((s) => s.updateCostCenter)
  const today = useToday()

  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(cc))
  const [submitted, setSubmitted] = React.useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const scope = costCenterEditable(cc, persona)
  const canFinance = scope === "all"
  const canOps = scope !== "none"

  const budget = parseBudget(draft.weeklyBudget)
  const errors = {
    name: draft.name.trim().length < 3 ? "Give the cost center a name of at least 3 characters." : null,
    glCode: /^\d{4}-\d{3}$/.test(draft.glCode.trim()) ? null : "Use the SAP format 0000-000, e.g. 6120-410.",
    weeklyBudget: !Number.isFinite(budget) || budget < 500 || budget > 1_000_000 ? "Enter a weekly budget between $500 and $1,000,000." : null,
    approverName: draft.approverName.trim().length < 3 ? "Name the person who approves requests over policy." : null,
    checkIn: draft.checkIn.trim().length < 15 ? "Add enough detail for a first-time Pro to find the right entrance." : null,
    attire: draft.attire.trim().length < 10 ? "Describe what Pros should wear, shoes, pants, anything issued on site." : null,
  }
  const invalid = Object.values(errors).some(Boolean)
  const patch = buildPatch(cc, draft)
  const changed = Object.keys(patch)
  const showError = (key: keyof typeof errors) => (submitted ? errors[key] : null)

  const upcoming = React.useMemo(
    () =>
      requests
        .filter((r) => r.costCenterId === cc.id && r.state === "active" && r.dates.some((d) => d >= today))
        .map((r) => ({ r, next: r.dates.filter((d) => d >= today).sort()[0] ?? firstDateOf(r) }))
        .sort((a, b) => a.next.localeCompare(b.next) || a.r.startTime.localeCompare(b.r.startTime)),
    [requests, cc.id, today]
  )
  const nextShift = upcoming[0]
  const nextPosition = nextShift ? positions.find((p) => p.id === nextShift.r.positionId) : undefined

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (invalid || changed.length === 0) return
    updateCostCenter(cc.id, patch)
    const label = listLabels(changed)
    const opsChanged = changed.some((k) => ["checkIn", "parking", "parkingNotes", "attire", "favoritesFirst"].includes(k))
    toast.success(`Saved ${cc.code} · ${patch.name ?? cc.name}`, {
      description: `${label.charAt(0).toUpperCase()}${label.slice(1)} updated.${opsChanged ? ` Every new request at ${venue?.shortName ?? "this venue"} inherits it.` : ""}`,
    })
    onDone()
  }

  const financeHint = canFinance ? undefined : `Managed by the ${PROGRAM_NAME} program office.`
  const committed = spend?.committed ?? 0
  const pending = spend?.pending ?? 0

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col" noValidate>
      <SheetHeader className="border-b pr-12">
        <div className="flex items-center gap-3">
          <VenueMark venue={venue} size="md" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{cc.code}</span>
              <span className="truncate">{cc.name}</span>
            </SheetTitle>
            <SheetDescription className="truncate">
              {venue?.name ?? "Venue"} · {plural(upcoming.length, "upcoming request")}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-6 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <FieldGroup className="gap-6">
            {scope === "operational" ? (
              <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                <LockIcon className="mt-px size-3.5 shrink-0" aria-hidden />
                <span className="text-pretty">
                  You can update shift defaults for your venues. Budget, GL code, approver and status are managed by the {PROGRAM_NAME} program office.
                </span>
              </p>
            ) : null}

            <FieldSet>
              <FieldLegend>Budget &amp; approvals</FieldLegend>
              <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field data-invalid={!!showError("name") || undefined} data-disabled={!canFinance || undefined}>
                  <FieldLabel htmlFor="cc-name">Name</FieldLabel>
                  <Input
                    id="cc-name"
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                    disabled={!canFinance}
                    aria-invalid={!!showError("name") || undefined}
                  />
                  {showError("name") ? <FieldError>{showError("name")}</FieldError> : financeHint ? <FieldDescription>{financeHint}</FieldDescription> : null}
                </Field>
                <Field data-invalid={!!showError("glCode") || undefined} data-disabled={!canFinance || undefined}>
                  <FieldLabel htmlFor="cc-gl">GL code</FieldLabel>
                  <Input
                    id="cc-gl"
                    value={draft.glCode}
                    onChange={(e) => set("glCode", e.target.value)}
                    disabled={!canFinance}
                    className="font-mono"
                    aria-invalid={!!showError("glCode") || undefined}
                  />
                  {showError("glCode") ? <FieldError>{showError("glCode")}</FieldError> : <FieldDescription>Posts to SAP S/4HANA with every invoice line.</FieldDescription>}
                </Field>
                <Field data-invalid={!!showError("weeklyBudget") || undefined} data-disabled={!canFinance || undefined}>
                  <FieldLabel htmlFor="cc-budget">Weekly budget</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>$</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="cc-budget"
                      inputMode="numeric"
                      value={draft.weeklyBudget}
                      onChange={(e) => set("weeklyBudget", e.target.value)}
                      disabled={!canFinance}
                      className="tabular"
                      aria-invalid={!!showError("weeklyBudget") || undefined}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>/week</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  {showError("weeklyBudget") ? (
                    <FieldError>{showError("weeklyBudget")}</FieldError>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <BudgetBar committed={committed} pending={pending} budget={Number.isFinite(budget) ? budget : cc.weeklyBudget} />
                      <FieldDescription className="tabular">
                        {money(committed)} committed{pending > 0 ? ` + ${money(pending)} pending` : ""} ·{" "}
                        <span className="whitespace-nowrap">{weekLabel}</span>
                      </FieldDescription>
                    </div>
                  )}
                </Field>
                <Field data-invalid={!!showError("approverName") || undefined} data-disabled={!canFinance || undefined}>
                  <FieldLabel htmlFor="cc-approver">Approver</FieldLabel>
                  <Input
                    id="cc-approver"
                    value={draft.approverName}
                    onChange={(e) => set("approverName", e.target.value)}
                    disabled={!canFinance}
                    aria-invalid={!!showError("approverName") || undefined}
                  />
                  {showError("approverName") ? (
                    <FieldError>{showError("approverName")}</FieldError>
                  ) : (
                    <FieldDescription>Approves requests above the auto-approve limit.</FieldDescription>
                  )}
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSeparator />

            <FieldSet>
              <FieldLegend>Shift defaults</FieldLegend>
              <FieldDescription>Every new request at this cost center inherits these, and Pros see them in their shift briefing.</FieldDescription>
              <FieldGroup className="gap-4">
                <Field data-invalid={!!showError("checkIn") || undefined} data-disabled={!canOps || undefined}>
                  <FieldLabel htmlFor="cc-checkin">Check-in instructions</FieldLabel>
                  <Textarea
                    id="cc-checkin"
                    rows={3}
                    value={draft.checkIn}
                    onChange={(e) => set("checkIn", e.target.value)}
                    disabled={!canOps}
                    aria-invalid={!!showError("checkIn") || undefined}
                  />
                  {showError("checkIn") ? <FieldError>{showError("checkIn")}</FieldError> : <FieldDescription>Entrance, who to find, and how early to arrive.</FieldDescription>}
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                  <Field data-disabled={!canOps || undefined}>
                    <FieldLabel htmlFor="cc-parking">Parking</FieldLabel>
                    <Select value={draft.parking} onValueChange={(v) => set("parking", v as ParkingKind)} disabled={!canOps}>
                      <SelectTrigger id="cc-parking" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {PARKING_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field data-disabled={!canOps || undefined}>
                    <FieldLabel htmlFor="cc-parking-notes">Parking notes</FieldLabel>
                    <Input
                      id="cc-parking-notes"
                      value={draft.parkingNotes}
                      onChange={(e) => set("parkingNotes", e.target.value)}
                      disabled={!canOps}
                      placeholder="Lot, rate, transit options…"
                    />
                  </Field>
                </div>
                <Field data-invalid={!!showError("attire") || undefined} data-disabled={!canOps || undefined}>
                  <FieldLabel htmlFor="cc-attire">Attire</FieldLabel>
                  <Textarea
                    id="cc-attire"
                    rows={3}
                    value={draft.attire}
                    onChange={(e) => set("attire", e.target.value)}
                    disabled={!canOps}
                    aria-invalid={!!showError("attire") || undefined}
                  />
                  {showError("attire") ? <FieldError>{showError("attire")}</FieldError> : null}
                </Field>
                <Field orientation="horizontal" data-disabled={!canOps || undefined}>
                  <FieldContent>
                    <FieldLabel htmlFor="cc-favorites">Favorites first</FieldLabel>
                    <FieldDescription>
                      Offer shifts to this venue&apos;s favorite Pros first; remaining seats open to all qualified Pros.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="cc-favorites"
                    checked={draft.favoritesFirst}
                    onCheckedChange={(v) => set("favoritesFirst", v)}
                    disabled={!canOps}
                  />
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSeparator />

            <Field orientation="horizontal" data-disabled={!canFinance || undefined}>
              <FieldContent>
                <FieldLabel htmlFor="cc-active">Active</FieldLabel>
                <FieldDescription>
                  {canFinance
                    ? "Inactive cost centers can't receive new requests. Existing shifts are unaffected."
                    : `Inactive cost centers can't receive new requests. ${financeHint}`}
                </FieldDescription>
              </FieldContent>
              <Switch id="cc-active" checked={draft.active} onCheckedChange={(v) => set("active", v)} disabled={!canFinance} />
            </Field>
          </FieldGroup>

          <aside className="xl:sticky xl:top-0 xl:self-start">
            <ProBriefingPreview
              venue={venue}
              costCenterName={draft.name.trim() || cc.name}
              checkIn={draft.checkIn.trim()}
              parking={draft.parking}
              parkingNotes={draft.parkingNotes.trim()}
              attire={draft.attire.trim()}
              favoritesFirst={draft.favoritesFirst}
              shift={
                nextShift
                  ? {
                      title: nextPosition?.title ?? "Shift",
                      date: nextShift.next,
                      time: formatTimeRange(nextShift.r.startTime, nextShift.r.endTime),
                      event: nextShift.r.eventName,
                    }
                  : undefined
              }
            />
          </aside>
        </div>
      </div>

      <SheetFooter className="flex-row items-center justify-between gap-3 border-t">
        <span className={cn("text-xs", changed.length ? "font-medium text-foreground" : "text-muted-foreground")}>
          {changed.length ? `${plural(changed.length, "unsaved change")}` : "No changes yet"}
        </span>
        <div className="flex gap-2">
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </SheetClose>
          <Button type="submit" disabled={changed.length === 0 || (submitted && invalid)}>
            Save changes
          </Button>
        </div>
      </SheetFooter>
    </form>
  )
}

interface BriefingShift {
  title: string
  date: string
  time: string
  event?: string
}

function ProBriefingPreview({
  venue,
  costCenterName,
  checkIn,
  parking,
  parkingNotes,
  attire,
  favoritesFirst,
  shift,
}: {
  venue?: Venue
  costCenterName: string
  checkIn: string
  parking: ParkingKind
  parkingNotes: string
  attire: string
  favoritesFirst: boolean
  shift?: BriefingShift
}) {
  const parkingLabel = PARKING_OPTIONS.find((o) => o.value === parking)?.briefing ?? parking
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium">
          <SmartphoneIcon className="size-3.5" aria-hidden />
          Pro shift briefing
        </span>
        <span className="flex items-center gap-1.5">
          <LiveDot tone="primary" />
          Live preview
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-background shadow-xs">
        <div className="flex items-center gap-3 border-b bg-muted/40 p-3">
          <VenueMark venue={venue} size="md" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{venue?.name ?? "Venue"}</span>
            <span className="truncate text-xs text-muted-foreground">
              {costCenterName}
              {venue ? ` · ${venue.city}, ${venue.state}` : ""}
            </span>
          </div>
        </div>
        {shift ? (
          <div className="flex flex-col gap-0.5 border-b px-3 py-2.5">
            <span className="text-xs font-medium">
              {shift.title}
              {shift.event ? <span className="font-normal text-muted-foreground"> · {shift.event}</span> : null}
            </span>
            <span className="text-xs text-muted-foreground tabular">
              {formatDate(shift.date)} · {shift.time}
            </span>
          </div>
        ) : null}
        <dl className="flex flex-col divide-y">
          <BriefingRow icon={MapPinIcon} label="Where to check in">
            {checkIn || <span className="text-muted-foreground italic">Add check-in instructions</span>}
          </BriefingRow>
          <BriefingRow icon={CarIcon} label="Parking">
            <span className="font-medium">{parkingLabel}</span>
            {parkingNotes ? <span className="text-muted-foreground">, {parkingNotes}</span> : null}
          </BriefingRow>
          <BriefingRow icon={ShirtIcon} label="What to wear">
            {attire || <span className="text-muted-foreground italic">Add attire guidance</span>}
          </BriefingRow>
        </dl>
        {favoritesFirst ? (
          <div className="flex items-start gap-2 border-t bg-primary/5 px-3 py-2.5 text-xs text-primary dark:bg-primary/10">
            <StarIcon className="mt-px size-3.5 shrink-0 fill-current" aria-hidden />
            <span className="text-pretty">Favorites at {venue?.shortName ?? "this venue"} get first pick of these shifts.</span>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground text-pretty">
        Pros see this in the Instawork app when they accept a shift and again in their day-of reminder.
      </p>
    </div>
  )
}

function BriefingRow({ icon: Icon, label, children }: { icon: typeof MapPinIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 px-3 py-2.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd className="text-xs leading-relaxed text-pretty">{children}</dd>
      </div>
    </div>
  )
}
