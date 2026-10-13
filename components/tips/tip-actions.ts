import { toast } from "sonner"

import { formatDate, toISODate } from "@/lib/dates"
import { money, plural } from "@/lib/format"
import { PERSONAS } from "@/lib/reference"
import { getActions, useStore } from "@/lib/store"
import type { TipBatch, TipBatchStatus } from "@/lib/types"

import { linesTotal, nextBusinessDay } from "./tip-utils"

/** Re-reads the batch at click time so a stale sheet can't act twice. */
function freshBatch(id: string, status: TipBatchStatus): TipBatch | null {
  const batch = useStore.getState().data.tipBatches.find((b) => b.id === id)
  if (batch?.status === status) return batch
  toast("Already handled", { description: "This tip batch changed since you opened it." })
  return null
}

export function payDayLabel(): string {
  return formatDate(nextBusinessDay(toISODate(new Date())), "EEEE")
}

export function approveTips(id: string): boolean {
  const batch = freshBatch(id, "Pending approval")
  if (!batch) return false
  getActions().approveTipBatch(id)
  toast.success(`Tips approved · ${batch.eventName}`, {
    description: `${money(linesTotal(batch.lines), true)} for ${plural(batch.lines.length, "Pro")}. They're paid ${payDayLabel()}, and it bills at cost on the next weekly invoice.`,
  })
  return true
}

export function returnTips(id: string, note: string): boolean {
  const batch = freshBatch(id, "Pending approval")
  if (!batch) return false
  const own = batch.createdBy === PERSONAS[useStore.getState().persona].name
  getActions().rejectTipBatch(id, note.trim())
  toast.success(`Tips returned · ${batch.eventName}`, {
    description: `${own ? "Your note stays on the batch" : `${batch.createdBy} sees your note on the batch`}. Nothing is paid until it's resubmitted.`,
  })
  return true
}

export function submitTips(id: string): boolean {
  const batch = freshBatch(id, "Draft")
  if (!batch) return false
  getActions().submitTipBatch(id)
  const needsApproval = useStore.getState().data.policies.requireTipApproval
  toast.success(needsApproval ? `Tips submitted · ${batch.eventName}` : `Tips approved · ${batch.eventName}`, {
    description: needsApproval
      ? "Waiting on venue approval. Pros are paid the business day after it's approved."
      : `Approved by policy. Pros are paid ${payDayLabel()}.`,
  })
  return true
}

export function deleteDraft(id: string): boolean {
  const batch = freshBatch(id, "Draft")
  if (!batch) return false
  getActions().deleteTipBatch(id)
  toast.success(`Draft deleted · ${batch.eventName}`)
  return true
}
