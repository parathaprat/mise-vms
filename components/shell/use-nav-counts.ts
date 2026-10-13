"use client"

import { useMemo } from "react"

import { useData, useInbox, useLookups, usePersona } from "@/hooks/use-demo"
import { entryInScope, tipBatchInScope } from "@/lib/selectors"

export function useNavCounts() {
  const persona = usePersona()
  const lookups = useLookups()
  const inbox = useInbox()
  const entries = useData((d) => d.timeEntries)
  const tips = useData((d) => d.tipBatches)
  return useMemo(() => {
    const scopedEntries = entries.filter((e) => entryInScope(e, lookups, persona))
    const timesheets =
      persona.id === "venue"
        ? scopedEntries.filter((e) => e.status === "Pending").length
        : scopedEntries.filter((e) => e.status === "Disputed" && (persona.id === "program" || !e.dispute?.response)).length
    const pendingTips =
      persona.id === "venue" ? tips.filter((t) => t.status === "Pending approval" && tipBatchInScope(t, lookups, persona)).length : 0
    return {
      inbox: inbox.filter((i) => i.priority !== "low").length,
      timesheets,
      tips: pendingTips,
      requests: 0,
    }
  }, [entries, tips, lookups, persona, inbox])
}
