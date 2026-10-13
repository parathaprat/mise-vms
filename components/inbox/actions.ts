import {
  ArrowUpRightIcon,
  CheckCheckIcon,
  CheckIcon,
  FilePenLineIcon,
  FlagIcon,
  MessageSquareReplyIcon,
  ScaleIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  WandSparklesIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { approveEntriesWithToast } from "@/components/timesheets/actions"
import { isClean } from "@/components/timesheets/model"
import type { DemoData } from "@/lib/data"
import { formatDate, toISODate } from "@/lib/dates"
import { bookedByDate, candidateWorkers } from "@/lib/engine"
import { money, plural, rate, workerName } from "@/lib/format"
import { lineTotals } from "@/lib/invoice"
import { metroById } from "@/lib/reference"
import type { InboxItem } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { ChangeRequest, ISODate, Persona, StaffingRequest, Worker } from "@/lib/types"

import { targetId } from "./kinds"

export type PrimaryAction =
  | { type: "run"; label: string; icon: LucideIcon; run: () => boolean }
  | { type: "navigate"; label: string; icon: LucideIcon; href: string }
  | { type: "focus"; label: string; icon: LucideIcon }

/** The one decision `a` (and the main button) takes on an item. */
export function primaryActionFor(item: InboxItem, data: DemoData, persona: Persona, today: ISODate): PrimaryAction {
  const id = targetId(item)
  switch (item.kind) {
    case "timesheets": {
      const refs = new Set(item.refIds)
      const clean = data.timeEntries.filter((e) => refs.has(e.id) && isClean(e)).map((e) => e.id)
      if (clean.length === 0) {
        return { type: "navigate", label: `Review ${item.flagged ?? item.refIds.length} flagged`, icon: FlagIcon, href: `/timesheets?request=${id}&tab=flagged` }
      }
      return {
        type: "run",
        label: clean.length === item.refIds.length ? (clean.length === 1 ? "Approve" : `Approve all ${clean.length}`) : `Approve ${clean.length} clean`,
        icon: CheckCheckIcon,
        run: () => approveEntriesWithToast(clean, (n) => `Approved ${plural(n, "clean timesheet")}`) > 0,
      }
    }
    case "dispute":
      return { type: "focus", label: "Reply to venue", icon: MessageSquareReplyIcon }
    case "tips":
      return { type: "run", label: "Approve tips", icon: CheckIcon, run: () => approveTipsWithToast(id) }
    case "tips-draft":
      return { type: "navigate", label: "Finish draft", icon: FilePenLineIcon, href: item.href }
    case "invoice":
      return { type: "run", label: "Approve invoice", icon: CheckIcon, run: () => approveInvoiceWithToast(id) }
    case "invoice-dispute":
      return { type: "focus", label: "Resolve dispute", icon: ScaleIcon }
    case "request-approval":
      return { type: "run", label: "Approve & distribute", icon: CheckIcon, run: () => approveRequestWithToast(id) }
    case "change":
      return { type: "run", label: "Approve change", icon: CheckIcon, run: () => decideChangeWithToast(id, true) }
    case "staffing": {
      if (persona.id === "supplier") {
        const request = data.requests.find((r) => r.id === id)
        const plan = request ? autoFillPlan(data, request, item.refIds, today, persona.supplierId) : []
        if (plan.length > 0) {
          const all = plan.length === item.refIds.length
          return {
            type: "run",
            label: all ? (plan.length === 1 ? "Auto-fill shift" : `Auto-fill all ${plan.length}`) : `Auto-fill ${plan.length} of ${item.refIds.length}`,
            icon: WandSparklesIcon,
            run: () => autoFillWithToast(id, item.refIds, persona.supplierId),
          }
        }
      }
      return { type: "navigate", label: "Open request", icon: ArrowUpRightIcon, href: item.href }
    }
    case "compliance":
      return { type: "navigate", label: "Open Pro profile", icon: UserRoundIcon, href: item.href }
    case "supplier-coi":
      return { type: "run", label: "Mark COI renewed", icon: ShieldCheckIcon, run: () => renewCoiWithToast(id) }
  }
}

function alreadyHandled() {
  toast.info("Already handled", { description: "Someone got to this one first. Your inbox is up to date." })
}

export function listNames(names: string[], max = 3): string {
  if (names.length <= 1) return names[0] ?? ""
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`
}

// Timesheet disputes ----------------------------------------------------------

export function respondToDisputeWithToast(entryId: string, note: string): boolean {
  const state = useStore.getState()
  const entry = state.data.timeEntries.find((e) => e.id === entryId)
  if (!entry?.dispute || entry.status !== "Disputed") {
    alreadyHandled()
    return false
  }
  const request = state.data.requests.find((r) => r.id === entry.requestId)
  const venue = state.data.venues.find((v) => v.id === request?.venueId)
  state.respondToDispute(entryId, note)
  toast.success(`Response sent to ${venue?.shortName ?? "the venue"}`, {
    description: `${entry.dispute.by} is notified and can approve, adjust or reassign the hours.`,
  })
  return true
}

// Tips ------------------------------------------------------------------------

export function approveTipsWithToast(batchId: string): boolean {
  const state = useStore.getState()
  const batch = state.data.tipBatches.find((b) => b.id === batchId)
  if (!batch || batch.status !== "Pending approval") {
    alreadyHandled()
    return false
  }
  state.approveTipBatch(batchId)
  const total = batch.lines.reduce((s, l) => s + l.amount, 0)
  toast.success(`Tips approved · ${batch.eventName}`, {
    description: `${money(total, true)} for ${plural(batch.lines.length, "Pro")}: paid next business day, billed at cost on the weekly invoice.`,
  })
  return true
}

export function returnTipsWithToast(batchId: string, note: string): boolean {
  const state = useStore.getState()
  const batch = state.data.tipBatches.find((b) => b.id === batchId)
  if (!batch || batch.status !== "Pending approval") {
    alreadyHandled()
    return false
  }
  state.rejectTipBatch(batchId, note.trim())
  toast.success(`Tips returned · ${batch.eventName}`, { description: `${batch.createdBy} sees your note on the batch. Nothing is paid until it's resubmitted.` })
  return true
}

export function submitTipDraftWithToast(batchId: string): boolean {
  const state = useStore.getState()
  const batch = state.data.tipBatches.find((b) => b.id === batchId)
  if (!batch || batch.status !== "Draft") {
    alreadyHandled()
    return false
  }
  state.submitTipBatch(batchId)
  const needsApproval = state.data.policies.requireTipApproval
  toast.success(`Tips submitted · ${batch.eventName}`, {
    description: needsApproval ? "Waiting on approval before Pros are paid." : "Approved by policy: Pros are paid next business day.",
  })
  return true
}

// Invoices --------------------------------------------------------------------

export function approveInvoiceWithToast(invoiceId: string): boolean {
  const state = useStore.getState()
  const invoice = state.data.invoices.find((i) => i.id === invoiceId)
  if (!invoice || invoice.status !== "Pending approval") {
    alreadyHandled()
    return false
  }
  if (invoice.disputes.some((d) => d.status === "Open")) {
    toast.error("Resolve the open dispute first", { description: `${invoiceId} can't be approved while a line is disputed.` })
    return false
  }
  state.approveInvoice(invoiceId)
  const after = useStore.getState().data
  const payment = after.payments.find((p) => p.status === "Scheduled" && p.invoiceIds.includes(invoiceId))
  const supplier = after.suppliers.find((s) => s.id === invoice.supplierId)
  const net = lineTotals(invoice.lines, after.policies.msaFeePct).netToSupplier
  toast.success(`Invoice ${invoiceId} approved`, {
    description: payment
      ? `${money(net, true)} to ${supplier?.shortName ?? "the supplier"} goes out ${formatDate(payment.date)} by ${payment.method}.`
      : `${supplier?.shortName ?? "The supplier"} is notified.`,
  })
  return true
}

export function resolveInvoiceDisputeWithToast(invoiceId: string, disputeId: string, credit: number, note?: string): boolean {
  const state = useStore.getState()
  const invoice = state.data.invoices.find((i) => i.id === invoiceId)
  if (!invoice?.disputes.some((d) => d.id === disputeId && d.status === "Open")) {
    alreadyHandled()
    return false
  }
  state.resolveInvoiceDispute(invoiceId, disputeId, credit, note?.trim() || undefined)
  const after = useStore.getState().data.invoices.find((i) => i.id === invoiceId)
  const stillOpen = after?.disputes.filter((d) => d.status === "Open").length ?? 0
  const total = after ? lineTotals(after.lines, state.data.policies.msaFeePct).totalDue : 0
  toast.success(credit > 0 ? `Dispute resolved with a ${money(credit, true)} credit` : "Dispute resolved: no credit", {
    description: stillOpen
      ? `${plural(stillOpen, "dispute")} still open on ${invoiceId}.`
      : `${invoiceId} is back in Pending approval at ${money(total, true)}.`,
  })
  return true
}

// Requests & changes ----------------------------------------------------------

export function approveRequestWithToast(requestId: string): boolean {
  const state = useStore.getState()
  const request = state.data.requests.find((r) => r.id === requestId)
  if (!request || request.state !== "pending") {
    alreadyHandled()
    return false
  }
  state.approveRequest(requestId)
  const suppliers = request.supplierIds.map((id) => state.data.suppliers.find((s) => s.id === id)?.shortName ?? id)
  toast.success(`${requestId} approved`, {
    description: `Distribution to ${listNames(suppliers)} has started. ${request.createdBy} is notified.`,
  })
  return true
}

export function declineRequestWithToast(requestId: string, note: string): boolean {
  const state = useStore.getState()
  const request = state.data.requests.find((r) => r.id === requestId)
  if (!request || request.state !== "pending") {
    alreadyHandled()
    return false
  }
  state.rejectRequest(requestId, note.trim())
  toast.success(`${requestId} declined`, { description: `${request.createdBy} is notified with your note.` })
  return true
}

function changeOutcome(change: ChangeRequest, data: DemoData): string {
  const position = data.positions.find((p) => p.id === change.positionId)?.title ?? "Pros"
  switch (change.type) {
    case "Headcount increase":
      return `${change.delta ?? "More"} more ${position} on ${change.requestId}. The new shifts are going out to suppliers now.`
    case "Rate revision": {
      const card = data.rateCards.find((r) => r.id === change.rateCardId)
      const metro = card ? metroById(card.metro)?.label : undefined
      return `${position}${metro ? ` in ${metro}` : ""} now pays ${rate(change.newRate ?? 0)}. Upcoming requests were repriced automatically.`
    }
    case "Date extension":
      return `${change.requestId} runs one more week. The new shifts are going out to suppliers now.`
    default:
      return `${change.requestedBy} is notified.`
  }
}

export function decideChangeWithToast(changeId: string, approve: boolean, note?: string): boolean {
  const state = useStore.getState()
  const change = state.data.changeRequests.find((c) => c.id === changeId)
  if (!change || change.status !== "Pending") {
    alreadyHandled()
    return false
  }
  const trimmed = note?.trim() || undefined
  state.decideChange(changeId, approve, trimmed)
  if (approve) toast.success("Change approved", { description: changeOutcome(change, state.data) })
  else toast.success("Change declined", { description: `${change.requestedBy} is notified${trimmed ? " with your note" : ""}.` })
  return true
}

// Suppliers -------------------------------------------------------------------

export function renewCoiWithToast(supplierId: string): boolean {
  const state = useStore.getState()
  const supplier = state.data.suppliers.find((s) => s.id === supplierId)
  if (!supplier) return false
  const wasExpired = supplier.coiExpires < toISODate(new Date())
  state.renewSupplierCoi(supplierId)
  const renewed = useStore.getState().data.suppliers.find((s) => s.id === supplierId)
  toast.success(`${supplier.shortName} certificate verified`, {
    description: `Coverage on file through ${renewed ? formatDate(renewed.coiExpires, "MMM d, yyyy") : "next year"}${wasExpired ? ", distribution to their Pros resumes now." : "."}`,
  })
  return true
}

// Staffing --------------------------------------------------------------------

export interface Match {
  worker: Worker
  score: number
  favorite: boolean
}

interface MatchOptions {
  data: DemoData
  request: StaffingRequest
  date: ISODate
  today: ISODate
  /** Only consider this supplier's Pros (the supplier persona fills from its own bench). */
  supplierId?: string
  booked?: Set<string>
}

/** Eligible Pros for one date, ranked like the fill engine but without its randomness. */
export function rankMatches({ data, request, date, today, supplierId, booked }: MatchOptions): Match[] {
  const venue = data.venues.find((v) => v.id === request.venueId)
  const position = data.positions.find((p) => p.id === request.positionId)
  if (!venue || !position) return []
  const taken = booked ?? bookedByDate(data.shifts).get(date) ?? new Set<string>()
  const workers = supplierId ? data.workers.filter((w) => w.supplierId === supplierId) : data.workers
  const favorites = new Set(data.rosters.find((r) => r.venueId === venue.id)?.favorites ?? [])
  const tiers = new Map(data.suppliers.map((s) => [s.id, s.tier]))
  return candidateWorkers({
    data: { workers, rosters: data.rosters, suppliers: data.suppliers, policies: data.policies },
    request,
    venue,
    position,
    booked: taken,
    today,
    rand: () => 0.5,
  })
    .map((worker) => {
      const favorite = favorites.has(worker.id)
      const tier = tiers.get(worker.supplierId) ?? 3
      const boost = (request.favoritesFirst && favorite ? 1.45 : 1) * (tier === 1 ? 1.12 : tier === 2 ? 1 : 0.9)
      return { worker, favorite, score: worker.rating * worker.reliability * boost }
    })
    .sort((a, b) => b.score - a.score || a.worker.lastName.localeCompare(b.worker.lastName))
}

export interface FillAssignment {
  shiftId: string
  date: ISODate
  worker: Worker
}

/** Best eligible Pro for each open shift, never double-booking anyone on the same day. */
export function autoFillPlan(data: DemoData, request: StaffingRequest, shiftIds: string[], today: ISODate, supplierId?: string): FillAssignment[] {
  const ids = new Set(shiftIds)
  const open = data.shifts
    .filter((s) => ids.has(s.id) && !s.workerId && s.status === "Open")
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot)
  const booked = bookedByDate(data.shifts)
  const plan: FillAssignment[] = []
  for (const shift of open) {
    let taken = booked.get(shift.date)
    if (!taken) {
      taken = new Set()
      booked.set(shift.date, taken)
    }
    const best = rankMatches({ data, request, date: shift.date, today, supplierId, booked: taken })[0]
    if (!best) continue
    taken.add(best.worker.id)
    plan.push({ shiftId: shift.id, date: shift.date, worker: best.worker })
  }
  return plan
}

export function autoFillWithToast(requestId: string, shiftIds: string[], supplierId?: string): boolean {
  const state = useStore.getState()
  const request = state.data.requests.find((r) => r.id === requestId)
  if (!request) return false
  const plan = autoFillPlan(state.data, request, shiftIds, toISODate(new Date()), supplierId)
  if (plan.length === 0) {
    toast.info("No eligible Pros are free", { description: "Everyone qualified is booked, blocked or missing a required cert on these dates." })
    return false
  }
  for (const a of plan) state.assignWorker(a.shiftId, a.worker.id)
  const position = state.data.positions.find((p) => p.id === request.positionId)?.title ?? "Pro"
  const remaining = shiftIds.length - plan.length
  toast.success(`Filled ${plural(plan.length, `${position} shift`)} on ${requestId}`, {
    description: `${listNames(plan.map((a) => workerName(a.worker)))} confirmed${remaining > 0 ? ` · ${remaining} still open` : ""}.`,
  })
  return true
}

export function assignWithToast(shiftId: string, worker: Worker): boolean {
  const state = useStore.getState()
  const shift = state.data.shifts.find((s) => s.id === shiftId)
  if (!shift || shift.workerId || shift.status !== "Open") {
    toast.info("That shift was just filled", { description: "Pick another open shift." })
    return false
  }
  state.assignWorker(shiftId, worker.id)
  const request = state.data.requests.find((r) => r.id === shift.requestId)
  const position = state.data.positions.find((p) => p.id === request?.positionId)?.title ?? "Shift"
  toast.success(`${workerName(worker)} confirmed`, { description: `${position} · ${formatDate(shift.date)} · ${shift.requestId}` })
  return true
}
