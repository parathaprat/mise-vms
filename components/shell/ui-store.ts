"use client"

import { create } from "zustand"

interface UiState {
  commandOpen: boolean
  copilotOpen: boolean
  copilotPrompt: string | null
  setCommandOpen: (open: boolean) => void
  setCopilotOpen: (open: boolean) => void
  /** Opens the copilot and sends a prompt (e.g. from a suggestion chip elsewhere in the app). */
  askCopilot: (prompt: string) => void
  consumeCopilotPrompt: () => string | null
}

export const useUi = create<UiState>()((set, get) => ({
  commandOpen: false,
  copilotOpen: false,
  copilotPrompt: null,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setCopilotOpen: (copilotOpen) => set({ copilotOpen }),
  askCopilot: (prompt) => set({ copilotOpen: true, copilotPrompt: prompt }),
  consumeCopilotPrompt: () => {
    const prompt = get().copilotPrompt
    if (prompt) set({ copilotPrompt: null })
    return prompt
  },
}))
