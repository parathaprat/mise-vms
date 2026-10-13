"use client"

import type * as React from "react"
import type { LucideIcon } from "lucide-react"

import { EmptyState } from "@/components/app/misc"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface ChartEmpty {
  icon: LucideIcon
  title: string
  description?: string
}

interface ChartCardProps {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  footer?: React.ReactNode
  empty?: ChartEmpty | null
  className?: string
  contentClassName?: string
  children?: React.ReactNode
}

export function ChartCard({ title, description, action, footer, empty, className, contentClassName, children }: ChartCardProps) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={cn("flex flex-1 flex-col", contentClassName)}>
        {empty ? (
          <EmptyState
            icon={empty.icon}
            title={empty.title}
            description={empty.description}
            className="min-h-[260px] flex-1 border-border bg-muted/30"
          />
        ) : (
          children
        )}
      </CardContent>
      {footer && !empty ? (
        <CardFooter className="flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{footer}</CardFooter>
      ) : null}
    </Card>
  )
}

export function TooltipRow({ color, label, value }: { color?: string; label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        {color ? <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-medium text-foreground tabular">{value}</span>
    </div>
  )
}

export function LegendSwatch({ color, label, className }: { color: string; label: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className="size-2 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden />
      {label}
    </span>
  )
}
