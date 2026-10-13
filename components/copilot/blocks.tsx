"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BanknoteIcon,
  BriefcaseBusinessIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarIcon,
  CircleDashedIcon,
  CircleDollarSignIcon,
  ClipboardCheckIcon,
  ClockIcon,
  CornerDownRightIcon,
  FilePenLineIcon,
  HandCoinsIcon,
  HourglassIcon,
  InboxIcon,
  MapPinIcon,
  MessageCircleQuestionIcon,
  MessageSquareWarningIcon,
  RadioIcon,
  ReceiptTextIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SquarePenIcon,
  StarIcon,
  TicketIcon,
  TimerIcon,
  UsersIcon,
  UsersRoundIcon,
  WandSparklesIcon,
  type LucideIcon,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

import { Mark, WorkerAvatar } from "@/components/app/identity"
import { StatusBadge, type Tone } from "@/components/app/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { hours, money, plural, rate } from "@/lib/format"
import type { ParsedRequest } from "@/lib/parse-request"
import { cn } from "@/lib/utils"

import type { ActionItem, Block, DraftCard, IconKey, RecordItem, RecordMedia, Reply, Stat } from "./engine"

const ICONS: Record<IconKey, LucideIcon> = {
  inbox: InboxIcon,
  timesheets: TimerIcon,
  dispute: MessageSquareWarningIcon,
  tips: HandCoinsIcon,
  approval: ClipboardCheckIcon,
  change: FilePenLineIcon,
  invoice: ReceiptTextIcon,
  payment: BanknoteIcon,
  staffing: UsersIcon,
  compliance: ShieldCheckIcon,
  coi: ShieldAlertIcon,
  calendar: CalendarDaysIcon,
  live: RadioIcon,
  workforce: UsersRoundIcon,
  draft: SquarePenIcon,
  spend: CircleDollarSignIcon,
}

const CHIP_ICON: Record<ParsedRequest["matched"][number]["kind"], LucideIcon> = {
  headcount: UsersIcon,
  position: BriefcaseBusinessIcon,
  venue: MapPinIcon,
  date: CalendarIcon,
  time: ClockIcon,
  event: TicketIcon,
}

const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-muted text-foreground",
  muted: "bg-muted text-muted-foreground",
  primary: "bg-brand/45 text-brand-foreground dark:bg-brand/15 dark:text-brand",
  success: "bg-success/12 text-success dark:bg-success/18",
  warning: "bg-warning/18 text-warning-foreground dark:bg-warning/20 dark:text-warning",
  danger: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  info: "bg-info/12 text-info dark:bg-info/18",
}

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-foreground/40",
  muted: "bg-muted-foreground/50",
  primary: "bg-brand-foreground dark:bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
}

const EASE = [0.22, 1, 0.36, 1] as const

const CHIP_BUTTON = "h-auto min-h-6 rounded-full py-1 text-left whitespace-normal"

function isModifiedClick(e: React.MouseEvent) {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
}

// Reveal plan ------------------------------------------------------------------------
// Text reveals character by character; every other block counts as a fixed number of
// "characters" so the reply streams in reading order at a steady pace.

interface Segment {
  text: string
  bold: boolean
}

function parseRich(text: string): Segment[] {
  const segments: Segment[] = []
  for (const part of text.split(/(\*\*[^*]+\*\*)/)) {
    if (!part) continue
    const bold = part.length > 4 && part.startsWith("**") && part.endsWith("**")
    segments.push({ text: bold ? part.slice(2, -2) : part, bold })
  }
  return segments
}

interface PlannedBlock {
  block: Block
  start: number
  units: number
  segments: Segment[] | null
}

export interface ReplyPlan {
  blocks: PlannedBlock[]
  total: number
}

const BLOCK_UNITS: Record<Exclude<Block["type"], "text" | "records">, number> = {
  stats: 50,
  actions: 24,
  draft: 90,
  chips: 24,
}

export function planReply(blocks: Block[]): ReplyPlan {
  const planned: PlannedBlock[] = []
  let cursor = 0
  for (const block of blocks) {
    let segments: Segment[] | null = null
    let units: number
    if (block.type === "text") {
      segments = parseRich(block.text)
      units = segments.reduce((sum, s) => sum + s.text.length, 0)
    } else if (block.type === "records") {
      units = 40 + 12 * block.items.length
    } else {
      units = BLOCK_UNITS[block.type]
    }
    planned.push({ block, start: cursor, units, segments })
    cursor += units
  }
  return { blocks: planned, total: cursor }
}

/** Total typewriter duration for a reply, in ms. */
export function revealDuration(total: number): number {
  return Math.round(Math.min(900, Math.max(400, total * 2.5)))
}

/**
 * Renders `**bold**` text. While streaming, the unrevealed tail stays in the layout as
 * transparent text so lines never reflow as characters appear.
 */
function RichText({ segments, limit }: { segments: Segment[]; limit?: number }) {
  const parts: React.ReactNode[] = []
  let remaining = limit ?? Number.POSITIVE_INFINITY
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const cut = Math.max(0, Math.min(segment.text.length, remaining))
    remaining -= cut
    const content =
      cut >= segment.text.length ? (
        segment.text
      ) : (
        <>
          {segment.text.slice(0, cut)}
          <span className="text-transparent">{segment.text.slice(cut)}</span>
        </>
      )
    parts.push(
      segment.bold ? (
        <strong key={i} className="font-semibold">
          {content}
        </strong>
      ) : (
        <React.Fragment key={i}>{content}</React.Fragment>
      )
    )
  }
  return <p className="text-sm leading-relaxed text-pretty">{parts}</p>
}

// Assistant reply --------------------------------------------------------------------

export interface ReplyHandlers {
  /** An answer is being produced; prompt-sending controls are disabled. */
  busy: boolean
  onNavigate: () => void
  onPrompt: (prompt: string) => void
  onDraft: (query: string) => void
}

interface AssistantReplyProps extends ReplyHandlers {
  reply: Reply
  stream?: { startedAt: number; duration: number }
}

export function AssistantReply({ reply, stream, ...handlers }: AssistantReplyProps) {
  const plan = React.useMemo(() => planReply(reply.blocks), [reply.blocks])
  const [shown, setShown] = React.useState(0)
  const startedAt = stream?.startedAt
  const duration = stream?.duration
  const total = plan.total

  React.useEffect(() => {
    if (startedAt === undefined || duration === undefined) return
    let frame = 0
    const tick = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration)
      setShown(Math.ceil(progress * total))
      if (progress < 1) frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [startedAt, duration, total])

  const streaming = startedAt !== undefined
  const visible = streaming ? shown : total

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {plan.blocks.map(({ block, start, segments }, i) => {
        if (visible < start) return null
        if (segments) return <RichText key={i} segments={segments} limit={streaming ? visible - start : undefined} />
        return (
          <motion.div
            key={i}
            initial={streaming ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            <ReplyBlock block={block} animate={streaming} {...handlers} />
          </motion.div>
        )
      })}
    </div>
  )
}

const ReplyBlock = React.memo(function ReplyBlock({ block, animate, ...handlers }: { block: Block; animate: boolean } & ReplyHandlers) {
  switch (block.type) {
    case "text":
      return null
    case "stats":
      return <StatsBlock items={block.items} />
    case "records":
      return <RecordsBlock title={block.title} items={block.items} footer={block.footer} animate={animate} onNavigate={handlers.onNavigate} />
    case "actions":
      return <ActionsBlock items={block.items} {...handlers} />
    case "draft":
      return <DraftBlock draft={block.draft} {...handlers} />
    case "chips":
      return <ChipsBlock label={block.label} items={block.items} onPrompt={handlers.onPrompt} disabled={handlers.busy} />
  }
})

// Blocks -----------------------------------------------------------------------------

function StatsBlock({ items }: { items: Stat[] }) {
  return (
    <dl className={cn("grid gap-2", items.length % 3 === 0 ? "grid-cols-3" : "grid-cols-2")}>
      {items.map((stat, i) => (
        <div key={`${stat.label}-${i}`} className="flex min-w-0 flex-col gap-0.5 rounded-lg border bg-card px-3 py-2">
          <dt className="flex items-center gap-1.5 text-xs leading-tight text-muted-foreground">
            {stat.tone && stat.tone !== "neutral" && stat.tone !== "muted" ? (
              <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[stat.tone])} />
            ) : null}
            {stat.label}
          </dt>
          <dd className="font-heading text-base font-semibold tracking-tight tabular">{stat.value}</dd>
          {stat.hint ? <dd className="line-clamp-2 text-xs leading-snug text-muted-foreground">{stat.hint}</dd> : null}
        </div>
      ))}
    </dl>
  )
}

interface RecordsBlockProps {
  title?: string
  items: RecordItem[]
  footer?: string
  animate: boolean
  onNavigate: () => void
}

function RecordsBlock({ title, items, footer, animate, onNavigate }: RecordsBlockProps) {
  const reduceMotion = useReducedMotion()
  const stagger = animate && !reduceMotion
  return (
    <div className="flex flex-col gap-2">
      {title ? <p className="text-xs font-medium text-muted-foreground">{title}</p> : null}
      <ItemGroup>
        {items.map((item, i) => (
          <motion.div
            key={`${item.id}-${i}`}
            role="listitem"
            initial={stagger ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: i * 0.035, ease: EASE }}
          >
            <RecordRow item={item} onNavigate={onNavigate} />
          </motion.div>
        ))}
      </ItemGroup>
      {footer ? <p className="px-1 text-xs text-muted-foreground">{footer}</p> : null}
    </div>
  )
}

function RecordMediaView({ media }: { media: RecordMedia }) {
  if (media.kind === "worker") return <WorkerAvatar worker={media.worker} size="sm" />
  if (media.kind === "venue") return <Mark label={media.label} hue={media.hue} size="sm" />
  const Icon = ICONS[media.icon]
  return (
    <span className={cn("flex size-6 items-center justify-center rounded-md", TONE_CHIP[media.tone ?? "muted"])}>
      <Icon className="size-3.5" aria-hidden />
    </span>
  )
}

function RecordRow({ item, onNavigate }: { item: RecordItem; onNavigate: () => void }) {
  const body = (
    <>
      {item.media ? (
        <ItemMedia>
          <RecordMediaView media={item.media} />
        </ItemMedia>
      ) : null}
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full">
          <span className="truncate">{item.title}</span>
        </ItemTitle>
        {item.subtitle ? <ItemDescription className="line-clamp-1">{item.subtitle}</ItemDescription> : null}
      </ItemContent>
      {item.badge || item.meta ? (
        <ItemActions className="shrink-0 flex-col items-end gap-1">
          {item.meta ? <span className="text-xs font-medium tabular">{item.meta}</span> : null}
          {item.badge ? <StatusBadge tone={item.badge.tone}>{item.badge.label}</StatusBadge> : null}
        </ItemActions>
      ) : null}
    </>
  )
  if (item.href) {
    return (
      <Item asChild variant="outline" size="xs" className="flex-nowrap bg-card">
        <Link
          href={item.href}
          onClick={(e) => {
            if (!isModifiedClick(e)) onNavigate()
          }}
        >
          {body}
        </Link>
      </Item>
    )
  }
  return (
    <Item variant="outline" size="xs" className="flex-nowrap bg-card">
      {body}
    </Item>
  )
}

function ActionsBlock({ items, busy, onNavigate, onPrompt, onDraft }: { items: ActionItem[] } & ReplyHandlers) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((action) => {
        const Icon = action.icon ? ICONS[action.icon] : null
        const icon = Icon ? <Icon data-icon="inline-start" /> : null
        const variant = action.primary ? "default" : "outline"
        const { href, draft, prompt } = action
        if (href) {
          return (
            <Button key={action.label} asChild size="sm" variant={variant}>
              <Link
                href={href}
                onClick={(e) => {
                  if (!isModifiedClick(e)) onNavigate()
                }}
              >
                {icon}
                {action.label}
              </Link>
            </Button>
          )
        }
        if (draft !== undefined) {
          return (
            <Button key={action.label} size="sm" variant={variant} onClick={() => onDraft(draft)}>
              {icon ?? <SquarePenIcon data-icon="inline-start" />}
              {action.label}
            </Button>
          )
        }
        if (prompt !== undefined) {
          return (
            <Button key={action.label} size="sm" variant={variant} disabled={busy} onClick={() => onPrompt(prompt)}>
              {icon}
              {action.label}
            </Button>
          )
        }
        return null
      })}
    </div>
  )
}

function ChipsBlock({ label, items, onPrompt, disabled }: { label?: string; items: { label: string; prompt: string }[]; onPrompt: (prompt: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {label ? <p className="text-xs font-medium text-muted-foreground">{label}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {items.map((chip) => (
          <Button key={chip.prompt} variant="outline" size="xs" disabled={disabled} onClick={() => onPrompt(chip.prompt)} className={CHIP_BUTTON}>
            {chip.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

function DraftFigure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular">{value}</dd>
      {hint ? <dd className="truncate text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  )
}

function DraftBlock({ draft, busy, onPrompt, onDraft }: { draft: DraftCard } & ReplyHandlers) {
  const complete = draft.missing.length === 0
  const estimate = draft.estimate
  const timed = draft.chips.some((chip) => chip.kind === "time")
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <SquarePenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{draft.title}</span>
        </CardTitle>
        <CardDescription className="text-xs">{complete ? "Ready to review in the composer" : `${plural(draft.missing.length, "detail")} to add`}</CardDescription>
        <CardAction>
          <StatusBadge tone={complete ? "success" : "warning"}>{complete ? "Complete" : "Draft"}</StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {draft.chips.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Details understood">
            {draft.chips.map((chip) => {
              const Icon = CHIP_ICON[chip.kind]
              return (
                <li key={`${chip.kind}-${chip.label}`}>
                  <Badge variant="secondary" className="h-6 rounded-md font-normal">
                    <Icon data-icon="inline-start" aria-hidden />
                    {chip.label}
                  </Badge>
                </li>
              )
            })}
          </ul>
        ) : null}
        {draft.missing.length ? (
          <ul className="flex flex-col gap-1.5" aria-label="Still needed">
            {draft.missing.map((label) => (
              <li key={label} className="flex items-center gap-2 text-xs text-warning-foreground dark:text-warning">
                <CircleDashedIcon className="size-3.5 shrink-0" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        ) : null}
        {draft.venueChoices?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {draft.venueChoices.map((choice) => (
              <Button key={choice.label} variant="outline" size="xs" disabled={busy} onClick={() => onPrompt(choice.prompt)} className="pl-1">
                <Mark label={choice.label} hue={choice.hue} size="xs" className="size-4 rounded-[4px] text-[8px]" />
                {choice.label}
              </Button>
            ))}
          </div>
        ) : null}
        {estimate ? (
          <dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
            <DraftFigure label="Bill rate" value={rate(estimate.billRate)} />
            <DraftFigure
              label="Per shift"
              value={timed ? hours(estimate.hoursPerShift) : "–"}
              hint={!timed ? "needs times" : estimate.breakMinutes ? `after ${estimate.breakMinutes}m break` : "no break"}
            />
            <DraftFigure
              label="Estimate"
              value={estimate.total !== undefined ? money(estimate.total, true) : "–"}
              hint={estimate.total !== undefined ? plural(estimate.slots, "shift") : "needs details"}
            />
          </dl>
        ) : null}
        {draft.notes.length ? (
          <ul className="flex flex-col gap-1.5">
            {draft.notes.map((note) => (
              <li key={note.text} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                <span aria-hidden className={cn("mt-[0.45rem] size-1.5 shrink-0 rounded-full", TONE_DOT[note.tone])} />
                {note.text}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2">
        <span className="text-xs text-muted-foreground">Nothing is posted until you submit</span>
        <Button size="sm" onClick={() => onDraft(draft.query)}>
          Open in composer
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  )
}

// Prompts ----------------------------------------------------------------------------

function suggestionIcon(prompt: string): LucideIcon {
  const p = prompt.toLowerCase()
  if (/^(need|book|post)\b/.test(p)) return WandSparklesIcon
  if (/attention/.test(p)) return InboxIcon
  if (/spen[dt]|cost/.test(p)) return CircleDollarSignIcon
  if (/reliab|best|top/.test(p)) return StarIcon
  if (/complian/.test(p)) return ShieldCheckIcon
  if (/approv/.test(p)) return ClipboardCheckIcon
  if (/\bcap\b|390/.test(p)) return HourglassIcon
  if (/disput/.test(p)) return MessageSquareWarningIcon
  if (/payment|invoice/.test(p)) return BanknoteIcon
  if (/shift|fill/.test(p)) return CalendarClockIcon
  return MessageCircleQuestionIcon
}

interface PromptListProps {
  items: string[]
  onPick: (prompt: string) => void
  disabled?: boolean
}

export function SuggestionList({ items, onPick, disabled }: PromptListProps) {
  return (
    <ItemGroup className="stagger" aria-label="Suggested questions">
      {items.map((prompt) => {
        const Icon = suggestionIcon(prompt)
        return (
          <div key={prompt} role="listitem">
            <Item asChild variant="outline" size="sm" className="flex-nowrap bg-card text-left hover:bg-muted disabled:pointer-events-none disabled:opacity-50">
              <button type="button" disabled={disabled} onClick={() => onPick(prompt)}>
                <ItemMedia variant="icon" className="text-muted-foreground">
                  <Icon aria-hidden />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <span className="text-sm leading-snug text-pretty">{prompt}</span>
                </ItemContent>
                <ArrowUpRightIcon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-visible/item:opacity-100"
                />
              </button>
            </Item>
          </div>
        )
      })}
    </ItemGroup>
  )
}

export function FollowUps({ items, onPick, disabled }: PromptListProps) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      role="group"
      aria-label="Suggested follow-ups"
      className="flex flex-wrap gap-1.5"
      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      {items.map((prompt) => (
        <Button key={prompt} variant="outline" size="xs" disabled={disabled} onClick={() => onPick(prompt)} className={cn(CHIP_BUTTON, "text-muted-foreground")}>
          <CornerDownRightIcon data-icon="inline-start" />
          {prompt}
        </Button>
      ))}
    </motion.div>
  )
}

export function ThinkingIndicator() {
  const reduceMotion = useReducedMotion()
  return (
    <div role="status" className="flex h-6 items-center gap-2 text-sm">
      <span className="flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-muted-foreground"
            initial={{ opacity: 0.35 }}
            animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
            transition={reduceMotion ? undefined : { duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </span>
      <span className="text-shimmer">Thinking…</span>
    </div>
  )
}
