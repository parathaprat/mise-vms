import type { Worker } from "@/lib/types"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const currencyCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

export function money(value: number, cents = false): string {
  if (!Number.isFinite(value)) return "–"
  return cents ? currencyCents.format(value) : currency.format(value)
}

export function compactMoney(value: number): string {
  if (!Number.isFinite(value)) return "–"
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 10_000) return `$${Math.round(value / 1000)}k`
  if (abs >= 1_000) return `$${(value / 1000).toFixed(1)}k`
  return currency.format(value)
}

export function rate(value: number): string {
  return `${currencyCents.format(value)}/hr`
}

export function num(value: number): string {
  return integer.format(value)
}

export function hours(value: number): string {
  if (!Number.isFinite(value)) return "–"
  const rounded = Math.round(value * 100) / 100
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2).replace(/0$/, "")}h`
}

export function pct(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "–"
  return `${(value * 100).toFixed(digits)}%`
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${num(count)} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`
}

export function workerName(worker?: Pick<Worker, "firstName" | "lastName" | "preferredName">): string {
  if (!worker) return "Unassigned"
  return `${worker.preferredName ?? worker.firstName} ${worker.lastName}`
}

export function workerLegalName(worker?: Pick<Worker, "firstName" | "lastName">): string {
  if (!worker) return "–"
  return `${worker.firstName} ${worker.lastName}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
