"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  ChevronDownIcon,
  CompassIcon,
  LifeBuoyIcon,
  MailIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react"

import { useUi } from "@/components/shell/ui-store"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { usePersona } from "@/hooks/use-demo"
import { GLOSSARY, tasksFor, type GuideTask } from "@/lib/guide"
import { cn } from "@/lib/utils"

import { useOnboarding } from "./onboarding-store"

function matches(q: string, ...fields: (string | undefined)[]) {
  if (!q) return true
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = fields.join(" ").toLowerCase()
  return words.every((w) => hay.includes(w))
}

export function useRunGuideTask() {
  const router = useRouter()
  const setHelpOpen = useOnboarding((s) => s.setHelpOpen)
  const setCopilotOpen = useUi((s) => s.setCopilotOpen)
  return React.useCallback(
    (task: GuideTask) => {
      setHelpOpen(false)
      if (task.href) router.push(task.href)
      else setCopilotOpen(true)
    },
    [router, setHelpOpen, setCopilotOpen]
  )
}

function TaskRow({ task, open, onToggle }: { task: GuideTask; open: boolean; onToggle: () => void }) {
  const run = useRunGuideTask()
  return (
    <li className="rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left text-sm transition-colors hover:bg-muted/60"
      >
        <span className="flex-1 font-medium">{task.title}</span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col items-start gap-3 px-2.5 pt-0.5 pb-3">
              <p className="text-sm text-pretty text-muted-foreground">{task.answer}</p>
              <Button size="sm" variant="outline" onClick={() => run(task)}>
                {task.href ? null : <SparklesIcon data-icon="inline-start" />}
                {task.cta}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  )
}

export function HelpSheet() {
  const open = useOnboarding((s) => s.helpOpen)
  const setOpen = useOnboarding((s) => s.setHelpOpen)
  const initialQuery = useOnboarding((s) => s.helpQuery)
  const startTour = useOnboarding((s) => s.startTour)
  const restart = useOnboarding((s) => s.restart)
  const persona = usePersona()
  const [query, setQuery] = React.useState(initialQuery)
  const [expanded, setExpanded] = React.useState<string | null>(null)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        useOnboarding.getState().openHelp()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const tasks = tasksFor(persona.id).filter((t) => matches(query, t.title, t.answer, t.keywords))
  const terms = GLOSSARY.filter((g) => matches(query, g.term, g.plain, g.formerly))

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setQuery(useOnboarding.getState().helpQuery)
          setExpanded(null)
        }
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="gap-3 border-b p-5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <LifeBuoyIcon className="size-4" />
            </span>
            <div className="flex flex-col">
              <SheetTitle>Help</SheetTitle>
              <SheetDescription className="text-xs">Plain-English answers. Everything links straight to where you do it.</SheetDescription>
            </div>
          </div>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="How do I…"
              aria-label="Search help"
              autoFocus
            />
          </InputGroup>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <section className="flex flex-col gap-1 p-3">
            <h3 className="px-2.5 pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">How do I…</h3>
            {tasks.length ? (
              <ul className="flex flex-col">
                {tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    open={expanded === t.id || (!!query && tasks.length === 1)}
                    onToggle={() => setExpanded((v) => (v === t.id ? null : t.id))}
                  />
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-start gap-2 px-2.5 py-3">
                <p className="text-sm text-muted-foreground">No guide matches “{query}”. Mise can probably answer it directly.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOpen(false)
                    useUi.getState().askCopilot(query)
                  }}
                >
                  <SparklesIcon data-icon="inline-start" />
                  Ask Mise
                </Button>
              </div>
            )}
          </section>

          {terms.length ? (
            <section className="flex flex-col gap-1 border-t p-3">
              <h3 className="flex items-center gap-1.5 px-2.5 pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <BookOpenTextIcon className="size-3" />
                Words we use
              </h3>
              <dl className="flex flex-col">
                {terms.map((g) => (
                  <div key={g.term} className="flex flex-col gap-0.5 rounded-lg px-2.5 py-2">
                    <dt className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {g.term}
                      {g.formerly ? (
                        <span className="rounded-full bg-muted px-2 py-px text-[10px] font-normal text-muted-foreground">
                          Fieldglass: {g.formerly}
                        </span>
                      ) : null}
                    </dt>
                    <dd className="text-xs text-pretty text-muted-foreground">{g.plain}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t bg-muted/30 p-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false)
                window.setTimeout(startTour, 200)
              }}
            >
              <CompassIcon data-icon="inline-start" />
              Replay the tour
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="mailto:flexforce-support@compass.example?subject=Mise%20help">
                <MailIcon data-icon="inline-start" />
                Contact support
              </a>
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Kbd>⌘K</Kbd> search or ask
              </span>
              <span className="flex items-center gap-1">
                <Kbd>?</Kbd> help
              </span>
            </span>
            <button
              type="button"
              className="underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => {
                restart(persona.id)
                setOpen(false)
              }}
            >
              Restart onboarding
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
