"use client"

import type * as React from "react"
import Link from "next/link"
import {
  BadgeCheckIcon,
  BadgeDollarSignIcon,
  CoinsIcon,
  HourglassIcon,
  LayersIcon,
  ReceiptTextIcon,
  TimerIcon,
  UserRoundXIcon,
  UsersRoundIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

import { money, num, plural } from "@/lib/format"
import type { Policies } from "@/lib/types"

import {
  duration,
  effectiveValue,
  formatNumeric,
  hoursText,
  isChanged,
  ruleChanged,
  type BooleanKey,
  type Draft,
  type NumericKey,
} from "./policy-config"
import { ImpactNote, NumberField, PolicySection, PolicySentence, ToggleField, V } from "./policy-controls"

export interface PolicyStats {
  /** Estimated cost of every request submitted in the last 30 days. */
  requestCosts: number[]
  /** Clock-out times (ms) of clean timesheets waiting for review. */
  pendingCleanClockOuts: number[]
  nowMs: number
  workerHours: number[]
  pendingTips: number
  pendingRateRevisions: number
  favoritesFirstCostCenters: number
  activeCostCenters: number
}

export interface SectionMeta {
  id: string
  title: string
  description: string
  icon: LucideIcon
  keys: (keyof Policies)[]
  replaces: string
}

export const POLICY_SECTIONS: SectionMeta[] = [
  {
    id: "approvals",
    title: "Request approvals",
    description: "When a new request needs sign-off before Pros are booked.",
    icon: BadgeCheckIcon,
    keys: ["autoApproveRequestsUnder"],
    replaces: "job posting approval chains per business unit, with email approvals and manual routing to the program office.",
  },
  {
    id: "headcount",
    title: "Headcount changes",
    description: "Adding Pros to a request that's already live.",
    icon: UsersRoundIcon,
    keys: ["autoApproveHeadcountPct"],
    replaces: "a work order revision for every added worker, each with its own approval cycle and supplier re-acknowledgement.",
  },
  {
    id: "timesheets",
    title: "Timesheets",
    description: "How long clean timesheets wait for a reviewer.",
    icon: TimerIcon,
    keys: ["timesheetAutoApproveHours"],
    replaces: "weekly time sheet reminder emails, and time sheets stuck in “Submitted” until a manager logged in.",
  },
  {
    id: "rush",
    title: "Rush requests",
    description: "Short-notice requests that can't wait out the Tier 1 window.",
    icon: ZapIcon,
    keys: ["rushLeadTimeHours"],
    replaces: "phone calls and emails to every supplier when a shift had to be filled the same day.",
  },
  {
    id: "distribution",
    title: "Distribution",
    description: "Which suppliers see a new request, and when.",
    icon: LayersIcon,
    keys: ["tier1ExclusiveMinutes"],
    replaces: "manual distribution lists and supplier response deadlines on every job posting.",
  },
  {
    id: "no-shows",
    title: "No-shows",
    description: "What happens when a Pro doesn't check in.",
    icon: UserRoundXIcon,
    keys: ["autoBackfillNoShows"],
    replaces: "calling the supplier's dispatch line, then opening a new job posting for the replacement.",
  },
  {
    id: "contractual-hours",
    title: "Contractual hours",
    description: "Co-employment guardrails across every Compass venue.",
    icon: HourglassIcon,
    keys: ["contractualHoursCap", "contractualHoursWarnPct", "blockOverCapWorkers"],
    replaces: "the monthly tenure report and a spreadsheet tracking every worker against the co-employment hour limit.",
  },
  {
    id: "tips",
    title: "Tips",
    description: "Approval before tip batches are paid out.",
    icon: CoinsIcon,
    keys: ["requireTipApproval"],
    replaces: "tips keyed as miscellaneous expense lines and reconciled by hand every pay period.",
  },
  {
    id: "rates",
    title: "Rates",
    description: "Who can publish pay and bill rate changes.",
    icon: BadgeDollarSignIcon,
    keys: ["rateChangesRequireProgram"],
    replaces: "rate card uploads followed by a work order revision for every affected worker.",
  },
  {
    id: "fees",
    title: "Fees & overtime",
    description: "Program fee and overtime billing on every invoice.",
    icon: ReceiptTextIcon,
    keys: ["msaFeePct", "overtimeWeeklyThreshold", "overtimeMultiplier"],
    replaces: "MSP fee and overtime rates set per work order, often inconsistently from site to site.",
  },
]

const SAMPLE_BILL_RATE = 33.92
const DAY_MS = 86_400_000

interface SectionsProps {
  draft: Draft
  saved: Policies
  errors: Partial<Record<NumericKey, string>>
  disabled: boolean
  stats: PolicyStats
  onNumberChange: (key: NumericKey, value: string) => void
  onToggle: (key: BooleanKey, value: boolean) => void
}

const linkClass = "font-medium text-foreground underline underline-offset-3 hover:text-primary"

export function PolicySections({ draft, saved, errors, disabled, stats, onNumberChange, onToggle }: SectionsProps) {
  const value = (key: NumericKey) => effectiveValue(draft, saved, key)
  const changed = (key: keyof Policies) => ruleChanged(draft, saved, key)
  const edited = (meta: SectionMeta) => meta.keys.some((key) => isChanged(draft, saved, key))
  const field = (key: NumericKey, extra?: { description?: React.ReactNode; className?: string }) => (
    <NumberField
      name={key}
      value={draft[key]}
      onChange={(v) => onNumberChange(key, v)}
      error={errors[key]}
      disabled={disabled}
      description={extra?.description}
      className={extra?.className}
    />
  )
  const toggle = (key: BooleanKey, label: string, description: React.ReactNode) => (
    <ToggleField
      id={`policy-${key}`}
      label={label}
      description={description}
      checked={draft[key]}
      onCheckedChange={(v) => onToggle(key, v)}
      disabled={disabled}
    />
  )

  const limit = value("autoApproveRequestsUnder")
  const overLimit = stats.requestCosts.filter((c) => c > limit).length
  const headcountPct = value("autoApproveHeadcountPct")
  const autoHours = value("timesheetAutoApproveHours")
  const dueSoon = stats.pendingCleanClockOuts.filter((t) => t + autoHours * 3_600_000 <= stats.nowMs + DAY_MS).length
  const rushHours = value("rushLeadTimeHours")
  const windowMinutes = value("tier1ExclusiveMinutes")
  const cap = value("contractualHoursCap")
  const warnPct = value("contractualHoursWarnPct")
  const warnLine = Math.round((cap * warnPct) / 100)
  const nearing = stats.workerHours.filter((h) => h >= warnLine && h < cap).length
  const atCap = stats.workerHours.filter((h) => h >= cap).length
  const fee = value("msaFeePct")
  const otAfter = value("overtimeWeeklyThreshold")
  const otMultiplier = value("overtimeMultiplier")

  const content: Record<string, React.ReactNode> = {
    approvals: (
      <>
        <PolicySentence>
          {limit > 0 ? (
            <>
              Requests estimated at <V changed={changed("autoApproveRequestsUnder")}>{money(limit)}</V> or less go live the moment they&apos;re
              submitted. Anything larger waits for program office approval.
            </>
          ) : (
            <>
              <V changed={changed("autoApproveRequestsUnder")}>Every request</V> waits for program office approval before it goes live.
            </>
          )}
        </PolicySentence>
        {field("autoApproveRequestsUnder", {
          description: "Estimated spend is headcount × payable hours × bill rate across every date. Requests from the program office are approved on submit.",
        })}
        <ImpactNote>
          At this limit, <span className="font-medium text-foreground">{num(overLimit)}</span> of {plural(stats.requestCosts.length, "request")} submitted in
          the last 30 days would have needed approval.
        </ImpactNote>
      </>
    ),
    headcount: (
      <>
        <PolicySentence>
          {headcountPct > 0 ? (
            <>
              Headcount increases of up to <V changed={changed("autoApproveHeadcountPct")}>{headcountPct}%</V> apply instantly and start filling right
              away. Larger increases go to the program office.
            </>
          ) : (
            <>
              <V changed={changed("autoApproveHeadcountPct")}>Every headcount increase</V> goes to the program office for approval.
            </>
          )}
        </PolicySentence>
        {field("autoApproveHeadcountPct", { description: "Measured against the request's current headcount. Decreases always apply instantly." })}
      </>
    ),
    timesheets: (
      <>
        <PolicySentence>
          Clean timesheets: no anomalies, no disputes, are approved automatically{" "}
          <V changed={changed("timesheetAutoApproveHours")}>{hoursText(autoHours)}</V> after clock-out if nobody reviews them first. Flagged timesheets
          always wait for a person.
        </PolicySentence>
        {field("timesheetAutoApproveHours")}
        <ImpactNote>
          {stats.pendingCleanClockOuts.length ? (
            <>
              <span className="font-medium text-foreground">{plural(stats.pendingCleanClockOuts.length, "clean timesheet")}</span>{" "}
              {stats.pendingCleanClockOuts.length === 1 ? "is" : "are"} waiting for review, {num(dueSoon)} would auto-approve within the next 24 hours
              under this rule.
            </>
          ) : (
            "No clean timesheets are waiting for review right now."
          )}
        </ImpactNote>
      </>
    ),
    rush: (
      <>
        <PolicySentence>
          Requests that start within <V changed={changed("rushLeadTimeHours")}>{hoursText(rushHours)}</V> are treated as rush: every supplier tier is
          notified at once instead of waiting out the Tier 1 window.
        </PolicySentence>
        {field("rushLeadTimeHours", { description: "Measured from submission to the start of the first shift." })}
      </>
    ),
    distribution: (
      <>
        <PolicySentence>
          {windowMinutes > 0 ? (
            <>
              Tier 1 suppliers get every new request to themselves for <V changed={changed("tier1ExclusiveMinutes")}>{duration(windowMinutes)}</V>. Then
              Tier 2 and 3 suppliers serving the venue&apos;s market join. Suppliers without a current certificate of insurance are excluded
              automatically.
            </>
          ) : (
            <>
              New requests go to <V changed={changed("tier1ExclusiveMinutes")}>every supplier tier at once</V>. Suppliers without a current certificate of
              insurance are excluded automatically.
            </>
          )}
        </PolicySentence>
        {field("tier1ExclusiveMinutes", {
          description: (
            <>
              Set to 0 to notify every tier at once. Tiers and compliance are managed in{" "}
              <Link href="/suppliers" className={linkClass}>
                Suppliers
              </Link>
              .
            </>
          ),
        })}
        <ImpactNote>
          {stats.favoritesFirstCostCenters} of {plural(stats.activeCostCenters, "active cost center")} also offer shifts to venue favorites first, set
          per cost center in{" "}
          <Link href="/locations" className={linkClass}>
            Locations
          </Link>
          .
        </ImpactNote>
      </>
    ),
    "no-shows": (
      <>
        <PolicySentence>
          {draft.autoBackfillNoShows ? (
            <>
              When a Pro misses check-in, Mise <V changed={changed("autoBackfillNoShows")}>books a qualified replacement automatically</V> and alerts
              the venue, as long as at least 90 minutes of the shift remain.
            </>
          ) : (
            <>
              Missed check-ins are flagged to the venue and supplier. Replacements are{" "}
              <V changed={changed("autoBackfillNoShows")}>requested by hand</V>.
            </>
          )}
        </PolicySentence>
        {toggle(
          "autoBackfillNoShows",
          "Auto-backfill no-shows",
          "Replacements come from the request's own suppliers and must hold every required certification."
        )}
      </>
    ),
    "contractual-hours": (
      <>
        <PolicySentence>
          Pros can work up to <V changed={changed("contractualHoursCap")}>{hoursText(cap)}</V> across all Compass venues. Mise warns at{" "}
          <V changed={changed("contractualHoursWarnPct")}>{warnPct}%</V> ({hoursText(warnLine)}) and{" "}
          <V changed={changed("blockOverCapWorkers")}>{draft.blockOverCapWorkers ? "blocks new bookings" : "flags, but still allows, new bookings"}</V>{" "}
          at the cap.
        </PolicySentence>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("contractualHoursCap")}
          {field("contractualHoursWarnPct")}
        </div>
        {toggle(
          "blockOverCapWorkers",
          "Block bookings at the cap",
          "Over-cap Pros are skipped by matching and flagged on manual bookings. Hours count across every Compass venue."
        )}
        <ImpactNote>
          Today <span className="font-medium text-foreground">{plural(nearing, "Pro")}</span> {nearing === 1 ? "is" : "are"} past the warning line and{" "}
          <span className="font-medium text-foreground">{num(atCap)}</span> {atCap === 1 ? "is" : "are"} at the cap.
        </ImpactNote>
      </>
    ),
    tips: (
      <>
        <PolicySentence>
          {draft.requireTipApproval ? (
            <>
              Tip batches need <V changed={changed("requireTipApproval")}>a venue manager&apos;s approval</V> before Pros are paid.
            </>
          ) : (
            <>
              Submitted tip batches are <V changed={changed("requireTipApproval")}>approved by policy</V>, Pros are paid the next business day.
            </>
          )}
        </PolicySentence>
        {toggle("requireTipApproval", "Require approval for tip batches", "Batches waiting on approval land in the venue manager's Inbox.")}
        <ImpactNote>
          {stats.pendingTips ? `${plural(stats.pendingTips, "tip batch", "tip batches")} awaiting approval right now.` : "No tip batches are awaiting approval."}
        </ImpactNote>
      </>
    ),
    rates: (
      <>
        <PolicySentence>
          {draft.rateChangesRequireProgram ? (
            <>
              <V changed={changed("rateChangesRequireProgram")}>Only the program office</V> publishes rate changes. Venues and suppliers request
              revisions, and every publish reprices upcoming requests instantly.
            </>
          ) : (
            <>
              <V changed={changed("rateChangesRequireProgram")}>Venue directors</V> can publish rate changes in their own markets. Suppliers still request
              revisions through the program office.
            </>
          )}
        </PolicySentence>
        {toggle(
          "rateChangesRequireProgram",
          "Only the program office publishes rates",
          <>
            Rate cards and pending revisions live in{" "}
            <Link href="/rates" className={linkClass}>
              Rate cards
            </Link>
            .
          </>
        )}
        <ImpactNote>
          {stats.pendingRateRevisions
            ? `${plural(stats.pendingRateRevisions, "rate revision")} awaiting review.`
            : "No rate revisions are awaiting review."}
        </ImpactNote>
      </>
    ),
    fees: (
      <>
        <PolicySentence>
          Suppliers fund a <V changed={changed("msaFeePct")}>{formatNumeric(fee, 2)}%</V> program fee, deducted from every invoice. Hours past{" "}
          <V changed={changed("overtimeWeeklyThreshold")}>{otAfter}</V> in a week bill at{" "}
          <V changed={changed("overtimeMultiplier")}>{formatNumeric(otMultiplier, 2)}×</V> the bill rate.
        </PolicySentence>
        <div className="grid gap-4 sm:grid-cols-3">
          {field("msaFeePct")}
          {field("overtimeWeeklyThreshold")}
          {field("overtimeMultiplier")}
        </div>
        <ImpactNote>
          On a {money(SAMPLE_BILL_RATE, true)} bill rate, overtime bills at{" "}
          <span className="font-medium text-foreground">{money(SAMPLE_BILL_RATE * otMultiplier, true)}/hr</span> and the supplier nets{" "}
          <span className="font-medium text-foreground">{money(SAMPLE_BILL_RATE * (1 - fee / 100), true)}/hr</span> after the program fee.
        </ImpactNote>
      </>
    ),
  }

  return (
    <>
      {POLICY_SECTIONS.map((meta) => (
        <PolicySection
          key={meta.id}
          id={meta.id}
          icon={meta.icon}
          title={meta.title}
          description={meta.description}
          edited={edited(meta)}
          replaces={meta.replaces}
        >
          {content[meta.id]}
        </PolicySection>
      ))}
    </>
  )
}
