"use client"

import type * as React from "react"
import { ChevronRightIcon, MousePointerClickIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { money } from "@/lib/format"
import { PROGRAM_NAME } from "@/lib/reference"
import type { Position, RateCardEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

import { RateText } from "../shared"
import { cardBreakdown, markupLabel, metroLabel } from "./rate-format"

interface FeeWaterfallProps {
  card: RateCardEntry
  position?: Position
  feePct: number
  overtimeMultiplier: number
}

type StepTone = "default" | "primary" | "success"

export function FeeWaterfall({
  card,
  position,
  feePct,
  overtimeMultiplier,
}: FeeWaterfallProps) {
  const b = cardBreakdown(card, feePct, overtimeMultiplier)
  const steps: {
    label: string
    value: React.ReactNode
    sub: string
    tone: StepTone
  }[] = [
    {
      label: "Pro pay",
      value: <RateText value={b.pay} />,
      sub: "What the Pro earns",
      tone: "default",
    },
    {
      label: `Markup ${markupLabel(b.markupPct)}`,
      value: `+${money(b.markup, true)}`,
      sub: "Supplier burden & margin",
      tone: "default",
    },
    {
      label: "Bill rate",
      value: <RateText value={b.bill} />,
      sub: "What Compass pays",
      tone: "primary",
    },
    {
      label: `Program fee ${feePct}%`,
      value: `−${money(b.fee, true)}`,
      sub: `${PROGRAM_NAME} MSA · supplier-funded`,
      tone: "default",
    },
    {
      label: "Supplier net",
      value: <RateText value={b.net} />,
      sub: "Remitted to the supplier",
      tone: "success",
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Rate anatomy
          <span className="font-normal text-muted-foreground">
            · {position?.title ?? "Position"} · {metroLabel(card.metro)}
          </span>
          <Badge variant="outline" className="font-mono text-muted-foreground">
            v{card.version}
          </Badge>
        </CardTitle>
        <CardDescription>
          Every figure is derived from one card, bill, fee and supplier net
          always reconcile.
        </CardDescription>
        <CardAction className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
          <MousePointerClickIcon className="size-3.5" aria-hidden />
          Click any row to trace its rate
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col items-stretch gap-1.5 lg:flex-row lg:items-center">
          {steps.map((step, i) => (
            <li
              key={step.label}
              className="flex flex-col items-stretch gap-1.5 lg:flex-1 lg:flex-row lg:items-center"
            >
              <div
                className={cn(
                  "flex flex-1 items-center justify-between gap-3 rounded-lg border px-3 py-2.5 lg:flex-col lg:items-start lg:justify-start lg:gap-0.5",
                  step.tone === "primary" &&
                    "border-primary/25 bg-primary/5 dark:bg-primary/10",
                  step.tone === "success" &&
                    "border-success/25 bg-success/8 dark:bg-success/12",
                  step.tone === "default" && "bg-muted/40"
                )}
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {step.label}
                </span>
                <span
                  className={cn(
                    "font-heading text-lg font-semibold tracking-tight tabular",
                    step.tone === "primary" && "text-primary",
                    step.tone === "success" && "text-success"
                  )}
                >
                  {step.value}
                </span>
                <span className="hidden text-xs text-muted-foreground lg:block">
                  {step.sub}
                </span>
              </div>
              {i < steps.length - 1 ? (
                <ChevronRightIcon
                  className="mx-auto size-4 shrink-0 rotate-90 text-muted-foreground/60 lg:rotate-0"
                  aria-hidden
                />
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
      <CardFooter className="flex-col items-start gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          Overtime bills at {overtimeMultiplier}× →{" "}
          <span className="font-medium text-foreground tabular">
            {money(b.ot, true)}/hr
          </span>
        </span>
        <span className="text-pretty">
          Bill rate, program fee and supplier net always come from the same rate
          card.
        </span>
      </CardFooter>
    </Card>
  )
}
