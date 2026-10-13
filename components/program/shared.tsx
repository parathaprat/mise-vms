"use client"

import Link from "next/link"
import * as React from "react"
import { LockIcon, type LucideIcon } from "lucide-react"
import { Slider as SliderPrimitive } from "radix-ui"

import { hueStyle, Mark } from "@/components/app/identity"
import { EmptyState } from "@/components/app/misc"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useNow } from "@/hooks/use-demo"
import { formatDate, toISODate } from "@/lib/dates"
import { money } from "@/lib/format"
import { PERSONAS } from "@/lib/reference"
import { cn } from "@/lib/utils"

import { budgetTone } from "./program-data"

export function useToday(): string {
  const now = useNow()
  return toISODate(now)
}

/** Stable identity hue for people who aren't workers (approvers, editors); personas keep their own hue. */
export function nameHue(name: string): number {
  const persona = Object.values(PERSONAS).find((p) => p.name === name)
  if (persona) return persona.hue
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

export function PersonChip({
  name,
  prefix,
  className,
}: {
  name: string
  prefix?: string
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex rounded-[5px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            className
          )}
          tabIndex={0}
        >
          <Mark label={name} hue={nameHue(name)} size="xs" />
          <span className="sr-only">
            {prefix ? `${prefix} ` : ""}
            {name}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {prefix ? `${prefix} ` : ""}
        {name}
      </TooltipContent>
    </Tooltip>
  )
}

export function shortDate(date: string, today: string): string {
  return formatDate(
    date,
    date.slice(0, 4) === today.slice(0, 4) ? "MMM d" : "MMM d, yyyy"
  )
}

/** `onOpenAutoFocus` handler: focus the panel itself rather than focusing (and selecting) its first field. */
export function focusPanelOnOpen(event: Event) {
  event.preventDefault()
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
}

/** Dialog/sheet state that keeps the last value mounted through the close animation. */
export function useDialogState<T>() {
  const [state, setState] = React.useState<{
    value: T | null
    open: boolean
    nonce: number
  }>({
    value: null,
    open: false,
    nonce: 0,
  })
  const show = React.useCallback(
    (value: T) => setState((s) => ({ value, open: true, nonce: s.nonce + 1 })),
    []
  )
  const onOpenChange = React.useCallback(
    (open: boolean) => setState((s) => ({ ...s, open })),
    []
  )
  return {
    value: state.value,
    open: state.open,
    nonce: state.nonce,
    show,
    onOpenChange,
  }
}

export function RestrictedState({
  title,
  description,
  href = "/",
  cta = "Back to home",
}: {
  title: string
  description: React.ReactNode
  href?: string
  cta?: string
}) {
  return (
    <EmptyState
      icon={LockIcon}
      title={title}
      description={description}
      className="min-h-80 bg-card"
      action={
        <Button variant="outline" asChild>
          <Link href={href}>{cta}</Link>
        </Button>
      }
    />
  )
}

const TILE_SIZE = {
  sm: "size-7 rounded-md [&>svg]:size-3.5",
  md: "size-8 rounded-lg [&>svg]:size-4",
  lg: "size-10 rounded-xl [&>svg]:size-5",
}

export function IconTile({
  icon: Icon,
  hue,
  size = "md",
  className,
}: {
  icon: LucideIcon
  hue?: number
  size?: keyof typeof TILE_SIZE
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        hue === undefined
          ? "bg-primary/10 text-primary dark:bg-primary/20"
          : "hue-chip",
        TILE_SIZE[size],
        className
      )}
      style={hue === undefined ? undefined : hueStyle(hue)}
    >
      <Icon />
    </span>
  )
}

/** Kept so policy sections can pass a note without crowding the partner view. */
export function ReplacesNote({
  children,
}: {
  children: React.ReactNode
  className?: string
}) {
  void children
  return null
}

export function BudgetBar({
  committed,
  pending = 0,
  budget,
  className,
}: {
  committed: number
  pending?: number
  budget: number
  className?: string
}) {
  const ratio = budget > 0 ? committed / budget : 0
  const tone = budgetTone(ratio)
  const committedPct = Math.min(100, ratio * 100)
  const pendingPct =
    budget > 0 ? Math.min(100 - committedPct, (pending / budget) * 100) : 0
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={budget}
      aria-valuenow={Math.round(committed)}
      aria-label={`${money(committed)} of ${money(budget)} committed`}
      className={cn(
        "relative h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-muted",
        className
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500",
          tone === "over"
            ? "bg-destructive"
            : tone === "warning"
              ? "bg-warning"
              : "bg-primary"
        )}
        style={{ width: `${committedPct}%` }}
      />
      {pendingPct > 0 ? (
        <div
          className="absolute inset-y-0 rounded-full bg-primary/30 transition-[width,left] duration-500"
          style={{ left: `${committedPct}%`, width: `${pendingPct}%` }}
        />
      ) : null}
    </div>
  )
}

/** Horizontal single-value slider. The accessible name goes on the thumb, which is the `role="slider"` element. */
export function LabeledSlider({
  className,
  "aria-labelledby": labelledBy,
  ...props
}: Omit<React.ComponentProps<typeof SliderPrimitive.Root>, "orientation">) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none items-center select-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-primary select-none"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        aria-labelledby={labelledBy}
        className="relative block size-3 shrink-0 rounded-full border border-ring bg-background ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  )
}

export function signedMoney(value: number, cents = false): string {
  if (Math.abs(value) < 0.005) return money(0, cents)
  return `${value > 0 ? "+" : "−"}${money(Math.abs(value), cents)}`
}

export function RateText({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  return (
    <span className={cn("tabular", className)}>
      {money(value, true)}
      <span className="font-normal text-muted-foreground">/hr</span>
    </span>
  )
}

export function SectionHeading({
  id,
  title,
  description,
  action,
  className,
}: {
  id?: string
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2
          id={id}
          className="font-heading text-base font-semibold tracking-tight"
        >
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  )
}
