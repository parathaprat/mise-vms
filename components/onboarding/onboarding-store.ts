"use client"

import { useSyncExternalStore } from "react"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { PersonaId } from "@/lib/types"

type PerPersona<T> = Partial<Record<PersonaId, T>>

interface OnboardingState {
  welcomed: PerPersona<boolean>
  checklistHidden: PerPersona<boolean>
  done: PerPersona<string[]>
  tourOpen: boolean
  tourStep: number
  helpOpen: boolean
  helpQuery: string

  markWelcomed: (persona: PersonaId) => void
  markDone: (persona: PersonaId, taskId: string) => void
  hideChecklist: (persona: PersonaId, hidden: boolean) => void
  startTour: () => void
  setTourStep: (step: number) => void
  endTour: () => void
  openHelp: (query?: string) => void
  setHelpOpen: (open: boolean) => void
  restart: (persona: PersonaId) => void
}

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set, get) => ({
      welcomed: {},
      checklistHidden: {},
      done: {},
      tourOpen: false,
      tourStep: 0,
      helpOpen: false,
      helpQuery: "",

      markWelcomed: (persona) => set({ welcomed: { ...get().welcomed, [persona]: true } }),
      markDone: (persona, taskId) => {
        const current = get().done[persona] ?? []
        if (current.includes(taskId)) return
        set({ done: { ...get().done, [persona]: [...current, taskId] } })
      },
      hideChecklist: (persona, hidden) => set({ checklistHidden: { ...get().checklistHidden, [persona]: hidden } }),
      startTour: () => set({ tourOpen: true, tourStep: 0, helpOpen: false }),
      setTourStep: (tourStep) => set({ tourStep }),
      endTour: () => set({ tourOpen: false, tourStep: 0 }),
      openHelp: (query = "") => set({ helpOpen: true, helpQuery: query }),
      setHelpOpen: (helpOpen) => set({ helpOpen }),
      restart: (persona) =>
        set({
          welcomed: { ...get().welcomed, [persona]: false },
          checklistHidden: { ...get().checklistHidden, [persona]: false },
          done: { ...get().done, [persona]: [] },
        }),
    }),
    {
      name: "mise-onboarding",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ welcomed: s.welcomed, checklistHidden: s.checklistHidden, done: s.done }),
    }
  )
)

/** False during SSR and until saved progress loads, so first-run UI never flashes for returning users. */
export function useOnboardingHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useOnboarding.persist.onFinishHydration(cb),
    () => useOnboarding.persist.hasHydrated(),
    () => false
  )
}
