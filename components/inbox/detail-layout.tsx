"use client"

import Link from "next/link"
import * as React from "react"
import { ArrowUpRightIcon, CircleCheckIcon, SparklesIcon, type LucideIcon } from "lucide-react"

import { StatusBadge } from "@/components/app/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Kbd } from "@/components/ui/kbd"
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { money } from "@/lib/format"
import type { InboxItem, Lookups } from "@/lib/selectors"
import type { ISODate, Persona } from "@/lib/types"
import { cn } from "@/lib/utils"

import type { PrimaryAction } from "./actions"
import { InboxTime } from "./inbox-time"
import { AMOUNT_LABEL, KIND_META, PRIORITY_TONE, openHref } from "./kinds"
import { ScrollPane } from "./scroll-pane"

export interface DetailContext {
  persona: Persona
  lookups: Lookups
  today: ISODate
  variant: "pane" | "sheet"
  primary: PrimaryAction | null
  runPrimary: () => void
  /** Runs a store mutation, then moves the selection on if the item is resolved. */
  commit: (mutation: () => unknown) => void
  askCopilot: (prompt: string) => void
}

export interface KindDetailProps {
  item: InboxItem
  ctx: DetailContext
}

export function DetailShell({
  item,
  ctx,
  children,
  footer,
}: KindDetailProps & {
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const meta = KIND_META[item.kind]
  const Icon = meta.icon
  const sheet = ctx.variant === "sheet"
  const heading = (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn("flex size-6 items-center justify-center rounded-md", PRIORITY_TONE[item.priority])}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="font-medium text-foreground">{meta.label}</span>
        {item.priority === "high" ? <StatusBadge tone="danger">Urgent</StatusBadge> : null}
        {item.priority === "low" ? (
          <StatusBadge tone="muted" dot={false}>
            FYI
          </StatusBadge>
        ) : null}
        <InboxTime item={item} className="ml-auto" />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          {sheet ? (
            <SheetTitle className="text-balance">{item.title}</SheetTitle>
          ) : (
            <CardTitle role="heading" aria-level={2} className="text-balance">
              {item.title}
            </CardTitle>
          )}
          {sheet ? <SheetDescription>{item.subtitle}</SheetDescription> : <CardDescription>{item.subtitle}</CardDescription>}
        </div>
        {item.amount != null ? (
          <div className="flex shrink-0 flex-col items-end">
            <span className="font-heading text-lg font-semibold tabular">{money(item.amount, true)}</span>
            {AMOUNT_LABEL[item.kind] ? <span className="text-xs text-muted-foreground">{AMOUNT_LABEL[item.kind]}</span> : null}
          </div>
        ) : null}
      </div>
    </>
  )
  const body = (
    <ScrollPane>
      <div className="flex flex-col gap-6 p-4 sm:px-5">{children}</div>
    </ScrollPane>
  )

  if (sheet) {
    return (
      <div className="@container/detail flex min-h-0 flex-1 flex-col">
        <SheetHeader className="gap-3 border-b pr-12">{heading}</SheetHeader>
        {body}
        {footer ? <SheetFooter className="mt-0 flex-row flex-wrap items-center gap-2 border-t p-3">{footer}</SheetFooter> : null}
      </div>
    )
  }
  return (
    <div className="@container/detail flex min-h-0 flex-1 flex-col">
      <CardHeader className="flex flex-col items-stretch gap-3 border-b pt-4 sm:px-5">{heading}</CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0 sm:px-0">{body}</CardContent>
      {footer ? <CardFooter className="flex-wrap gap-2 px-4 py-3 sm:px-5">{footer}</CardFooter> : null}
    </div>
  )
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A static, non-announcing note. Detail panes swap on every j/k, so `role="alert"` would be noise. */
export function Callout({
  icon: Icon,
  title,
  children,
  destructive,
  className,
}: {
  icon: LucideIcon
  title?: React.ReactNode
  children?: React.ReactNode
  destructive?: boolean
  className?: string
}) {
  return (
    <Alert role="note" variant={destructive ? "destructive" : "default"} className={className}>
      <Icon />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      {children ? <AlertDescription>{children}</AlertDescription> : null}
    </Alert>
  )
}

export interface StatItem {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
}

export function Stats({ items }: { items: StatItem[] }) {
  return (
    <dl className={cn("grid divide-x rounded-lg border", items.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {items.map((s) => (
        <div key={s.label} className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
          <dt className="truncate text-xs text-muted-foreground">{s.label}</dt>
          <dd className="truncate font-heading text-base font-semibold tabular">{s.value}</dd>
          {s.hint ? <dd className="truncate text-xs text-muted-foreground">{s.hint}</dd> : null}
        </div>
      ))}
    </dl>
  )
}

/** A grid of `KeyValue`s that widens to three columns when the pane has room. */
export function Facts({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 @lg/detail:grid-cols-3", className)}>{children}</dl>
}

export function List({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <ul aria-label={label} className={cn("flex flex-col divide-y rounded-lg border", className)}>
      {children}
    </ul>
  )
}

export function ListRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <li className={cn("flex min-w-0 items-center gap-3 px-3 py-2.5", className)}>{children}</li>
}

export function PrimaryButton({ ctx, label, disabled }: { ctx: DetailContext; label?: string; disabled?: boolean }) {
  const action = ctx.primary
  if (!action) return null
  const Icon = action.icon
  const content = (
    <>
      <Icon data-icon="inline-start" />
      {label ?? action.label}
      {ctx.variant === "pane" ? <Kbd className="ml-1">A</Kbd> : null}
    </>
  )
  if (action.type === "navigate") {
    return (
      <Button asChild>
        <Link href={action.href}>{content}</Link>
      </Button>
    )
  }
  return (
    <Button onClick={ctx.runPrimary} disabled={disabled}>
      {content}
    </Button>
  )
}

/** Opens the item where Enter would take you, so the ↵ hint is always truthful. */
export function OpenButton({ item, ctx, label }: KindDetailProps & { label: string }) {
  return (
    <Button variant="outline" asChild>
      <Link href={openHref(item)}>
        {label}
        {ctx.variant === "pane" ? <Kbd className="ml-1">↵</Kbd> : <ArrowUpRightIcon data-icon="inline-end" />}
      </Link>
    </Button>
  )
}

export function CopilotButton({ ctx, prompt }: { ctx: DetailContext; prompt: string }) {
  return (
    <Button variant="ghost" className="ml-auto" onClick={() => ctx.askCopilot(prompt)}>
      <SparklesIcon data-icon="inline-start" />
      Ask Copilot
    </Button>
  )
}

/** Fallback when the record behind an item vanished between renders. */
export function MissingDetail({ item, ctx }: KindDetailProps) {
  return (
    <DetailShell item={item} ctx={ctx}>
      <Callout icon={CircleCheckIcon} title="Already handled">
        This was just resolved elsewhere and drops out of your inbox on the next refresh.
      </Callout>
    </DetailShell>
  )
}

interface NoteFormProps {
  label: string
  description?: string
  placeholder?: string
  submitLabel: string
  destructive?: boolean
  /** Minimum characters; 0 makes the note optional. */
  minLength?: number
  onCancel: () => void
  onSubmit: (note: string) => void
}

/** Inline "decline / return with a note" composer that replaces a detail's footer actions. */
export function NoteForm({ label, description, placeholder, submitLabel, destructive, minLength = 5, onCancel, onSubmit }: NoteFormProps) {
  const id = React.useId()
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const [note, setNote] = React.useState("")
  const [submitted, setSubmitted] = React.useState(false)
  const error = note.trim().length < minLength ? "Add a short note. It's shared with the requester." : undefined
  const invalid = submitted && !!error

  React.useEffect(() => {
    ref.current?.focus()
  }, [])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (error) return
    onSubmit(note.trim())
  }

  return (
    <form onSubmit={submit} noValidate data-inbox-note="" className="w-full">
      <FieldGroup className="gap-3">
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Textarea
            ref={ref}
            id={id}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              } else if (e.key === "Escape") {
                e.preventDefault()
                onCancel()
              }
            }}
            placeholder={placeholder}
            aria-invalid={invalid}
          />
          {invalid ? <FieldError>{error}</FieldError> : description ? <FieldDescription>{description}</FieldDescription> : null}
        </Field>
        <Field orientation="horizontal" className="justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant={destructive ? "destructive" : "default"}>
            {submitLabel}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
