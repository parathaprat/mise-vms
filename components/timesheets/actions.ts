import { toast } from "sonner"

import { hours, money, plural } from "@/lib/format"
import { useStore } from "@/lib/store"

import { isApprovable, totalsOf } from "./model"

export function approveEntriesWithToast(ids: string[], title?: (count: number) => string): number {
  const state = useStore.getState()
  const target = new Set(ids)
  const eligible = state.data.timeEntries.filter((e) => target.has(e.id) && isApprovable(e))
  if (eligible.length === 0) {
    toast.info("Nothing left to approve", { description: "Those hours were already approved." })
    return 0
  }
  const totals = totalsOf(eligible.map((entry) => ({ entry })))
  const count = state.approveEntries(eligible.map((e) => e.id))
  toast.success(title ? title(count) : `Approved ${plural(count, "timesheet")}`, {
    description: `${hours(totals.hours)} · ${money(totals.amount, true)} roll into the next weekly invoice automatically.`,
  })
  return count
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
