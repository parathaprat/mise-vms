"use client"

import { usePathname } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { useUi } from "@/components/shell/ui-store"
import { checklistFor, type TrackedAction } from "@/lib/guide"
import { useStore } from "@/lib/store"
import type { PersonaId } from "@/lib/types"

import { useOnboarding } from "./onboarding-store"

function complete(persona: PersonaId, match: (t: ReturnType<typeof checklistFor>[number]) => boolean) {
  const onboarding = useOnboarding.getState()
  const list = checklistFor(persona)
  const done = new Set(onboarding.done[persona] ?? [])
  for (const task of list) {
    if (done.has(task.id) || !match(task)) continue
    onboarding.markDone(persona, task.id)
    done.add(task.id)
    if (done.size === list.length) {
      toast.success("You're fully set up", {
        description: "That's everything you'll do day to day. Help is always one click away in the header.",
      })
    }
  }
}

let installed = false

/**
 * Checks off setup steps when the partner actually does them, by wrapping the
 * store actions every screen already calls. No page needs to know about onboarding.
 */
function installActionTracking() {
  if (installed) return
  installed = true
  const state = useStore.getState() as unknown as Record<string, unknown>
  const tracked: TrackedAction[] = [
    "createRequest",
    "submitDraft",
    "approveRequest",
    "decideChange",
    "approveEntries",
    "respondToDispute",
    "createTipBatch",
    "approveTipBatch",
    "approveInvoice",
    "toggleFavorite",
    "assignWorker",
    "updatePolicies",
    "updateRateCard",
  ]
  const patch: Record<string, unknown> = {}
  for (const name of tracked) {
    const original = state[name]
    if (typeof original !== "function") continue
    patch[name] = (...args: unknown[]) => {
      const result = (original as (...a: unknown[]) => unknown)(...args)
      const isDraft = name === "createRequest" && (args[1] as { asDraft?: boolean } | undefined)?.asDraft
      if (!isDraft) {
        const persona = useStore.getState().persona
        complete(persona, (t) => !!t.checklist?.doneBy.actions?.includes(name))
      }
      return result
    }
  }
  useStore.setState(patch as never)
}

export function useProgressTracking() {
  const pathname = usePathname()

  React.useEffect(() => {
    installActionTracking()
    return useUi.subscribe((s, prev) => {
      if (s.copilotOpen && !prev.copilotOpen) {
        complete(useStore.getState().persona, (t) => !!t.checklist?.doneBy.copilot)
      }
    })
  }, [])

  React.useEffect(() => {
    const persona = useStore.getState().persona
    complete(persona, (t) => {
      const route = t.checklist?.doneBy.route
      return !!route && (pathname === route || pathname.startsWith(`${route}/`))
    })
  }, [pathname])
}
