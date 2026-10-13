import type { Tone } from "@/components/app/status-badge"
import { formatDate } from "@/lib/dates"
import { plural } from "@/lib/format"
import type { ISODate, Supplier } from "@/lib/types"

import { coiStatus, type CoiState, type Grade } from "../program-data"

export const GRADE_STYLE: Record<Grade, string> = {
  A: "bg-success/12 text-success dark:bg-success/18",
  B: "bg-info/12 text-info dark:bg-info/18",
  C: "bg-warning/18 text-warning-foreground dark:bg-warning/20 dark:text-warning",
}

export type MetricTone = "ok" | "warning" | "danger"

export const METRIC_TEXT: Record<MetricTone, string> = {
  ok: "",
  warning: "text-warning-foreground dark:text-warning",
  danger: "text-destructive",
}

export const METRIC_STROKE: Record<MetricTone, { stroke: string; fill: string }> = {
  ok: { stroke: "stroke-primary", fill: "fill-primary/10" },
  warning: { stroke: "stroke-warning", fill: "fill-warning/15" },
  danger: { stroke: "stroke-destructive", fill: "fill-destructive/10" },
}

export function noShowTone(rate: number): MetricTone {
  if (rate > 0.04) return "danger"
  if (rate > 0.025) return "warning"
  return "ok"
}

export function onTimeTone(rate: number): MetricTone {
  if (rate < 0.88) return "danger"
  if (rate < 0.93) return "warning"
  return "ok"
}

export function disputeTone(rate: number): MetricTone {
  if (rate > 0.02) return "danger"
  if (rate > 0.01) return "warning"
  return "ok"
}

export const COI_TONE: Record<CoiState, Tone> = { valid: "success", expiring: "warning", expired: "danger" }

export function coiSummary(supplier: Pick<Supplier, "coiExpires">, today: ISODate): { state: CoiState; tone: Tone; label: string; short: string } {
  const { state, days } = coiStatus(supplier, today)
  if (state === "expired") {
    return { state, tone: COI_TONE[state], label: `Expired ${formatDate(supplier.coiExpires, "MMM d")} · ${plural(-days, "day")} ago`, short: "COI expired" }
  }
  if (state === "expiring") {
    return {
      state,
      tone: COI_TONE[state],
      label: days === 0 ? "Expires today" : `Expires ${formatDate(supplier.coiExpires, "MMM d")} · in ${plural(days, "day")}`,
      short: days === 0 ? "COI expires today" : `COI expires in ${plural(days, "day")}`,
    }
  }
  return { state, tone: COI_TONE[state], label: `Valid through ${formatDate(supplier.coiExpires, "MMM d, yyyy")}`, short: "COI valid" }
}

export function distributionStatus(supplier: Supplier, today: ISODate): { tone: Tone; label: string; detail: string } {
  if (!supplier.active) return { tone: "muted", label: "Paused", detail: "Paused by the program office, no new requests." }
  if (supplier.coiExpires < today) return { tone: "danger", label: "Excluded", detail: "Certificate of insurance expired, excluded from new requests." }
  return { tone: "success", label: "Receiving requests", detail: "In the distribution cascade for every market it serves." }
}

export function formatWindow(minutes: number): string {
  if (minutes > 0 && minutes % 60 === 0) return `${minutes / 60}-hour`
  return `${minutes}-minute`
}
