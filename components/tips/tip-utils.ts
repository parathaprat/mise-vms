import { addDays, isWeekend, nextMonday, setHours, startOfDay } from "date-fns"

import { parseLocal, toISODate } from "@/lib/dates"
import type { TipBatch, TipBatchStatus, TipLine, Worker } from "@/lib/types"

/** Positions that share event tip pools by default (mirrors the seeded tip positions). */
export const TIP_ELIGIBLE_POSITIONS = new Set([
  "p-cash-bartender",
  "p-suite-bartender",
  "p-concessions",
  "p-suite-attendant",
  "p-banquet-server",
  "p-barback",
])

export type TipMethod = TipBatch["method"]

export const TIP_STATUS_LABEL: Record<TipBatchStatus, string> = {
  Draft: "Draft",
  "Pending approval": "Pending approval",
  Approved: "Approved",
  Paid: "Paid",
  Rejected: "Returned",
}

export function linesTotal(lines: Pick<TipLine, "amount">[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100
}

export function linesHours(lines: Pick<TipLine, "hours">[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.hours, 0) * 100) / 100
}

/** Parses a currency string ("$1,042.50", "42", ".5") into integer cents; null when unreadable. */
export function toCents(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, "")
  if (cleaned === "") return 0
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null
  return Math.round(Number(cleaned) * 100)
}

export function centsToInput(cents: number): string {
  return cents === 0 ? "" : (cents / 100).toFixed(2)
}

/**
 * Splits a pool proportionally to hours worked, in whole cents. Shares are floored and the
 * leftover cents go to the largest share so the lines always add up to the pool exactly.
 */
export function splitByHours(totalCents: number, lines: { workerId: string; hours: number }[]): Map<string, number> {
  const out = new Map<string, number>()
  const totalHours = lines.reduce((sum, l) => sum + Math.max(0, l.hours), 0)
  if (totalCents <= 0 || totalHours <= 0) {
    for (const l of lines) out.set(l.workerId, 0)
    return out
  }
  let allocated = 0
  let largest: { workerId: string; cents: number } | null = null
  for (const l of lines) {
    const cents = Math.floor((totalCents * Math.max(0, l.hours)) / totalHours)
    out.set(l.workerId, cents)
    allocated += cents
    if (!largest || cents > largest.cents) largest = { workerId: l.workerId, cents }
  }
  const remainder = totalCents - allocated
  if (largest && remainder > 0) out.set(largest.workerId, largest.cents + remainder)
  return out
}

/** Pros are paid the next business day after approval (weekends skipped). */
export function nextBusinessDay(date: string): string {
  let d = addDays(parseLocal(date.slice(0, 10)), 1)
  while (isWeekend(d)) d = addDays(d, 1)
  return toISODate(d)
}

/** Mirrors the store's invoice run: weekly supplier invoices are issued Mondays at 6:00 AM. */
export function nextInvoiceRun(now: Date): Date {
  const todayRun = setHours(startOfDay(now), 6)
  if (now.getDay() === 1 && now < todayRun) return todayRun
  return setHours(nextMonday(startOfDay(now)), 6)
}

export function isPolicyApproval(approvedBy?: string): boolean {
  return !!approvedBy && approvedBy.startsWith("Policy")
}

export function formatTurnaround(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`
  if (hours < 10) return `${hours.toFixed(1).replace(/\.0$/, "")}h`
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

// Pasted captain sheets ---------------------------------------------------------

export interface PasteResult {
  amounts: Map<string, number>
  rows: number
  matched: number
  unmatched: string[]
  warnings: string[]
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const SPACED = /^(.*\S)\s+(-?\s*\$?\s*-?[\d,]*\.?\d+)$/
const HEADER_ROW = /name|amount|tip/i
const TOTAL_ROW = /^(total|subtotal|sum|pool)\b/i

interface PasteCell {
  name: string
  cents: number
}

/**
 * Every plausible name/amount split of a row, most likely first. A comma can be a delimiter or a
 * thousands separator ("Maria Lopez 1,042.75"), so the caller keeps the first split whose name
 * matches a Pro.
 */
function splitRow(line: string): PasteCell[] {
  const likely: PasteCell[] = []
  const unlikely: PasteCell[] = []
  const push = (name: string, amount: string, target = likely) => {
    const cents = amount.trim() ? toCents(amount) : null
    const cleaned = name.replace(/^["'\s]+|["'\s,;]+$/g, "")
    if (cents !== null && cleaned) target.push({ name: cleaned, cents })
  }
  if (line.includes("\t")) {
    const cells = line
      .split("\t")
      .map((c) => c.trim())
      .filter(Boolean)
    const nameCells = cells.slice(0, -1).filter((c) => toCents(c) === null)
    if (cells.length >= 2) push(nameCells.join(" "), cells[cells.length - 1])
    return likely
  }
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "," && line[i] !== ";") continue
    const betweenDigits = /\d/.test(line[i - 1] ?? "") && /\d/.test(line[i + 1] ?? "")
    push(line.slice(0, i), line.slice(i + 1), betweenDigits ? unlikely : likely)
  }
  const spaced = line.match(SPACED)
  if (spaced) push(spaced[1], spaced[2])
  return [...likely, ...unlikely]
}

/**
 * Reads "Name, 42.50" or "Name<TAB>42.50" rows (as copied from a spreadsheet) and matches names
 * case-insensitively against preferred and legal names, "Last, First" order, a unique single
 * first or last name, or Pro IDs.
 */
export function parseTipPaste(text: string, workers: Worker[]): PasteResult {
  // null marks a key shared by more than one Pro.
  const byName = new Map<string, string | null>()
  const byWord = new Map<string, string | null>()
  const addKey = (map: Map<string, string | null>, key: string, workerId: string) => {
    const k = normalizeName(key)
    if (!k) return
    const existing = map.get(k)
    map.set(k, existing === undefined || existing === workerId ? workerId : null)
  }
  for (const w of workers) {
    const firsts = [w.firstName, ...(w.preferredName ? [w.preferredName] : [])]
    for (const first of firsts) {
      addKey(byName, `${first} ${w.lastName}`, w.id)
      addKey(byName, `${w.lastName} ${first}`, w.id)
      addKey(byWord, first, w.id)
    }
    addKey(byWord, w.lastName, w.id)
    addKey(byName, w.id, w.id)
  }

  const resolve = (name: string): string | null | undefined => {
    const key = normalizeName(name)
    if (!key) return undefined
    const direct = byName.get(key)
    return direct !== undefined || key.includes(" ") ? direct : byWord.get(key)
  }

  const amounts = new Map<string, number>()
  const unmatched: string[] = []
  const warnings: string[] = []
  const ambiguous: string[] = []
  const unreadable: string[] = []
  let rows = 0
  let matched = 0

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const options = splitRow(line)
    if (!options.length) {
      if (!HEADER_ROW.test(line)) unreadable.push(line)
      continue
    }
    if (options.some((o) => TOTAL_ROW.test(o.name))) continue
    let pick = options[0]
    let workerId: string | null | undefined
    for (const option of options) {
      const id = resolve(option.name)
      if (id === undefined) continue
      pick = option
      workerId = id
      break
    }
    rows++
    if (pick.cents < 0) {
      warnings.push(`Skipped a negative amount for ${pick.name}.`)
      continue
    }
    if (workerId === null) {
      ambiguous.push(pick.name)
      continue
    }
    if (!workerId) {
      unmatched.push(pick.name)
      continue
    }
    matched++
    amounts.set(workerId, (amounts.get(workerId) ?? 0) + pick.cents)
  }

  if (ambiguous.length) warnings.push(`More than one Pro matches ${ambiguous.join(", ")}: use full names or Pro IDs.`)
  if (unreadable.length) {
    warnings.push(
      `Couldn't read ${unreadable.length === 1 ? "a row" : `${unreadable.length} rows`}: “${unreadable[0]}”${unreadable.length > 1 ? " …" : ""}. Use “Name, 42.50”.`
    )
  }
  return { amounts, rows, matched, unmatched, warnings }
}
