"use client"

import { usePathname, useRouter } from "next/navigation"
import * as React from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PartyPopperIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { usePersona } from "@/hooks/use-demo"
import type { PersonaId } from "@/lib/types"
import { cn } from "@/lib/utils"

import { useOnboarding } from "./onboarding-store"

interface TourStep {
  target?: string
  title: string
  body: string
  personas?: PersonaId[]
}

const STEPS: TourStep[] = [
  {
    target: "nav",
    title: "Five places. That's the whole app.",
    body: "Staffing, approvals, spend and your team. Each opens to simple tabs. Nothing is buried more than one click deep.",
  },
  {
    target: "cta",
    title: "Request staff in one sentence",
    body: "Type “8 bartenders Friday 5–11 at Wrigley” and Mise builds the request, checks rates and budget, and starts filling.",
    personas: ["venue", "program"],
  },
  {
    target: "todo",
    title: "Decide in one click",
    body: "Anything that needs you lands here with the right button attached. Approve timesheets, tips or invoices without opening a single page.",
  },
  {
    target: "search",
    title: "Search or just ask",
    body: "Find any request, Pro or invoice, or ask a question like “who's late tonight?”. Press ⌘K from anywhere.",
  },
  {
    target: "help",
    title: "Never stuck",
    body: "Every task explained in plain English, with a short glossary, and this tour again whenever you want it.",
  },
  {
    title: "You're ready",
    body: "Home shows today, what needs you, and the week ahead. Help stays in the header.",
  },
]

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

function findTarget(id: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)
  for (const n of nodes) {
    const r = n.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return n
  }
  return null
}

const PAD = 6
const CARD_W = 340

export function ProductTour() {
  const open = useOnboarding((s) => s.tourOpen)
  const step = useOnboarding((s) => s.tourStep)
  const setStep = useOnboarding((s) => s.setTourStep)
  const endTour = useOnboarding((s) => s.endTour)
  const persona = usePersona()
  const pathname = usePathname()
  const router = useRouter()
  const [rect, setRect] = React.useState<Rect | null>(null)
  const [viewport, setViewport] = React.useState({ w: 1280, h: 800 })

  const steps = React.useMemo(
    () => STEPS.filter((s) => !s.personas || s.personas.includes(persona.id)),
    [persona.id]
  )
  const current = steps[Math.min(step, steps.length - 1)]
  const isLast = step >= steps.length - 1

  React.useEffect(() => {
    if (open && pathname !== "/") router.push("/")
  }, [open, pathname, router])

  React.useEffect(() => {
    if (!open || !current?.target) return
    const el = findTarget(current.target)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < 72 || r.bottom > window.innerHeight - 40)
      el.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [open, current, pathname])

  React.useEffect(() => {
    if (!open) return
    let frame = 0
    let last = ""
    const loop = () => {
      const el = current?.target ? findTarget(current.target) : null
      const r = el?.getBoundingClientRect()
      const next = r
        ? { top: r.top, left: r.left, width: r.width, height: r.height }
        : null
      const key = next
        ? `${Math.round(next.top)}|${Math.round(next.left)}|${Math.round(next.width)}|${Math.round(next.height)}`
        : "none"
      const vp = `${window.innerWidth}x${window.innerHeight}`
      if (key + vp !== last) {
        last = key + vp
        setRect(next)
        setViewport({ w: window.innerWidth, h: window.innerHeight })
      }
      frame = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(frame)
  }, [open, current])

  const next = React.useCallback(() => {
    if (isLast) endTour()
    else setStep(step + 1)
  }, [isLast, endTour, setStep, step])
  const back = React.useCallback(
    () => setStep(Math.max(0, step - 1)),
    [setStep, step]
  )

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endTour()
      if (e.key === "ArrowRight" || e.key === "Enter") next()
      if (e.key === "ArrowLeft") back()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, next, back, endTour])

  if (!open || typeof document === "undefined" || !current) return null

  const mobile = viewport.w < 640
  const spot =
    rect && current.target
      ? {
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
        }
      : null

  let cardStyle: React.CSSProperties
  if (!spot || mobile) {
    cardStyle =
      mobile && spot
        ? { left: 12, right: 12, bottom: 16 }
        : {
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: Math.min(CARD_W + 40, viewport.w - 24),
          }
  } else {
    const below = spot.top + spot.height + 12
    const placeBelow = below + 220 < viewport.h
    const left = Math.min(
      Math.max(12, spot.left + spot.width / 2 - CARD_W / 2),
      viewport.w - CARD_W - 12
    )
    cardStyle = placeBelow
      ? { top: below, left, width: CARD_W }
      : { top: Math.max(12, spot.top - 12 - 200), left, width: CARD_W }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      {spot ? (
        <motion.div
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand"
          initial={false}
          animate={spot}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          style={{
            boxShadow:
              "0 0 0 9999px color-mix(in oklch, oklch(0.18 0.01 70) 58%, transparent)",
          }}
        />
      ) : (
        <motion.div
          className="absolute inset-0 bg-[color-mix(in_oklch,oklch(0.18_0.01_70)_58%,transparent)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="absolute flex flex-col gap-3 rounded-2xl border bg-popover p-4 text-popover-foreground shadow-2xl"
          style={cardStyle}
        >
          <div className="flex items-start gap-3">
            {isLast ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                <PartyPopperIcon className="size-4" />
              </span>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground tabular">
                {step + 1} of {steps.length}
              </span>
              <h2 className="font-heading text-base font-semibold tracking-tight text-balance">
                {current.title}
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={endTour}
              aria-label="Close tour"
              className="-mt-1 -mr-1"
            >
              <XIcon />
            </Button>
          </div>
          <p className="text-sm text-pretty text-muted-foreground">
            {current.body}
          </p>
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex gap-1" aria-hidden>
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    i === step ? "w-4 bg-foreground" : "w-1 bg-foreground/20"
                  )}
                />
              ))}
            </div>
            <div className="flex gap-1.5">
              {step > 0 ? (
                <Button variant="ghost" size="sm" onClick={back}>
                  <ArrowLeftIcon data-icon="inline-start" />
                  Back
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={endTour}>
                  Skip
                </Button>
              )}
              <Button size="sm" onClick={next} autoFocus>
                {isLast ? "Start working" : "Next"}
                {isLast ? null : <ArrowRightIcon data-icon="inline-end" />}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body
  )
}
