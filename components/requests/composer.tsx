"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { addDays } from "date-fns"
import { motion } from "motion/react"
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  StarIcon,
  WandSparklesIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  SupplierMark,
  VenueMark,
  WorkerAvatar,
} from "@/components/app/identity"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import { Badge } from "@/components/ui/badge"
import { BorderBeam } from "@/components/ui/border-beam"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { NumberTicker } from "@/components/ui/number-ticker"
import { useData, useNow, usePersona } from "@/hooks/use-demo"
import {
  formatDate,
  formatTimeRange,
  parseLocal,
  scheduledMinutes,
  toISODate,
} from "@/lib/dates"
import { money, num, rate, workerName } from "@/lib/format"
import { parseRequestText, type ParsedRequest } from "@/lib/parse-request"
import { metroById } from "@/lib/reference"
import {
  defaultBreakMinutes,
  payableShiftHours,
  postMsaRate,
  requiredCertsFor,
} from "@/lib/rules"
import { venueInScope } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { PositionCategory, RequestReason, Venue } from "@/lib/types"
import { cn } from "@/lib/utils"

import {
  committedForWeek,
  draftEstimate,
  runChecks,
  type Check,
  type DraftState,
} from "./checks"

const CATEGORY_ORDER: PositionCategory[] = [
  "Concessions",
  "Bar",
  "Service",
  "Culinary",
  "Leadership",
  "Support",
]
const REASONS: RequestReason[] = [
  "Event",
  "Catering",
  "Call-out coverage",
  "Seasonal peak",
  "Recurring service",
]
const EXAMPLES = [
  "12 cash bartenders at Wrigley this Saturday 4-11pm for the Cubs game",
  "8 grill cooks at Soldier Field Sunday 9am-6pm for Bears vs. Packers",
  "6 suite attendants at United Center tomorrow 4:30-11:30pm",
]

function defaultTimes(venue?: Venue): [string, string] {
  if (!venue) return ["16:00", "23:00"]
  if (venue.type === "Campus") return ["07:00", "15:30"]
  if (venue.type === "Raceway") return ["07:00", "17:00"]
  return ["16:00", "23:00"]
}

type Touched = Partial<
  Record<
    | "duties"
    | "attire"
    | "checkIn"
    | "parking"
    | "breakMinutes"
    | "favoritesFirst",
    boolean
  >
>

function CheckIcon({ status }: { status: Check["status"] }) {
  if (status === "pass")
    return <CheckCircle2Icon className="size-4 shrink-0 text-success" />
  if (status === "warn")
    return <AlertTriangleIcon className="size-4 shrink-0 text-warning" />
  if (status === "fail")
    return <XCircleIcon className="size-4 shrink-0 text-destructive" />
  return <InfoIcon className="size-4 shrink-0 text-info" />
}

function StepCard({
  step,
  title,
  description,
  children,
  pulse = 0,
}: {
  step: number
  title: string
  description?: string
  children: React.ReactNode
  pulse?: number
}) {
  return (
    <Card className="relative">
      {pulse ? (
        <span
          key={pulse}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] animate-fade-out rounded-xl ring-2 ring-brand ring-inset"
        />
      ) : null}
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background tabular">
            {step}
          </span>
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function RequestComposer() {
  const router = useRouter()
  const params = useSearchParams()
  const persona = usePersona()
  const now = useNow()
  const data = useStore((s) => s.data)
  const createRequest = useStore((s) => s.createRequest)
  const rosters = useData((d) => d.rosters)
  const today = toISODate(now)

  const venues = React.useMemo(
    () => data.venues.filter((v) => venueInScope(v.id, persona)),
    [data.venues, persona]
  )

  const buildInitial = React.useCallback((): {
    draft: DraftState
    matched: ParsedRequest["matched"]
    prompt: string
  } => {
    const firstVenue = venues[0]
    const [start, end] = defaultTimes(firstVenue)
    const base: DraftState = {
      venueId: firstVenue?.id ?? "",
      costCenterId: "",
      positionId: "",
      headcount: 6,
      hireType: "Quick Hire",
      favoritesFirst: true,
      dates: [],
      startTime: start,
      endTime: end,
      breakMinutes: defaultBreakMinutes(start, end),
      eventName: "",
      reason: "Event",
      duties: "",
      attire: "",
      checkIn: "",
      parking: "",
      notes: "",
      supplierIds: [],
      requestedWorkerIds: [],
    }
    let matched: ParsedRequest["matched"] = []
    let prompt = ""
    const venueParam = params.get("venue")
    if (venueParam && venues.some((v) => v.id === venueParam))
      base.venueId = venueParam
    const duplicate = params.get("duplicate")
    if (duplicate) {
      const src = data.requests.find((r) => r.id === duplicate)
      if (src && venues.some((v) => v.id === src.venueId)) {
        const first = [...src.dates].sort()[0]
        const daysBehind = Math.round(
          (parseLocal(today).getTime() - parseLocal(first).getTime()) /
            86_400_000
        )
        const shift = daysBehind >= 0 ? (Math.floor(daysBehind / 7) + 1) * 7 : 0
        Object.assign(base, {
          venueId: src.venueId,
          costCenterId: src.costCenterId,
          positionId: src.positionId,
          headcount: src.headcount,
          hireType: src.hireType,
          favoritesFirst: src.favoritesFirst,
          dates: src.dates
            .map((d) => toISODate(addDays(parseLocal(d), shift)))
            .filter((d) => d >= today),
          startTime: src.startTime,
          endTime: src.endTime,
          breakMinutes: src.breakMinutes,
          eventName: src.eventName ?? "",
          reason: src.reason,
          duties: src.duties,
          attire: src.attire,
          checkIn: src.checkIn,
          parking: src.parking,
          notes: src.notes ?? "",
          supplierIds: src.supplierIds,
        })
      }
    }
    const draftParam = params.get("draft")
    if (draftParam) {
      try {
        const parsed = JSON.parse(draftParam) as Partial<ParsedRequest>
        if (parsed.venueId && venues.some((v) => v.id === parsed.venueId))
          base.venueId = parsed.venueId
        if (parsed.positionId) base.positionId = parsed.positionId
        if (parsed.headcount) base.headcount = parsed.headcount
        if (parsed.dates?.length)
          base.dates = parsed.dates.filter((d) => d >= today)
        if (parsed.startTime && parsed.endTime) {
          base.startTime = parsed.startTime
          base.endTime = parsed.endTime
          base.breakMinutes = defaultBreakMinutes(
            parsed.startTime,
            parsed.endTime
          )
        }
        if (parsed.eventName) base.eventName = parsed.eventName
        const chipVenue = data.venues.find((v) => v.id === base.venueId)
        const chipPosition = data.positions.find(
          (p) => p.id === base.positionId
        )
        matched = [
          ...(parsed.headcount
            ? [
                {
                  kind: "headcount" as const,
                  label: `${parsed.headcount} Pros`,
                },
              ]
            : []),
          ...(chipPosition && parsed.positionId
            ? [{ kind: "position" as const, label: chipPosition.title }]
            : []),
          ...(chipVenue && parsed.venueId
            ? [{ kind: "venue" as const, label: chipVenue.name }]
            : []),
          ...(base.dates.length
            ? [
                {
                  kind: "date" as const,
                  label: base.dates
                    .map((d) => formatDate(d, "EEE MMM d"))
                    .join(", "),
                },
              ]
            : []),
          ...(parsed.startTime && parsed.endTime
            ? [
                {
                  kind: "time" as const,
                  label: formatTimeRange(parsed.startTime, parsed.endTime),
                },
              ]
            : []),
          ...(parsed.eventName
            ? [{ kind: "event" as const, label: parsed.eventName }]
            : []),
        ]
        prompt = "Drafted by Ask Mise, review the details below, then post."
      } catch {
        // ignore malformed deep links
      }
    }
    const worker = params.get("worker")
    if (worker) {
      const w = data.workers.find((x) => x.id === worker)
      if (w) {
        base.requestedWorkerIds = [w.id]
        if (!base.positionId) base.positionId = w.positionIds[0] ?? ""
        const metroVenue = venues.find((v) => v.metro === w.metro)
        if (metroVenue && !venueParam && !duplicate)
          base.venueId = metroVenue.id
        base.headcount = Math.max(base.headcount, 1)
      }
    }
    return { draft: base, matched, prompt }
  }, [
    params,
    venues,
    data.requests,
    data.workers,
    data.venues,
    data.positions,
    today,
  ])

  /** Fills cost center, supplier, briefing and duty defaults whenever venue, cost center or position changes. */
  const applyDefaults = React.useCallback(
    (
      prev: DraftState | null,
      next: DraftState,
      touched: Touched
    ): DraftState => {
      let d = next
      if (!prev || prev.venueId !== d.venueId) {
        const v = data.venues.find((x) => x.id === d.venueId)
        if (v) {
          const ccs = data.costCenters.filter(
            (c) => c.venueId === v.id && c.active
          )
          const ccId = ccs.some((c) => c.id === d.costCenterId)
            ? d.costCenterId
            : (ccs[0]?.id ?? "")
          const active = data.suppliers.filter(
            (s) =>
              s.metros.includes(v.metro) && s.active && s.coiExpires >= today
          )
          const keep =
            d.supplierIds.length > 0 &&
            d.supplierIds.every((id) => active.some((s) => s.id === id))
          d = {
            ...d,
            costCenterId: ccId,
            supplierIds: keep
              ? d.supplierIds
              : active.filter((s) => s.tier <= 2).map((s) => s.id),
          }
        }
      }
      if (!prev || prev.costCenterId !== d.costCenterId) {
        const cc = data.costCenters.find((c) => c.id === d.costCenterId)
        if (cc) {
          d = {
            ...d,
            checkIn: touched.checkIn ? d.checkIn : cc.checkIn,
            attire: touched.attire ? d.attire : cc.attire,
            parking: touched.parking ? d.parking : cc.parkingNotes,
            favoritesFirst: touched.favoritesFirst
              ? d.favoritesFirst
              : cc.favoritesFirst,
          }
        }
      }
      if (!prev || prev.positionId !== d.positionId) {
        const p = data.positions.find((x) => x.id === d.positionId)
        if (p && !(touched.duties && d.duties))
          d = { ...d, duties: p.description }
      }
      return d
    },
    [data.venues, data.costCenters, data.suppliers, data.positions, today]
  )

  const [composer, setComposer] = React.useState(() => {
    const init = buildInitial()
    const touched: Touched = params.get("duplicate")
      ? {
          duties: true,
          attire: true,
          checkIn: true,
          parking: true,
          breakMinutes: true,
          favoritesFirst: true,
        }
      : {}
    return {
      draft: applyDefaults(null, init.draft, touched),
      touched,
      matched: init.matched,
      note: init.prompt,
      pulse: init.matched.length ? 1 : 0,
    }
  })
  const { draft, touched, matched } = composer
  const aiNote = composer.note
  const [aiText, setAiText] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const venue = data.venues.find((v) => v.id === draft.venueId)
  const costCenters = data.costCenters.filter(
    (c) => c.venueId === draft.venueId
  )
  const costCenter = data.costCenters.find((c) => c.id === draft.costCenterId)
  const position = data.positions.find((p) => p.id === draft.positionId)
  const rateCard =
    venue && position
      ? data.rateCards.find(
          (r) => r.positionId === position.id && r.metro === venue.metro
        )
      : undefined
  const roster = rosters.find((r) => r.venueId === draft.venueId)
  const eligibleSuppliers = React.useMemo(
    () =>
      venue ? data.suppliers.filter((s) => s.metros.includes(venue.metro)) : [],
    [data.suppliers, venue]
  )

  const commit = (fn: (d: DraftState) => DraftState, touch?: Touched) =>
    setComposer((prev) => {
      const nextTouched = touch ? { ...prev.touched, ...touch } : prev.touched
      return {
        ...prev,
        touched: nextTouched,
        draft: applyDefaults(prev.draft, fn(prev.draft), nextTouched),
      }
    })

  const update = <K extends keyof DraftState>(
    key: K,
    value: DraftState[K],
    touch?: Touched
  ) => commit((d) => ({ ...d, [key]: value }), touch)

  const setMatched = (value: ParsedRequest["matched"]) =>
    setComposer((prev) => ({ ...prev, matched: value }))
  const setAiNote = (value: string) =>
    setComposer((prev) => ({ ...prev, note: value }))

  const setTimes = (start: string, end: string) => {
    commit((d) => ({
      ...d,
      startTime: start,
      endTime: end,
      breakMinutes: touched.breakMinutes
        ? d.breakMinutes
        : defaultBreakMinutes(start, end),
    }))
  }

  const applyParsed = (text: string) => {
    const parsed = parseRequestText(text, {
      venues: data.venues,
      positions: data.positions,
      now,
    })
    if (parsed.matched.length === 0) {
      setMatched([])
      setAiNote(
        "I couldn't pick out a position, date or time. Try: “10 cash bartenders at Wrigley Saturday 4–11pm”."
      )
      return
    }
    commit((d) => {
      const next = { ...d }
      if (parsed.venueId && venues.some((v) => v.id === parsed.venueId))
        next.venueId = parsed.venueId
      if (parsed.positionId) next.positionId = parsed.positionId
      if (parsed.headcount) next.headcount = parsed.headcount
      if (parsed.dates?.length)
        next.dates = parsed.dates.filter((x) => x >= today)
      if (parsed.startTime && parsed.endTime) {
        next.startTime = parsed.startTime
        next.endTime = parsed.endTime
        next.breakMinutes = touched.breakMinutes
          ? d.breakMinutes
          : defaultBreakMinutes(parsed.startTime, parsed.endTime)
      }
      if (parsed.eventName) {
        next.eventName = parsed.eventName
        next.reason = "Event"
      }
      return next
    })
    const outOfScope =
      parsed.venueId && !venues.some((v) => v.id === parsed.venueId)
    setMatched(parsed.matched)
    setComposer((prev) => ({ ...prev, pulse: prev.pulse + 1 }))
    setAiNote(
      outOfScope
        ? "That venue isn't in your workspace, so I kept your current venue."
        : `Filled ${parsed.matched.length} ${parsed.matched.length === 1 ? "field" : "fields"}. Review the details below, everything else uses your venue defaults.`
    )
  }

  const checks = React.useMemo(
    () =>
      runChecks(draft, { data, now, venue, position, costCenter, rateCard }),
    [draft, data, now, venue, position, costCenter, rateCard]
  )
  const fails = checks.filter((c) => c.status === "fail")
  const warns = checks.filter((c) => c.status === "warn")
  const missingRequired =
    !draft.venueId ||
    !draft.costCenterId ||
    !draft.positionId ||
    draft.headcount < 1 ||
    draft.dates.length === 0
  const canSubmit = !missingRequired && fails.length === 0 && !submitting

  const estimate = draftEstimate(draft, rateCard)
  const totalShifts = draft.headcount * draft.dates.length
  const paidHours =
    draft.startTime && draft.endTime ? payableShiftHours(draft) : 0
  const needsProgram =
    persona.id !== "program" &&
    estimate > data.policies.autoApproveRequestsUnder
  const committed =
    costCenter && draft.dates.length
      ? committedForWeek(data, costCenter.id, [...draft.dates].sort()[0])
      : 0
  const certs = venue && position ? requiredCertsFor(position, venue) : []
  const favorites = (roster?.favorites ?? [])
    .map((id) => data.workers.find((w) => w.id === id))
    .filter(Boolean) as typeof data.workers
  const requested = draft.requestedWorkerIds
    .map((id) => data.workers.find((w) => w.id === id))
    .filter(Boolean) as typeof data.workers

  const groupedPositions = React.useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => ({
        cat,
        items: data.positions.filter((p) => p.category === cat),
      })).filter((g) => g.items.length),
    [data.positions]
  )

  const selectedDates = draft.dates.map((d) => parseLocal(d))
  const quickPicks: { label: string; dates: string[] }[] = React.useMemo(() => {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const sat = addDays(t, (6 - t.getDay() + 7) % 7 || 7)
    const nextMon = addDays(t, (8 - t.getDay()) % 7 || 7)
    return [
      { label: "Tomorrow", dates: [toISODate(addDays(t, 1))] },
      { label: "This Saturday", dates: [toISODate(sat)] },
      {
        label: "This weekend",
        dates: [toISODate(sat), toISODate(addDays(sat, 1))],
      },
      {
        label: "Weekdays next week",
        dates: [0, 1, 2, 3, 4].map((i) => toISODate(addDays(nextMon, i))),
      },
    ]
  }, [now])

  const input = () => ({
    venueId: draft.venueId,
    costCenterId: draft.costCenterId,
    positionId: draft.positionId,
    eventName: draft.eventName,
    reason: draft.reason,
    hireType: draft.hireType,
    dates: draft.dates,
    startTime: draft.startTime,
    endTime: draft.endTime,
    breakMinutes: draft.breakMinutes,
    headcount: draft.headcount,
    duties: draft.duties,
    attire: draft.attire,
    checkIn: draft.checkIn,
    parking: draft.parking,
    notes: draft.notes,
    favoritesFirst: draft.favoritesFirst,
    supplierIds: draft.supplierIds,
    requestedWorkerIds: draft.requestedWorkerIds,
  })

  const submit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    const result = createRequest(input())
    if (result.requiresProgramApproval) {
      toast.success(`${result.id} sent for program approval`, {
        description: `Estimated ${money(estimate)} is over the ${money(data.policies.autoApproveRequestsUnder)} auto-approve limit. ${"Priya Raman"} has been notified.`,
      })
    } else {
      toast.success(`${result.id} is live`, {
        description: `Distributing ${num(totalShifts)} ${position?.title ?? ""} shifts: watch them fill in real time.`,
      })
    }
    router.push(`/requests/${result.id}`)
  }

  const saveDraft = () => {
    if (!draft.venueId || !draft.costCenterId || !draft.positionId) {
      toast.error("Pick a venue, cost center and position to save a draft")
      return
    }
    const result = createRequest(input(), { asDraft: true })
    toast.success(`Draft ${result.id} saved`)
    router.push(`/requests?tab=drafts`)
  }

  return (
    <>
      <PageHeader
        eyebrow="New request"
        title="Post shifts in under a minute"
        description="Describe what you need or fill in the form. Rates come from the rate card, check-in details from the cost center, and approvals route themselves."
        actions={
          <Button variant="ghost" asChild>
            <Link href="/requests">Cancel</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="relative overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <WandSparklesIcon className="size-4 text-primary" />
                Describe it
              </CardTitle>
              <CardDescription>
                Type it the way you&apos;d text your staffing lead. Mise fills
                the form.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <InputGroup>
                <InputGroupTextarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      if (aiText.trim()) applyParsed(aiText)
                    }
                  }}
                  placeholder="e.g. 12 cash bartenders at Wrigley this Saturday 4–11pm for the Cubs game"
                  className="min-h-16"
                  aria-label="Describe the request"
                />
                <InputGroupAddon align="block-end" className="justify-between">
                  <span className="text-xs text-muted-foreground">
                    Enter to fill · Shift+Enter for a new line
                  </span>
                  <InputGroupButton
                    variant="default"
                    size="sm"
                    onClick={() => aiText.trim() && applyParsed(aiText)}
                    disabled={!aiText.trim()}
                  >
                    <SparklesIcon data-icon="inline-start" />
                    Fill form
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              {matched.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {matched.map((m, i) => (
                    <motion.span
                      key={`${composer.pulse}-${m.kind}-${m.label}`}
                      initial={{ opacity: 0, y: 6, scale: 0.92 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        delay: i * 0.06,
                        type: "spring",
                        stiffness: 500,
                        damping: 30,
                      }}
                    >
                      <Badge
                        variant="secondary"
                        className="gap-1 bg-brand/40 text-brand-foreground dark:bg-brand/15 dark:text-brand"
                      >
                        <CheckCircle2Icon />
                        {m.label}
                      </Badge>
                    </motion.span>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => {
                        setAiText(ex)
                        applyParsed(ex)
                      }}
                      className="rounded-full border bg-muted/40 px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}
              {aiNote ? (
                <p className="text-xs text-muted-foreground">{aiNote}</p>
              ) : null}
            </CardContent>
            <BorderBeam size={90} duration={10} />
          </Card>

          <StepCard
            pulse={composer.pulse}
            step={1}
            title="Where"
            description="Shifts land in this cost center for billing, no mapping spreadsheets."
          >
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="venue">Venue</FieldLabel>
                <Select
                  value={draft.venueId}
                  onValueChange={(v) => update("venueId", v)}
                >
                  <SelectTrigger id="venue" className="w-full">
                    <SelectValue placeholder="Choose a venue" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {venues.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          <VenueMark venue={v} size="xs" />
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="cc">Cost center</FieldLabel>
                <Select
                  value={draft.costCenterId}
                  onValueChange={(v) => update("costCenterId", v)}
                  disabled={!venue}
                >
                  <SelectTrigger id="cc" className="w-full">
                    <SelectValue placeholder="Choose a cost center" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {costCenters.map((c) => (
                        <SelectItem
                          key={c.id}
                          value={c.id}
                          disabled={!c.active}
                        >
                          <span className="font-mono text-xs text-muted-foreground">
                            {c.code}
                          </span>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </StepCard>

          <StepCard
            pulse={composer.pulse}
            step={2}
            title="Who"
            description="Bill rates come straight from the published rate card."
          >
            <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
              <Field>
                <FieldLabel htmlFor="position">Position</FieldLabel>
                <Select
                  value={draft.positionId}
                  onValueChange={(v) => update("positionId", v)}
                >
                  <SelectTrigger id="position" className="w-full">
                    <SelectValue placeholder="Choose a position" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupedPositions.map((g) => (
                      <SelectGroup key={g.cat}>
                        <SelectLabel>{g.cat}</SelectLabel>
                        {g.items.map((p) => {
                          const card = venue
                            ? data.rateCards.find(
                                (r) =>
                                  r.positionId === p.id &&
                                  r.metro === venue.metro
                              )
                            : undefined
                          return (
                            <SelectItem key={p.id} value={p.id}>
                              <span>{p.title}</span>
                              {card ? (
                                <span className="ml-auto text-xs text-muted-foreground tabular">
                                  {rate(card.billRate)}
                                </span>
                              ) : null}
                            </SelectItem>
                          )
                        })}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {rateCard ? (
                  <FieldDescription>
                    Pay {rate(rateCard.payRate)} · bill{" "}
                    {rate(rateCard.billRate)} · supplier net{" "}
                    {rate(
                      postMsaRate(rateCard.billRate, data.policies.msaFeePct)
                    )}{" "}
                    after the {data.policies.msaFeePct}% program fee
                  </FieldDescription>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="headcount">Pros per date</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <InputGroupButton
                      size="icon-xs"
                      aria-label="Decrease"
                      onClick={() =>
                        update("headcount", Math.max(1, draft.headcount - 1))
                      }
                    >
                      <MinusIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="headcount"
                    inputMode="numeric"
                    className="text-center tabular"
                    value={draft.headcount}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^0-9]/g, ""))
                      update(
                        "headcount",
                        Number.isFinite(n) ? Math.min(250, n) : 1
                      )
                    }}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label="Increase"
                      onClick={() =>
                        update("headcount", Math.min(250, draft.headcount + 1))
                      }
                    >
                      <PlusIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            </FieldGroup>
            <Separator className="my-4" />
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>Hire type</FieldLabel>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={draft.hireType}
                  onValueChange={(v) =>
                    v && update("hireType", v as DraftState["hireType"])
                  }
                  className="w-full"
                >
                  <ToggleGroupItem value="Quick Hire" className="flex-1">
                    Quick hire
                  </ToggleGroupItem>
                  <ToggleGroupItem value="Select Hire" className="flex-1">
                    Select hire
                  </ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                  {draft.hireType === "Quick Hire"
                    ? "Qualified Pros are confirmed instantly."
                    : "You approve each Pro before they're confirmed."}
                </FieldDescription>
              </Field>
              <Field orientation="horizontal" className="rounded-lg border p-3">
                <FieldContent>
                  <FieldTitle className="flex items-center gap-1.5">
                    <StarIcon className="size-3.5 fill-warning text-warning" />
                    Favorites first
                  </FieldTitle>
                  <FieldDescription>
                    Offer to your {num(favorites.length)} favorite Pros at{" "}
                    {venue?.shortName ?? "this venue"} before anyone else.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  checked={draft.favoritesFirst}
                  onCheckedChange={(v) => {
                    update("favoritesFirst", v, { favoritesFirst: true })
                  }}
                  aria-label="Favorites first"
                />
              </Field>
            </FieldGroup>
            {certs.length ? (
              <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                Required on site:
                {certs.map((c) => (
                  <Badge key={c} variant="outline">
                    {c}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Requested Pros</span>
                <span className="text-xs text-muted-foreground">
                  Optional: book specific Pros directly.
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                      disabled={!favorites.length}
                    >
                      <StarIcon data-icon="inline-start" />
                      Add from favorites
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-1">
                    <div className="max-h-72 overflow-y-auto">
                      {favorites
                        .filter(
                          (w) =>
                            !position || w.positionIds.includes(position.id)
                        )
                        .map((w) => {
                          const checked = draft.requestedWorkerIds.includes(
                            w.id
                          )
                          return (
                            <label
                              key={w.id}
                              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) =>
                                  update(
                                    "requestedWorkerIds",
                                    v
                                      ? [
                                          ...draft.requestedWorkerIds,
                                          w.id,
                                        ].slice(0, draft.headcount)
                                      : draft.requestedWorkerIds.filter(
                                          (x) => x !== w.id
                                        )
                                  )
                                }
                              />
                              <WorkerAvatar worker={w} size="sm" />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm">
                                  {workerName(w)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  ★ {w.rating.toFixed(2)} ·{" "}
                                  {Math.round(w.reliability * 100)}% reliable
                                </span>
                              </span>
                            </label>
                          )
                        })}
                      {position &&
                      favorites.every(
                        (w) => !w.positionIds.includes(position.id)
                      ) ? (
                        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                          No favorites qualified as {position.title} yet.
                        </p>
                      ) : null}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              {requested.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {requested.map((w) => (
                    <Badge
                      key={w.id}
                      variant="secondary"
                      className="h-7 gap-1.5 pr-1 pl-1"
                    >
                      <WorkerAvatar worker={w} size="sm" className="size-5" />
                      {workerName(w)}
                      <button
                        type="button"
                        aria-label={`Remove ${workerName(w)}`}
                        onClick={() =>
                          update(
                            "requestedWorkerIds",
                            draft.requestedWorkerIds.filter((x) => x !== w.id)
                          )
                        }
                        className="rounded-sm p-0.5 hover:bg-background"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </StepCard>

          <StepCard
            pulse={composer.pulse}
            step={3}
            title="When"
            description="Add as many dates as you need, each date gets its own shifts."
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      <CalendarIcon data-icon="inline-start" />
                      {draft.dates.length
                        ? `${draft.dates.length} ${draft.dates.length === 1 ? "date" : "dates"} selected`
                        : "Pick dates"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="multiple"
                      selected={selectedDates}
                      onSelect={(dates) =>
                        update(
                          "dates",
                          (dates ?? []).map((d) => toISODate(d)).sort()
                        )
                      }
                      disabled={{
                        before: new Date(
                          now.getFullYear(),
                          now.getMonth(),
                          now.getDate()
                        ),
                      }}
                      numberOfMonths={1}
                    />
                  </PopoverContent>
                </Popover>
                {quickPicks.map((q) => {
                  const active =
                    q.dates.length === draft.dates.length &&
                    q.dates.every((d) => draft.dates.includes(d))
                  return (
                    <Button
                      key={q.label}
                      variant={active ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => update("dates", q.dates)}
                    >
                      {q.label}
                    </Button>
                  )
                })}
              </div>
              {draft.dates.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {draft.dates.map((d) => (
                    <Badge key={d} variant="outline" className="h-7 gap-1 pr-1">
                      {formatDate(d, "EEE, MMM d")}
                      <button
                        type="button"
                        aria-label={`Remove ${formatDate(d, "MMMM d")}`}
                        onClick={() =>
                          update(
                            "dates",
                            draft.dates.filter((x) => x !== d)
                          )
                        }
                        className="rounded-sm p-0.5 hover:bg-muted"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No dates yet: pick from the calendar or a quick option.
                </p>
              )}
              <FieldGroup className="grid gap-4 sm:grid-cols-4">
                <Field>
                  <FieldLabel htmlFor="start">Start</FieldLabel>
                  <Input
                    id="start"
                    type="time"
                    step={900}
                    value={draft.startTime}
                    onChange={(e) => setTimes(e.target.value, draft.endTime)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="end">End</FieldLabel>
                  <Input
                    id="end"
                    type="time"
                    step={900}
                    value={draft.endTime}
                    onChange={(e) => setTimes(draft.startTime, e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="break">Unpaid break</FieldLabel>
                  <Select
                    value={String(draft.breakMinutes)}
                    onValueChange={(v) => {
                      update("breakMinutes", Number(v), { breakMinutes: true })
                    }}
                  >
                    <SelectTrigger id="break" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {[0, 15, 30, 45, 60].map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {m === 0 ? "None" : `${m} min`}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="reason">Reason</FieldLabel>
                  <Select
                    value={draft.reason}
                    onValueChange={(v) => update("reason", v as RequestReason)}
                  >
                    <SelectTrigger id="reason" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {REASONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <Field>
                <FieldLabel htmlFor="event">Event name</FieldLabel>
                <Input
                  id="event"
                  placeholder="e.g. Cubs vs. Cardinals"
                  value={draft.eventName}
                  onChange={(e) => update("eventName", e.target.value)}
                />
                <FieldDescription>
                  Shown to Pros and on invoices, tips and the schedule.
                </FieldDescription>
              </Field>
            </div>
          </StepCard>

          <StepCard
            step={4}
            title="Shift briefing"
            description="Prefilled from the cost center. Edit for this request only."
          >
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="duties">Duties</FieldLabel>
                <Textarea
                  id="duties"
                  rows={2}
                  value={draft.duties}
                  onChange={(e) => {
                    update("duties", e.target.value, { duties: true })
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="checkin">Check-in instructions</FieldLabel>
                <Textarea
                  id="checkin"
                  rows={3}
                  value={draft.checkIn}
                  onChange={(e) => {
                    update("checkIn", e.target.value, { checkIn: true })
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="attire">Attire</FieldLabel>
                <Textarea
                  id="attire"
                  rows={3}
                  value={draft.attire}
                  onChange={(e) => {
                    update("attire", e.target.value, { attire: true })
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="parking">Parking & transit</FieldLabel>
                <Input
                  id="parking"
                  value={draft.parking}
                  onChange={(e) => {
                    update("parking", e.target.value, { parking: true })
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="notes">Note to suppliers</FieldLabel>
                <Input
                  id="notes"
                  placeholder="Optional"
                  value={draft.notes}
                  onChange={(e) => update("notes", e.target.value)}
                />
              </Field>
            </FieldGroup>
          </StepCard>

          <StepCard
            step={5}
            title="Distribution"
            description={`Tier 1 gets a ${data.policies.tier1ExclusiveMinutes}-minute exclusive window. Suppliers without a current certificate of insurance are excluded automatically.`}
          >
            <div className="flex flex-col gap-2">
              {eligibleSuppliers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Pick a venue to see suppliers serving that market.
                </p>
              ) : null}
              {eligibleSuppliers.map((s) => {
                const expired = s.coiExpires < today
                const disabled = expired || !s.active
                const checked = draft.supplierIds.includes(s.id)
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                      disabled
                        ? "opacity-60"
                        : "cursor-pointer hover:bg-muted/40",
                      checked &&
                        !disabled &&
                        "border-primary/40 bg-primary/[0.03]"
                    )}
                  >
                    <Checkbox
                      checked={checked && !disabled}
                      disabled={disabled}
                      onCheckedChange={(v) =>
                        update(
                          "supplierIds",
                          v
                            ? [...new Set([...draft.supplierIds, s.id])]
                            : draft.supplierIds.filter((x) => x !== s.id)
                        )
                      }
                    />
                    <SupplierMark supplier={s} size="md" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {s.name}
                        <Badge variant="outline">Tier {s.tier}</Badge>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {expired
                          ? "Certificate of insurance expired, paused"
                          : s.tier === 1
                            ? `Exclusive for the first ${data.policies.tier1ExclusiveMinutes} min · ${s.kind}`
                            : `${s.kind} · joins after the Tier 1 window`}
                      </span>
                    </span>
                    {expired ? (
                      <StatusBadge tone="danger">COI expired</StatusBadge>
                    ) : null}
                  </label>
                )
              })}
            </div>
          </StepCard>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>
                {venue
                  ? `${venue.name}${costCenter ? ` · ${costCenter.code}` : ""}`
                  : "Choose a venue"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">
                    Estimated cost
                  </span>
                  <span className="font-heading text-3xl font-semibold tracking-tight tabular">
                    $<NumberTicker value={Math.round(estimate)} />
                  </span>
                </div>
                <div className="flex flex-col items-end text-right text-xs text-muted-foreground">
                  <span className="tabular">{num(totalShifts)} shifts</span>
                  <span className="tabular">
                    {(totalShifts * paidHours).toFixed(0)} paid hours
                  </span>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Position</dt>
                  <dd className="truncate font-medium">
                    {position ? `${draft.headcount} × ${position.title}` : "–"}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Bill rate</dt>
                  <dd className="font-medium tabular">
                    {rateCard ? rate(rateCard.billRate) : "–"}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Shift</dt>
                  <dd className="font-medium">
                    {draft.startTime && draft.endTime
                      ? formatTimeRange(draft.startTime, draft.endTime)
                      : "–"}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Paid hours</dt>
                  <dd className="font-medium tabular">
                    {paidHours
                      ? `${paidHours.toFixed(paidHours % 1 ? 1 : 0)}h`
                      : "–"}
                    {draft.startTime &&
                    draft.endTime &&
                    scheduledMinutes(draft.startTime, draft.endTime) / 60 !==
                      paidHours ? (
                      <span className="text-muted-foreground"> / shift</span>
                    ) : null}
                  </dd>
                </div>
              </dl>
              {costCenter ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {costCenter.code} weekly budget
                    </span>
                    <span className="tabular">
                      {money(committed + estimate)} /{" "}
                      {money(costCenter.weeklyBudget)}
                    </span>
                  </div>
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/40"
                      style={{
                        width: `${Math.min(100, (committed / costCenter.weeklyBudget) * 100)}%`,
                      }}
                    />
                    <div
                      className={cn(
                        "absolute inset-y-0 bg-primary",
                        committed + estimate > costCenter.weeklyBudget &&
                          "bg-warning"
                      )}
                      style={{
                        left: `${Math.min(100, (committed / costCenter.weeklyBudget) * 100)}%`,
                        width: `${Math.max(0, Math.min(100, ((committed + estimate) / costCenter.weeklyBudget) * 100) - Math.min(100, (committed / costCenter.weeklyBudget) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
              <div
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border p-3 text-sm",
                  needsProgram
                    ? "border-warning/40 bg-warning/10"
                    : "bg-success/[0.06]"
                )}
              >
                {needsProgram ? (
                  <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                ) : (
                  <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" />
                )}
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {needsProgram
                      ? "Routes to program approval"
                      : "Approved automatically"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {needsProgram
                      ? `Over the ${money(data.policies.autoApproveRequestsUnder)} policy limit, Priya Raman is notified instantly.`
                      : `Within the ${money(data.policies.autoApproveRequestsUnder)} policy limit. Distribution starts the moment you post.`}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Pre-flight checks
                <span className="text-xs font-normal text-muted-foreground">
                  {fails.length
                    ? `${fails.length} to fix`
                    : warns.length
                      ? `${warns.length} to review`
                      : "All clear"}
                </span>
              </CardTitle>
              <CardDescription>
                The checks that used to block postings after the fact, now live
                as you type.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2.5">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-2.5">
                    <span className="mt-0.5">
                      <CheckIcon status={c.status} />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium">{c.label}</span>
                      <span className="text-xs text-pretty text-muted-foreground">
                        {c.detail}
                        {c.href ? (
                          <>
                            {" "}
                            <Link
                              href={c.href}
                              className="text-primary underline-offset-2 hover:underline"
                            >
                              Open
                            </Link>
                          </>
                        ) : null}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button
                className="w-full"
                size="lg"
                onClick={submit}
                disabled={!canSubmit}
              >
                <SendIcon data-icon="inline-start" />
                {needsProgram ? "Submit for approval" : "Post request"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={saveDraft}>
                Save as draft
              </Button>
              {venue ? (
                <p className="text-center text-xs text-muted-foreground">
                  {metroById(venue.metro)?.label} rate card ·{" "}
                  {data.policies.msaFeePct}% program fee is supplier-funded
                </p>
              ) : null}
            </CardFooter>
          </Card>
        </aside>
      </div>

      <div
        data-print="hide"
        className="sticky bottom-0 z-10 -mx-4 flex items-center gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur-md lg:hidden"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs text-muted-foreground">
            {fails.length
              ? `${fails.length} to fix`
              : warns.length
                ? `${warns.length} to review`
                : "Ready to post"}
          </span>
          <span className="font-heading text-lg font-semibold tabular">
            {money(estimate)}
          </span>
        </div>
        <Button onClick={submit} disabled={!canSubmit}>
          <SendIcon data-icon="inline-start" />
          {needsProgram ? "Submit" : "Post request"}
        </Button>
      </div>
    </>
  )
}
