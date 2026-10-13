"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import {
  ArrowRightLeftIcon,
  CircleHelpIcon,
  CompassIcon,
  InboxIcon,
  LifeBuoyIcon,
  CoinsIcon,
  MoonIcon,
  PlusIcon,
  ReceiptTextIcon,
  RotateCcwIcon,
  SparklesIcon,
  SunIcon,
  TimerIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { WorkerAvatar } from "@/components/app/identity"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useData, useLookups, usePersona } from "@/hooks/use-demo"
import { formatDate } from "@/lib/dates"
import { workerName } from "@/lib/format"
import { PERSONAS } from "@/lib/reference"
import { invoiceInScope, requestInScope, workerInScope } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { PersonaId } from "@/lib/types"

import { useRunGuideTask } from "@/components/onboarding/help-sheet"
import { useOnboarding } from "@/components/onboarding/onboarding-store"
import { tasksFor } from "@/lib/guide"

import { pagesFor } from "./nav"
import { useUi } from "./ui-store"

export function CommandMenu() {
  const open = useUi((s) => s.commandOpen)
  const setOpen = useUi((s) => s.setCommandOpen)
  const setCopilotOpen = useUi((s) => s.setCopilotOpen)
  const router = useRouter()
  const persona = usePersona()
  const lookups = useLookups()
  const data = useStore((s) => s.data)
  const invoices = useData((d) => d.invoices)
  const setPersona = useStore((s) => s.setPersona)
  const resetDemo = useStore((s) => s.resetDemo)
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(!useUi.getState().commandOpen)
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault()
        setCopilotOpen(!useUi.getState().copilotOpen)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setOpen, setCopilotOpen])

  const [search, setSearch] = React.useState("")
  const askCopilot = useUi((s) => s.askCopilot)
  const runTask = useRunGuideTask()
  const question = search.trim()
  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }
  const askGroup = (
    <CommandGroup forceMount heading={looksLikeQuestion(question) ? undefined : "Ask"}>
      <CommandItem
        forceMount
        value={`ask-mise ${question}`}
        onSelect={() => {
          setOpen(false)
          setSearch("")
          askCopilot(question)
        }}
      >
        <SparklesIcon className="text-foreground" />
        <span className="truncate">
          Ask Mise <span className="text-muted-foreground">“{question}”</span>
        </span>
        <CommandShortcut>↵</CommandShortcut>
      </CommandItem>
    </CommandGroup>
  )

  const requests = React.useMemo(
    () =>
      [...lookups.requests.values()]
        .filter((r) => requestInScope(r, persona))
        .sort((a, b) => b.id.localeCompare(a.id))
        .slice(0, 120),
    [lookups, persona]
  )
  const workers = React.useMemo(
    () => data.workers.filter((w) => workerInScope(w, data, persona)).slice(0, 300),
    [data, persona]
  )
  const scopedInvoices = React.useMemo(
    () => invoices.filter((i) => invoiceInScope(i, persona)).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 60),
    [invoices, persona]
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setSearch("")
      }}
      title="Search or ask Mise"
      description="Find anything, do anything, or ask a question"
    >
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search, or ask “who's late tonight?”"
      />
      <CommandList>
        <CommandEmpty>Nothing matched. Press Enter to ask Mise instead.</CommandEmpty>
        {question.length >= 2 && looksLikeQuestion(question) ? askGroup : null}
        <CommandGroup heading="Do something">
          {persona.id !== "supplier" ? (
            <CommandItem value="request staff new request post shifts job posting" onSelect={() => go("/requests/new")}>
              <PlusIcon />
              Request staff
              <CommandShortcut>One sentence</CommandShortcut>
            </CommandItem>
          ) : (
            <CommandItem value="fill shifts open orders assign" onSelect={() => go("/requests?tab=open")}>
              <PlusIcon />
              Fill open shifts
            </CommandItem>
          )}
          <CommandItem value="to do inbox approvals waiting decisions" onSelect={() => go("/inbox")}>
            <InboxIcon />
            See what needs me
          </CommandItem>
          <CommandItem
            value="ask mise copilot ai question"
            onSelect={() => {
              setOpen(false)
              setCopilotOpen(true)
            }}
          >
            <SparklesIcon />
            Ask Mise
            <CommandShortcut>⌘J</CommandShortcut>
          </CommandItem>
          {persona.id === "venue" ? (
            <>
              <CommandItem value="approve timesheets review hours" onSelect={() => go("/timesheets")}>
                <TimerIcon />
                Review timesheets
              </CommandItem>
              <CommandItem value="new tip batch tips" onSelect={() => go("/tips?new=1")}>
                <CoinsIcon />
                Enter tips for an event
              </CommandItem>
            </>
          ) : null}
          <CommandItem value="invoices payments" onSelect={() => go("/invoices")}>
            <ReceiptTextIcon />
            Invoices & payments
          </CommandItem>
          <CommandItem
            value="toggle theme dark light mode"
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
              setOpen(false)
            }}
          >
            {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
            Toggle {resolvedTheme === "dark" ? "light" : "dark"} mode
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Switch workspace">
          {(Object.keys(PERSONAS) as PersonaId[])
            .filter((id) => id !== persona.id)
            .map((id) => (
              <CommandItem
                key={id}
                value={`switch persona ${PERSONAS[id].name} ${PERSONAS[id].org} ${PERSONAS[id].title}`}
                onSelect={() => {
                  setPersona(id)
                  setOpen(false)
                  router.push("/")
                  toast.success(`Now viewing as ${PERSONAS[id].name}`, { description: PERSONAS[id].org })
                }}
              >
                <ArrowRightLeftIcon />
                View as {PERSONAS[id].org}
                <CommandShortcut>{PERSONAS[id].name}</CommandShortcut>
              </CommandItem>
            ))}
          <CommandItem
            value="reset demo data"
            onSelect={() => {
              resetDemo()
              setOpen(false)
              router.push("/")
              toast.success("Demo data reset")
            }}
          >
            <RotateCcwIcon />
            Reset demo data
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {pagesFor(persona.id).map((item) => (
            <CommandItem key={item.href} value={`go ${item.title} ${item.hint ?? ""}`} onSelect={() => go(item.href)}>
              <item.icon />
              {item.title}
              {item.hint ? <span className="hidden truncate text-xs text-muted-foreground sm:inline">{item.hint}</span> : null}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="How do I…">
          {tasksFor(persona.id).map((t) => (
            <CommandItem
              key={t.id}
              value={`how ${t.title} ${t.keywords}`}
              onSelect={() => {
                setOpen(false)
                runTask(t)
              }}
            >
              <CircleHelpIcon />
              {t.title}
            </CommandItem>
          ))}
          <CommandItem
            value="help guide glossary legacy terms support tour"
            onSelect={() => {
              setOpen(false)
              useOnboarding.getState().openHelp()
            }}
          >
            <LifeBuoyIcon />
            Open help & glossary
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="take the tour onboarding walkthrough"
            onSelect={() => {
              setOpen(false)
              useOnboarding.getState().startTour()
            }}
          >
            <CompassIcon />
            Take the 60-second tour
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Requests">
          {requests.map((r) => {
            const pos = lookups.positions.get(r.positionId)
            const venue = lookups.venues.get(r.venueId)
            return (
              <CommandItem
                key={r.id}
                value={`${r.id} ${pos?.title ?? ""} ${venue?.name ?? ""} ${r.eventName ?? ""}`}
                onSelect={() => go(`/requests/${r.id}`)}
              >
                <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                <span className="truncate">
                  {r.headcount} × {pos?.title} · {venue?.shortName}
                </span>
                <CommandShortcut>{formatDate([...r.dates].sort()[0], "MMM d")}</CommandShortcut>
              </CommandItem>
            )
          })}
        </CommandGroup>
        <CommandGroup heading="Pros">
          {workers.map((w) => (
            <CommandItem key={w.id} value={`${workerName(w)} ${w.firstName} ${w.lastName} ${w.id}`} onSelect={() => go(`/workforce/${w.id}`)}>
              <WorkerAvatar worker={w} size="sm" />
              {workerName(w)}
              <CommandShortcut>{lookups.suppliers.get(w.supplierId)?.shortName}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Invoices">
          {scopedInvoices.map((inv) => (
            <CommandItem key={inv.id} value={`${inv.id} invoice ${lookups.venues.get(inv.venueId)?.name ?? ""} ${lookups.suppliers.get(inv.supplierId)?.name ?? ""}`} onSelect={() => go(`/invoices/${inv.id}`)}>
              <ReceiptTextIcon />
              <span className="font-mono text-xs">{inv.id}</span>
              <span className="truncate text-muted-foreground">
                {lookups.suppliers.get(inv.supplierId)?.shortName} · {lookups.venues.get(inv.venueId)?.shortName}
              </span>
              <CommandShortcut>{inv.status}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        {question.length >= 2 && !looksLikeQuestion(question) ? askGroup : null}
      </CommandList>
    </CommandDialog>
  )
}

const QUESTION_START = /^(who|what|whats|what's|how|when|where|why|which|show|list|can|is|are|do|does|did|will|any|find|tell)\b/i

function looksLikeQuestion(q: string): boolean {
  return q.endsWith("?") || QUESTION_START.test(q) || q.split(/\s+/).length >= 4
}
