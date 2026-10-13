"use client"

import * as React from "react"
import { CheckIcon, CopyIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow } from "@/hooks/use-demo"
import { formatDateTime, timeAgo } from "@/lib/dates"
import { cn } from "@/lib/utils"

export function LiveDot({
  className,
  tone = "success",
  calm = false,
}: {
  className?: string
  tone?: "success" | "warning" | "danger" | "primary"
  /** Soft glow instead of a pulsing ring, for quiet “still alive” cues. */
  calm?: boolean
}) {
  const color = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
    primary: "bg-primary",
  }[tone]
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} aria-hidden>
      {calm ? (
        <span
          className={cn(
            "absolute -inset-1 rounded-full opacity-35 blur-[2px]",
            color
          )}
        />
      ) : (
        <span
          className={cn(
            "absolute inline-flex size-full animate-pulse-ring rounded-full",
            color
          )}
        />
      )}
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  )
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <Empty className={cn("border border-dashed", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}

export function TimeAgo({ value, className }: { value?: string; className?: string }) {
  const now = useNow()
  if (!value) return <span className={className}>–</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={value} className={cn("tabular", className)}>
          {timeAgo(value, now)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatDateTime(value)}</TooltipContent>
    </Tooltip>
  )
}

export function CopyId({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        void navigator.clipboard?.writeText(value).catch(() => undefined)
        setCopied(true)
        toast.success(`Copied ${value}`)
        window.setTimeout(() => setCopied(false), 1200)
      }}
      className={cn(
        "group/copy inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
      aria-label={`Copy ${value}`}
    >
      {value}
      {copied ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3 opacity-0 transition-opacity group-hover/copy:opacity-100" />}
    </button>
  )
}

export function Sparkline({
  values,
  className,
  strokeClassName = "stroke-primary",
  fillClassName = "fill-primary/10",
}: {
  values: number[]
  className?: string
  strokeClassName?: string
  fillClassName?: string
}) {
  const id = React.useId()
  if (values.length < 2) return <svg className={className} aria-hidden />
  const w = 100
  const h = 32
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const)
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
  const area = `${line} L${w},${h} L0,${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-8 w-full", className)} aria-hidden>
      <path d={area} className={fillClassName} data-id={id} />
      <path d={line} className={cn("fill-none", strokeClassName)} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function KeyValue({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}
