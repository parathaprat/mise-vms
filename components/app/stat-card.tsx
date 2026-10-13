import Link from "next/link"
import type * as React from "react"
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon, type LucideIcon } from "lucide-react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface Trend {
  label: string
  direction: "up" | "down" | "flat"
  good?: boolean
}

interface StatCardProps {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: LucideIcon
  trend?: Trend
  href?: string
  footer?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

export function TrendPill({ trend }: { trend: Trend }) {
  const Icon = trend.direction === "up" ? ArrowUpRightIcon : trend.direction === "down" ? ArrowDownRightIcon : MinusIcon
  const good = trend.good ?? trend.direction === "up"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular",
        trend.direction === "flat"
          ? "bg-muted text-muted-foreground"
          : good
            ? "bg-success/12 text-success"
            : "bg-destructive/10 text-destructive"
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">{trend.direction === "up" ? "Increase" : trend.direction === "down" ? "Decrease" : "No change"}: </span>
      {trend.label}
    </span>
  )
}

export function StatCard({ label, value, hint, icon: Icon, trend, href, footer, className, children }: StatCardProps) {
  const body = (
    <Card className={cn("h-full gap-3 px-4 py-4", href && "lift hover:ring-foreground/20", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {Icon ? (
            <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-foreground/80">
              <Icon className="size-3.5" aria-hidden />
            </span>
          ) : null}
          {label}
        </div>
        {trend ? <TrendPill trend={trend} /> : null}
      </div>
      <div className="flex flex-col gap-1">
        <div className="font-heading text-2xl font-semibold tracking-tight tabular">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      {children}
      {footer ? <div className="mt-auto border-t pt-3 text-xs text-muted-foreground">{footer}</div> : null}
    </Card>
  )
  if (href) {
    return (
      <Link href={href} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        {body}
      </Link>
    )
  }
  return body
}
