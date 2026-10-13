"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import { CheckIcon, PartyPopperIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { usePersona } from "@/hooks/use-demo"
import { checklistFor } from "@/lib/guide"
import { cn } from "@/lib/utils"

import { useRunGuideTask } from "./help-sheet"
import { useOnboarding, useOnboardingHydrated } from "./onboarding-store"

/** Home strip that ticks itself off as the partner works, no "mark as done". */
export function GettingStarted() {
  const persona = usePersona()
  const hidden = useOnboarding((s) => s.checklistHidden[persona.id])
  const doneIds = useOnboarding((s) => s.done[persona.id])
  const hide = useOnboarding((s) => s.hideChecklist)
  const run = useRunGuideTask()
  const hydrated = useOnboardingHydrated()

  const tasks = checklistFor(persona.id)
  const done = new Set(doneIds ?? [])
  const count = tasks.filter((t) => done.has(t.id)).length
  const complete = count === tasks.length
  const nextTask = tasks.find((t) => !done.has(t.id))

  return (
    <AnimatePresence initial={false}>
      {hydrated && !hidden ? (
        <motion.section
          key="setup"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
          aria-label="Getting started"
        >
          <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 md:flex-row md:items-center md:gap-6 md:p-5">
            <div className="flex shrink-0 items-center gap-3 md:w-56">
              <ProgressRing value={count / tasks.length} complete={complete} />
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{complete ? "You're set up" : "Get set up"}</span>
                <span className="text-xs text-muted-foreground tabular">
                  {complete ? "That's everything you'll do day to day." : `${count} of ${tasks.length} done · ticks off as you work`}
                </span>
              </div>
            </div>

            <ol className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
              {tasks.map((t, i) => {
                const isDone = done.has(t.id)
                const isNext = t.id === nextTask?.id
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => run(t)}
                      title={t.title}
                      className={cn(
                        "group/step flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-[13px] transition-all",
                        isDone
                          ? "border-transparent bg-muted/50 text-muted-foreground"
                          : isNext
                            ? "border-foreground/15 bg-background shadow-xs hover:border-foreground/30"
                            : "border-dashed hover:border-solid hover:bg-muted/40"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular transition-colors",
                          isDone ? "bg-success text-success-foreground" : isNext ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {isDone ? <CheckIcon className="size-3" strokeWidth={3} /> : i + 1}
                      </span>
                      <span className={cn("truncate", isDone && "line-through decoration-muted-foreground/40", isNext && "font-medium")}>
                        {t.checklist!.short}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>

            <div className="flex shrink-0 items-center gap-1 self-end md:self-center">
              {complete ? (
                <Button size="sm" variant="outline" onClick={() => hide(persona.id, true)}>
                  <PartyPopperIcon data-icon="inline-start" />
                  Done
                </Button>
              ) : (
                <Button variant="ghost" size="icon-sm" onClick={() => hide(persona.id, true)} aria-label="Hide setup checklist">
                  <XIcon />
                </Button>
              )}
            </div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  )
}

function ProgressRing({ value, complete }: { value: number; complete: boolean }) {
  const r = 16
  const c = 2 * Math.PI * r
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3.5" className="stroke-muted" />
        <motion.circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          className={complete ? "stroke-success" : "stroke-foreground"}
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="text-[11px] font-semibold tabular">{Math.round(value * 100)}%</span>
    </span>
  )
}
