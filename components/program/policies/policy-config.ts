import type { Policies } from "@/lib/types"

export type NumericKey = { [K in keyof Policies]: Policies[K] extends number ? K : never }[keyof Policies]
export type BooleanKey = { [K in keyof Policies]: Policies[K] extends boolean ? K : never }[keyof Policies]

export interface NumericSpec {
  label: string
  min: number
  max: number
  decimals: number
  prefix?: string
  suffix?: string
}

export const NUMERIC_SPECS: Record<NumericKey, NumericSpec> = {
  autoApproveRequestsUnder: { label: "Auto-approve requests up to", min: 0, max: 250_000, decimals: 0, prefix: "$", suffix: "per request" },
  autoApproveHeadcountPct: { label: "Apply increases instantly up to", min: 0, max: 100, decimals: 0, suffix: "%" },
  timesheetAutoApproveHours: { label: "Auto-approve after", min: 12, max: 336, decimals: 0, suffix: "hours" },
  rushLeadTimeHours: { label: "Rush when a request starts within", min: 1, max: 96, decimals: 0, suffix: "hours" },
  tier1ExclusiveMinutes: { label: "Tier 1 exclusive window", min: 0, max: 1440, decimals: 0, suffix: "minutes" },
  contractualHoursCap: { label: "Hours cap per Pro", min: 40, max: 2080, decimals: 0, suffix: "hours" },
  contractualHoursWarnPct: { label: "Warn at", min: 50, max: 99, decimals: 0, suffix: "% of cap" },
  msaFeePct: { label: "Program fee", min: 0, max: 10, decimals: 2, suffix: "% of invoice" },
  overtimeMultiplier: { label: "Overtime bill rate", min: 1, max: 3, decimals: 2, suffix: "× bill rate" },
  overtimeWeeklyThreshold: { label: "Overtime starts after", min: 20, max: 60, decimals: 0, suffix: "hours / week" },
}

export const NUMERIC_KEYS = Object.keys(NUMERIC_SPECS) as NumericKey[]
export const BOOLEAN_KEYS: BooleanKey[] = ["requireTipApproval", "rateChangesRequireProgram", "autoBackfillNoShows", "blockOverCapWorkers"]

export type Draft = Record<NumericKey, string> & Record<BooleanKey, boolean>

export function formatNumeric(value: number, decimals: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals })
}

export function draftFrom(p: Policies): Draft {
  const draft = {} as Draft
  for (const key of NUMERIC_KEYS) draft[key] = formatNumeric(p[key], NUMERIC_SPECS[key].decimals)
  for (const key of BOOLEAN_KEYS) draft[key] = p[key]
  return draft
}

export function parseNumeric(raw: string): number | null {
  const cleaned = raw.replace(/[\s,$%×x]/gi, "")
  if (cleaned === "" || !/^-?\d*\.?\d*$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

export function validateNumeric(key: NumericKey, raw: string): string | null {
  const spec = NUMERIC_SPECS[key]
  const value = parseNumeric(raw)
  const range = `${spec.prefix ?? ""}${formatNumeric(spec.min, spec.decimals)} and ${spec.prefix ?? ""}${formatNumeric(spec.max, spec.decimals)}`
  if (value === null) return `Enter a number between ${range}.`
  if (spec.decimals === 0 && !Number.isInteger(value)) return "Use a whole number."
  if (value < spec.min || value > spec.max) return `Must be between ${range}.`
  return null
}

export function draftErrors(draft: Draft): Partial<Record<NumericKey, string>> {
  const errors: Partial<Record<NumericKey, string>> = {}
  for (const key of NUMERIC_KEYS) {
    const error = validateNumeric(key, draft[key])
    if (error) errors[key] = error
  }
  return errors
}

/** The value a rule currently describes: the draft when it's valid, otherwise the saved policy. */
export function effectiveValue(draft: Draft, saved: Policies, key: NumericKey): number {
  if (validateNumeric(key, draft[key])) return saved[key]
  return parseNumeric(draft[key]) ?? saved[key]
}

export function isChanged(draft: Draft, saved: Policies, key: keyof Policies): boolean {
  if ((BOOLEAN_KEYS as string[]).includes(key)) return draft[key as BooleanKey] !== saved[key as BooleanKey]
  const value = parseNumeric(draft[key as NumericKey])
  return value === null || value !== saved[key as NumericKey]
}

/** Whether the rule a sentence describes differs from the saved policy (invalid drafts don't count). */
export function ruleChanged(draft: Draft, saved: Policies, key: keyof Policies): boolean {
  if ((BOOLEAN_KEYS as string[]).includes(key)) return draft[key as BooleanKey] !== saved[key as BooleanKey]
  return effectiveValue(draft, saved, key as NumericKey) !== saved[key as NumericKey]
}

export function changedKeys(draft: Draft, saved: Policies): (keyof Policies)[] {
  return [...NUMERIC_KEYS, ...BOOLEAN_KEYS].filter((key) => isChanged(draft, saved, key))
}

export function draftPatch(draft: Draft, saved: Policies): Partial<Policies> {
  const patch: Partial<Policies> = {}
  for (const key of NUMERIC_KEYS) {
    if (validateNumeric(key, draft[key])) continue
    const value = parseNumeric(draft[key])
    if (value !== null && value !== saved[key]) patch[key] = value
  }
  for (const key of BOOLEAN_KEYS) {
    if (draft[key] !== saved[key]) patch[key] = draft[key]
  }
  return patch
}

export function duration(minutes: number): string {
  if (minutes <= 0) return "no time"
  if (minutes % 60 === 0) {
    const h = minutes / 60
    return `${h} ${h === 1 ? "hour" : "hours"}`
  }
  return `${minutes} minutes`
}

export function hoursText(hours: number): string {
  return `${formatNumeric(hours, 0)} ${hours === 1 ? "hour" : "hours"}`
}
