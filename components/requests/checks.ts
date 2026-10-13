import { addDays } from "date-fns"

import type { DemoData } from "@/lib/data"
import { buildAgencyOffers } from "@/lib/agencies"
import {
  formatDate,
  formatTimeRange,
  minutesOf,
  parseLocal,
  scheduledMinutes,
  shiftWindow,
  toISODate,
  weekStartOf,
} from "@/lib/dates"
import { money, num, rate } from "@/lib/format"
import { metroById } from "@/lib/reference"
import {
  estimateRequestCost,
  payableShiftHours,
  requiredCertsFor,
} from "@/lib/rules"
import type {
  CostCenter,
  HireType,
  Position,
  RateCardEntry,
  RequestReason,
  Venue,
} from "@/lib/types"

export interface DraftState {
  venueId: string
  costCenterId: string
  positionId: string
  headcount: number
  hireType: HireType
  favoritesFirst: boolean
  dates: string[]
  startTime: string
  endTime: string
  breakMinutes: number
  eventName: string
  reason: RequestReason
  duties: string
  attire: string
  checkIn: string
  parking: string
  notes: string
  supplierIds: string[]
  requestedWorkerIds: string[]
}

export type CheckStatus = "pass" | "warn" | "fail" | "info"

export interface Check {
  id: string
  label: string
  status: CheckStatus
  detail: string
  href?: string
}

export interface DraftContext {
  data: DemoData
  now: Date
  venue?: Venue
  position?: Position
  costCenter?: CostCenter
  rateCard?: RateCardEntry
}

const PLACEHOLDER = /\b(tbd|tba|n\/a|xxx|todo|lorem)\b|\?\?\?/i

export function draftEstimate(draft: DraftState, card?: RateCardEntry): number {
  if (!card || draft.dates.length === 0 || !draft.startTime || !draft.endTime)
    return 0
  return estimateRequestCost({ ...draft, billRate: card.billRate })
}

export function committedForWeek(
  data: DemoData,
  costCenterId: string,
  anchorDate: string
): number {
  const weekStart = weekStartOf(parseLocal(anchorDate))
  const from = toISODate(weekStart)
  const to = toISODate(addDays(weekStart, 6))
  let total = 0
  for (const r of data.requests) {
    if (
      r.costCenterId !== costCenterId ||
      r.state === "cancelled" ||
      r.state === "draft"
    )
      continue
    const inWeek = r.dates.filter((d) => d >= from && d <= to).length
    if (inWeek === 0) continue
    total += inWeek * r.headcount * payableShiftHours(r) * r.billRate
  }
  return total
}

export function runChecks(draft: DraftState, ctx: DraftContext): Check[] {
  const { data, now, venue, position, costCenter, rateCard } = ctx
  const checks: Check[] = []
  const today = toISODate(now)

  // 1. Rate
  if (!venue || !position) {
    checks.push({
      id: "rate",
      label: "Rate card",
      status: "info",
      detail:
        "Pick a venue and position, the bill rate comes straight from the rate card.",
    })
  } else if (!rateCard) {
    checks.push({
      id: "rate",
      label: "Rate card",
      status: "fail",
      detail: `No ${position.title} rate published for ${metroById(venue.metro)?.label ?? venue.metro}. Ask the program office to add one.`,
    })
  } else {
    checks.push({
      id: "rate",
      label: "Rate card",
      status: "pass",
      detail: `${rate(rateCard.billRate)} from the ${metroById(venue.metro)?.label ?? venue.metro} rate card (v${rateCard.version}). No manual rates, no MSA math.`,
    })
  }

  // 2. Cost center
  if (!costCenter) {
    checks.push({
      id: "cc",
      label: "Cost center",
      status: venue ? "fail" : "info",
      detail: venue
        ? "Choose the cost center that owns these shifts."
        : "Pick a venue first.",
    })
  } else if (!costCenter.active) {
    checks.push({
      id: "cc",
      label: "Cost center",
      status: "fail",
      detail: `${costCenter.code} is inactive. Reactivate it in Locations.`,
    })
  } else {
    checks.push({
      id: "cc",
      label: "Cost center",
      status: "pass",
      detail: `${costCenter.code} · ${costCenter.name}. Check-in, parking and attire defaults applied.`,
    })
  }

  // 3. Dates
  if (draft.dates.length === 0) {
    checks.push({
      id: "dates",
      label: "Dates",
      status: "fail",
      detail: "Add at least one date.",
    })
  } else if (draft.startTime && draft.endTime) {
    const firstStart = shiftWindow(
      [...draft.dates].sort()[0],
      draft.startTime,
      draft.endTime
    ).start
    if (draft.dates.some((d) => d < today) || firstStart < now) {
      checks.push({
        id: "dates",
        label: "Dates",
        status: "fail",
        detail:
          "A shift would start in the past. Adjust the date or start time.",
      })
    } else {
      checks.push({
        id: "dates",
        label: "Dates",
        status: "pass",
        detail: `${draft.dates.length} ${draft.dates.length === 1 ? "date" : "dates"} · first on ${formatDate([...draft.dates].sort()[0], "EEE, MMM d")}.`,
      })
    }
  }

  // 4. Times
  if (!draft.startTime || !draft.endTime) {
    checks.push({
      id: "time",
      label: "Shift times",
      status: "fail",
      detail: "Set a start and end time.",
    })
  } else {
    const mins = scheduledMinutes(draft.startTime, draft.endTime)
    const startM = minutesOf(draft.startTime)
    const endM = minutesOf(draft.endTime)
    const paid = Math.max(0, (mins - draft.breakMinutes) / 60)
    if (startM < 5 * 60) {
      checks.push({
        id: "time",
        label: "Shift times",
        status: "warn",
        detail: `Starts at ${formatTimeRange(draft.startTime, draft.endTime).split(" – ")[0]}: is that an AM/PM mix-up?`,
      })
    } else if (endM <= startM && endM > 6 * 60) {
      checks.push({
        id: "time",
        label: "Shift times",
        status: "warn",
        detail: "Ends the next morning. Double-check AM/PM before posting.",
      })
    } else if (mins < 120) {
      checks.push({
        id: "time",
        label: "Shift times",
        status: "warn",
        detail: "Shorter than 2 hours, Pros rarely accept very short shifts.",
      })
    } else if (mins > 14 * 60) {
      checks.push({
        id: "time",
        label: "Shift times",
        status: "warn",
        detail: "Longer than 14 hours. Consider splitting into two shifts.",
      })
    } else {
      checks.push({
        id: "time",
        label: "Shift times",
        status: "pass",
        detail: `${formatTimeRange(draft.startTime, draft.endTime)} · ${paid.toFixed(paid % 1 ? 1 : 0)} paid hours${draft.breakMinutes ? ` after a ${draft.breakMinutes}-min break` : ""}.`,
      })
    }
  }

  // 5. Headcount vs history
  if (draft.headcount < 1) {
    checks.push({
      id: "headcount",
      label: "Headcount",
      status: "fail",
      detail: "Request at least one Pro.",
    })
  } else if (venue && position) {
    const history = data.requests
      .filter(
        (r) =>
          r.venueId === venue.id &&
          r.positionId === position.id &&
          r.state !== "cancelled"
      )
      .map((r) => r.headcount)
    const avg = history.length
      ? history.reduce((s, n) => s + n, 0) / history.length
      : 0
    const total = draft.headcount * Math.max(1, draft.dates.length)
    if (avg > 0 && draft.headcount > Math.max(avg * 2.2, avg + 10)) {
      const perDay =
        draft.dates.length > 1
          ? Math.round(draft.headcount / draft.dates.length)
          : 0
      checks.push({
        id: "headcount",
        label: "Headcount",
        status: "warn",
        detail: `${num(draft.headcount)} per date is well above the usual ~${Math.round(avg)} at ${venue.shortName}.${perDay ? ` If ${draft.headcount} is the total, use ${perDay} per date.` : ""}`,
      })
    } else {
      checks.push({
        id: "headcount",
        label: "Headcount",
        status: "pass",
        detail: `${num(draft.headcount)} per date × ${Math.max(1, draft.dates.length)} = ${num(total)} shifts${avg ? ` · in line with history (~${Math.round(avg)})` : ""}.`,
      })
    }
  }

  // 6. Placeholders
  const fields: [string, string][] = [
    ["check-in details", draft.checkIn],
    ["attire", draft.attire],
    ["duties", draft.duties],
    ["parking", draft.parking],
    ["event name", draft.eventName],
  ]
  const placeholder = fields.find(([, v]) => PLACEHOLDER.test(v))
  checks.push(
    placeholder
      ? {
          id: "text",
          label: "Shift briefing",
          status: "warn",
          detail: `“${PLACEHOLDER.exec(placeholder[1])?.[0]}” in ${placeholder[0]}, Pros will see this exactly as written.`,
        }
      : {
          id: "text",
          label: "Shift briefing",
          status: "pass",
          detail: "No placeholder text. Pros get a complete briefing.",
        }
  )

  // 7. Duplicates
  if (venue && position && draft.dates.length) {
    const dup = data.requests.find(
      (r) =>
        r.venueId === venue.id &&
        r.positionId === position.id &&
        (r.state === "active" || r.state === "pending") &&
        r.dates.some((d) => draft.dates.includes(d))
    )
    checks.push(
      dup
        ? {
            id: "dup",
            label: "Duplicates",
            status: "warn",
            detail: `${dup.id} already books ${dup.headcount} ${position.title} on ${formatDate(
              dup.dates.find((d) => draft.dates.includes(d))!,
              "MMM d"
            )}. Add headcount there instead?`,
            href: `/requests/${dup.id}`,
          }
        : {
            id: "dup",
            label: "Duplicates",
            status: "pass",
            detail: "No overlapping request for this position.",
          }
    )
  }

  // 8. Lead time
  if (draft.dates.length && draft.startTime && draft.endTime) {
    const firstStart = shiftWindow(
      [...draft.dates].sort()[0],
      draft.startTime,
      draft.endTime
    ).start
    const hoursOut = (firstStart.getTime() - now.getTime()) / 3_600_000
    if (hoursOut > 0 && hoursOut < data.policies.rushLeadTimeHours) {
      checks.push({
        id: "lead",
        label: "Lead time",
        status: "info",
        detail: `Rush: starts in ${Math.max(1, Math.round(hoursOut))}h. Every supplier tier is notified immediately.`,
      })
    } else if (hoursOut > 0) {
      checks.push({
        id: "lead",
        label: "Lead time",
        status: "pass",
        detail: `Tier 1 gets a ${data.policies.tier1ExclusiveMinutes}-minute exclusive window, then Tier 2 suppliers join.`,
      })
    }
  }

  // 9. Certifications
  if (venue && position) {
    const certs = requiredCertsFor(position, venue)
    if (certs.length)
      checks.push({
        id: "certs",
        label: "Certifications",
        status: "info",
        detail: `Only Pros holding ${certs.join(" + ")} are offered these shifts.`,
      })
  }

  // 10. Agency safety and fit
  if (venue && position && rateCard) {
    const offers = buildAgencyOffers({
      data,
      venue,
      position,
      billRate: rateCard.billRate,
      headcount: draft.headcount,
      today,
    })
    const selected = offers.find((offer) =>
      draft.supplierIds.includes(offer.supplier.id)
    )
    checks.push(
      !selected
        ? {
            id: "agency",
            label: "Agency",
            status: "fail",
            detail: "Choose an agency before posting.",
          }
        : !selected.eligible
          ? {
              id: "agency",
              label: "Agency safety",
              status: "fail",
              detail: `${selected.supplier.shortName} cannot receive this work: ${selected.blockers.join(", ")}.`,
            }
          : {
              id: "agency",
              label: "Agency safety",
              status: "pass",
              detail: `${selected.supplier.shortName}: ${selected.readyWorkers} background-checked, qualified workers nearby · current insurance.`,
            }
    )
  }

  // 11. Budget
  if (
    costCenter &&
    rateCard &&
    draft.dates.length &&
    draft.startTime &&
    draft.endTime
  ) {
    const anchor = [...draft.dates].sort()[0]
    const committed = committedForWeek(data, costCenter.id, anchor)
    const weekStart = weekStartOf(parseLocal(anchor))
    const weekEnd = toISODate(addDays(weekStart, 6))
    const inWeek = draft.dates.filter(
      (d) => d >= toISODate(weekStart) && d <= weekEnd
    ).length
    const addition =
      inWeek * draft.headcount * payableShiftHours(draft) * rateCard.billRate
    const after = committed + addition
    const ratio = costCenter.weeklyBudget ? after / costCenter.weeklyBudget : 0
    checks.push(
      ratio > 1
        ? {
            id: "budget",
            label: "Budget",
            status: "warn",
            detail: `Takes ${costCenter.code} to ${Math.round(ratio * 100)}% of its ${money(costCenter.weeklyBudget)} weekly budget.`,
          }
        : {
            id: "budget",
            label: "Budget",
            status: "pass",
            detail: `${Math.round(ratio * 100)}% of ${costCenter.code}'s ${money(costCenter.weeklyBudget)} weekly budget after this request.`,
          }
    )
  }

  return checks
}
