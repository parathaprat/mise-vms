"use client"

import * as React from "react"

import { BrandMark } from "@/components/app/brand"
import { CopilotPanel } from "@/components/copilot/copilot-panel"
import { bumpClock } from "@/hooks/use-demo"
import { useStore } from "@/lib/store"

import { HelpSheet } from "@/components/onboarding/help-sheet"
import { ProductTour } from "@/components/onboarding/tour"
import { useProgressTracking } from "@/components/onboarding/track"
import { WelcomeDialog } from "@/components/onboarding/welcome-dialog"

import { AppHeader } from "./app-header"
import { CommandMenu } from "./command-menu"
import { SectionTabs } from "./section-tabs"
import { useUi } from "./ui-store"

function Splash() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <div className="relative">
          <span className="absolute inset-0 animate-ping rounded-[12px] bg-brand/40" />
          <BrandMark className="relative size-12" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-heading text-lg font-semibold tracking-tight">Loading Mise</p>
        </div>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const ready = useStore((s) => s.ready)
  const copilotOpen = useUi((s) => s.copilotOpen)
  const setCopilotOpen = useUi((s) => s.setCopilotOpen)

  React.useEffect(() => {
    let cancelled = false
    const boot = async () => {
      await useStore.persist.rehydrate()
      if (cancelled) return
      window.setTimeout(() => {
        if (!cancelled) useStore.getState().ensureFresh()
      }, 16)
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!ready) return
    const id = window.setInterval(() => useStore.getState().tick(), 3000)
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        useStore.getState().tick()
        bumpClock()
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [ready])

  if (!ready) return <Splash />

  return <ReadyShell copilotOpen={copilotOpen} setCopilotOpen={setCopilotOpen}>{children}</ReadyShell>
}

function ReadyShell({
  children,
  copilotOpen,
  setCopilotOpen,
}: {
  children: React.ReactNode
  copilotOpen: boolean
  setCopilotOpen: (open: boolean) => void
}) {
  useProgressTracking()
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-1 flex-col gap-6 px-4 pt-6 pb-16 md:px-6 md:pt-8 lg:px-8">
        <SectionTabs />
        {children}
      </main>
      <CommandMenu />
      <CopilotPanel open={copilotOpen} onOpenChange={setCopilotOpen} />
      <HelpSheet />
      <WelcomeDialog />
      <ProductTour />
    </div>
  )
}
