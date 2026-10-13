"use client"

import { motion } from "motion/react"
import {
  BadgeCheckIcon,
  CheckCheckIcon,
  ClipboardListIcon,
  HandshakeIcon,
  MessageSquareTextIcon,
  ReceiptTextIcon,
  ScaleIcon,
  SparklesIcon,
  UsersRoundIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

import { BrandMark } from "@/components/app/brand"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { usePersona } from "@/hooks/use-demo"
import { BRAND_NAME } from "@/lib/reference"
import type { PersonaId } from "@/lib/types"
import { cn } from "@/lib/utils"

import { useOnboarding, useOnboardingHydrated } from "./onboarding-store"

interface Step {
  icon: LucideIcon
  title: string
}

const JOBS: Record<PersonaId, { lead: string; steps: Step[] }> = {
  venue: {
    lead: "Your whole job in Mise is three steps.",
    steps: [
      {
        icon: MessageSquareTextIcon,
        title: "Ask for people",
      },
      {
        icon: UsersRoundIcon,
        title: "Watch it fill",
      },
      {
        icon: CheckCheckIcon,
        title: "Approve & done",
      },
    ],
  },
  program: {
    lead: "Set the rules once. Mise runs the program.",
    steps: [
      {
        icon: ScaleIcon,
        title: "Set the rules",
      },
      {
        icon: BadgeCheckIcon,
        title: "Approve exceptions",
      },
      {
        icon: WalletIcon,
        title: "See every dollar",
      },
    ],
  },
  supplier: {
    lead: "Fill orders, answer questions, get paid.",
    steps: [
      {
        icon: ClipboardListIcon,
        title: "Fill open shifts",
      },
      {
        icon: HandshakeIcon,
        title: "Answer venues",
      },
      {
        icon: ReceiptTextIcon,
        title: "Get paid weekly",
      },
    ],
  },
}

export function WelcomeDialog() {
  const persona = usePersona()
  const welcomed = useOnboarding((s) => s.welcomed[persona.id])
  const markWelcomed = useOnboarding((s) => s.markWelcomed)
  const startTour = useOnboarding((s) => s.startTour)
  const hydrated = useOnboardingHydrated()

  const embedded =
    hydrated && typeof window !== "undefined" && window.self !== window.top
  const open = hydrated && !embedded && !welcomed
  const jobs = JOBS[persona.id]

  const finish = (tour: boolean) => {
    markWelcomed(persona.id)
    if (tour) window.setTimeout(startTour, 260)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && finish(false)}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-[560px]"
        showCloseButton={false}
      >
        <div className="relative overflow-hidden border-b bg-muted/40 px-6 pt-6 pb-5 sm:px-8 sm:pt-8">
          <div
            aria-hidden
            className="absolute -top-20 -right-16 size-56 rounded-full bg-brand/30 blur-3xl dark:bg-brand/12"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-dotted [mask-image:radial-gradient(ellipse_at_100%_0%,black,transparent_70%)] opacity-60"
          />
          <div className="relative flex flex-col gap-3">
            <BrandMark className="size-9" />
            <DialogTitle className="font-heading text-2xl font-semibold tracking-tight text-balance">
              Welcome to {BRAND_NAME}, {persona.firstName}
            </DialogTitle>
            <DialogDescription className="text-sm text-pretty text-muted-foreground">
              {jobs.lead}
            </DialogDescription>
          </div>
        </div>

        <div className="flex flex-col gap-5 px-6 py-5 sm:px-8 sm:py-6">
          <ol className="grid gap-3 sm:grid-cols-3">
            {jobs.steps.map((step, i) => (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.08 + i * 0.07,
                  duration: 0.4,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex gap-3 sm:flex-col sm:gap-2"
              >
                <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
                  <step.icon className="size-4" />
                  <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-brand-foreground tabular">
                    {i + 1}
                  </span>
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{step.title}</span>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>

        <div
          className={cn(
            "flex flex-col-reverse gap-2 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8"
          )}
        >
          <Button variant="ghost" onClick={() => finish(false)}>
            I&apos;ll explore on my own
          </Button>
          <Button onClick={() => finish(true)} autoFocus>
            <SparklesIcon data-icon="inline-start" />
            Show me around · 60 sec
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
