"use client"

import { useRouter } from "next/navigation"
import * as React from "react"
import { ArrowUpIcon, InfoIcon, RotateCcwIcon, SparklesIcon } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { BrandMark } from "@/components/app/brand"
import { useUi } from "@/components/shell/ui-store"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePersona } from "@/hooks/use-demo"
import { PERSONAS } from "@/lib/reference"
import { buildLookups } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { Persona, PersonaId } from "@/lib/types"

import { AssistantReply, FollowUps, planReply, revealDuration, SuggestionList, ThinkingIndicator, type ReplyHandlers } from "./blocks"
import { answer, SUGGESTIONS, type Reply } from "./engine"

interface CopilotPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; status: "thinking" }
  | { id: string; role: "assistant"; status: "streaming"; reply: Reply; startedAt: number; duration: number }
  | { id: string; role: "assistant"; status: "done"; reply: Reply }

type AssistantMessage = Extract<Message, { role: "assistant" }>

const THINK_MS = 350
const MAX_PROMPT = 500
const NO_MESSAGES: Message[] = []

const INTRO: Record<PersonaId, string> = {
  venue: "I can summarize what needs you, break down labor spend, find open shifts and your most reliable Pros, and draft a staffing request from a single sentence.",
  program: "I can break down spend across venues, surface approvals and supplier compliance, and track Pros against the 390-hour cap.",
  supplier: "I can find shifts your Pros can still fill, check disputed timesheets and show what payments are scheduled.",
}

const PLACEHOLDER: Record<PersonaId, string> = {
  venue: "Ask a question or describe a staffing request…",
  program: "Ask about spend, approvals, suppliers or the hours cap…",
  supplier: "Ask about open shifts, disputes or payments…",
}

const ERROR_REPLY: Reply = {
  intent: "error",
  blocks: [{ type: "text", text: "Something went wrong pulling that together. Try rephrasing, or ask about spend, open shifts, timesheets, invoices or compliance." }],
}

let nextId = 0
const messageId = () => `msg-${++nextId}`

/** Touch-first devices: don't pop the on-screen keyboard unprompted. */
const coarsePointer = () => window.matchMedia("(pointer: coarse)").matches

/** Keeps a scroll container pinned to the bottom as content grows, until the user scrolls up. */
function useStickToBottom() {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null)
  const stick = React.useRef(true)

  React.useEffect(() => {
    if (!node) return
    let lastTop = node.scrollTop
    const toBottom = () => {
      if (stick.current) node.scrollTo({ top: node.scrollHeight })
    }
    // Programmatic scrolls only ever move down, so scrolling up is always the user.
    const onScroll = () => {
      const top = node.scrollTop
      if (node.scrollHeight - top - node.clientHeight < 48) stick.current = true
      else if (top < lastTop) stick.current = false
      lastTop = top
    }
    const observer = new ResizeObserver(toBottom)
    observer.observe(node)
    if (node.firstElementChild) observer.observe(node.firstElementChild)
    node.addEventListener("scroll", onScroll, { passive: true })
    stick.current = true
    toBottom()
    return () => {
      observer.disconnect()
      node.removeEventListener("scroll", onScroll)
    }
  }, [node])

  const pin = React.useCallback(() => {
    stick.current = true
    node?.scrollTo({ top: node.scrollHeight })
  }, [node])

  return { ref: setNode, pin }
}

export function CopilotPanel({ open, onOpenChange }: CopilotPanelProps) {
  const persona = usePersona()
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const pending = useUi((s) => s.copilotPrompt)
  const [threads, setThreads] = React.useState<Partial<Record<PersonaId, Message[]>>>({})
  const [input, setInput] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const timers = React.useRef(new Set<number>())
  const inflight = React.useRef<PersonaId | null>(null)
  const wasBusy = React.useRef(false)
  const { ref: scrollRef, pin } = useStickToBottom()
  const logId = React.useId()

  const messages = threads[persona.id] ?? NO_MESSAGES
  const busy = React.useMemo(
    () => Object.values(threads).some((thread) => thread?.some((m) => m.role === "assistant" && m.status !== "done")),
    [threads]
  )

  React.useEffect(() => {
    const scheduled = timers.current
    return () => {
      scheduled.forEach((handle) => window.clearTimeout(handle))
      scheduled.clear()
    }
  }, [])

  const later = React.useCallback((fn: () => void, ms: number) => {
    const handle = window.setTimeout(() => {
      timers.current.delete(handle)
      fn()
    }, ms)
    timers.current.add(handle)
  }, [])

  const setAssistant = React.useCallback((personaId: PersonaId, next: AssistantMessage) => {
    setThreads((t) => ({ ...t, [personaId]: (t[personaId] ?? []).map((m) => (m.id === next.id ? next : m)) }))
  }, [])

  const send = React.useCallback(
    (raw: string) => {
      const text = raw.trim().slice(0, MAX_PROMPT)
      if (!text || inflight.current) return
      // Answer as whoever asked, even if the persona changes before the reply lands.
      const personaId = useStore.getState().persona
      inflight.current = personaId
      const userId = messageId()
      const id = messageId()
      setThreads((t) => ({
        ...t,
        [personaId]: [...(t[personaId] ?? []), { id: userId, role: "user", text }, { id, role: "assistant", status: "thinking" }],
      }))
      pin()
      later(() => {
        let reply: Reply
        try {
          const { data } = useStore.getState()
          reply = answer(text, { data, lookups: buildLookups(data), persona: PERSONAS[personaId], now: new Date() })
        } catch (error) {
          console.error("[copilot]", error)
          reply = ERROR_REPLY
        }
        const finish = () => {
          inflight.current = null
          setAssistant(personaId, { id, role: "assistant", status: "done", reply })
        }
        if (reduceMotion) {
          finish()
          return
        }
        const duration = revealDuration(planReply(reply.blocks).total)
        setAssistant(personaId, { id, role: "assistant", status: "streaming", reply, startedAt: Date.now(), duration })
        later(finish, duration)
      }, THINK_MS)
    },
    [later, pin, reduceMotion, setAssistant]
  )

  // Prompts queued from elsewhere in the app (askCopilot) send once the sheet has opened.
  React.useEffect(() => {
    if (!open || !pending || busy) return
    const handle = window.setTimeout(() => {
      const prompt = useUi.getState().consumeCopilotPrompt()
      if (prompt) send(prompt)
    }, 150)
    return () => window.clearTimeout(handle)
  }, [open, pending, busy, send])

  // Answering disables the textarea (and unmounts clicked chips), so focus falls back to the
  // body or the dialog container; hand it back to the input afterwards.
  React.useEffect(() => {
    if (wasBusy.current && !busy && open && !coarsePointer()) {
      const active = document.activeElement
      if (!active || active === document.body || active.getAttribute("role") === "dialog" || active.id === logId) textareaRef.current?.focus()
    }
    wasBusy.current = busy
  }, [busy, open, logId])

  React.useEffect(() => {
    pin()
  }, [persona.id, pin])

  const submit = () => {
    if (busy || !input.trim()) return
    send(input)
    setInput("")
  }

  const clear = () => {
    if (inflight.current === persona.id) {
      timers.current.forEach((handle) => window.clearTimeout(handle))
      timers.current.clear()
      inflight.current = null
    }
    setThreads((t) => ({ ...t, [persona.id]: [] }))
    setInput("")
    if (!coarsePointer()) window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handlers = React.useMemo<ReplyHandlers>(
    () => ({
      busy,
      onPrompt: send,
      onNavigate: () => onOpenChange(false),
      onDraft: (query) => {
        router.push(`/requests/new?draft=${query}`)
        onOpenChange(false)
      },
    }),
    [busy, send, onOpenChange, router]
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 bg-background outline-none data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          const textarea = textareaRef.current
          if (textarea && !textarea.disabled && !coarsePointer()) textarea.focus()
          else document.getElementById(logId)?.focus({ preventScroll: true })
        }}
      >
        <SheetHeader className="flex-row items-start gap-3 border-b py-3 pr-20 pl-4 sm:pl-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/45 text-brand-foreground dark:bg-brand/15 dark:text-brand">
            <SparklesIcon className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle>Ask Mise</SheetTitle>
            <SheetDescription className="truncate text-xs">Answering as {persona.org}</SheetDescription>
            <p className="flex items-start gap-1 text-[11px] leading-4 text-muted-foreground/80">
              <InfoIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
              Local demo: answers computed from live program data
            </p>
          </div>
        </SheetHeader>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="absolute top-3 right-11" onClick={clear} disabled={messages.length === 0} aria-label="Clear conversation">
              <RotateCcwIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear conversation</TooltipContent>
        </Tooltip>

        <div
          ref={scrollRef}
          id={logId}
          tabIndex={-1}
          role="log"
          aria-label="Conversation with Mise"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none"
        >
          <div className="flex min-h-full flex-col gap-5 px-4 py-5 sm:px-5">
            {messages.length === 0 ? <Welcome persona={persona} onPick={send} disabled={busy} /> : null}
            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  {m.role === "user" ? <UserBubble text={m.text} /> : <AssistantTurn message={m} last={i === messages.length - 1} {...handlers} />}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="border-t p-3 sm:p-4">
          <InputGroup className="bg-card">
            <InputGroupTextarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={busy ? "Mise is answering…" : PLACEHOLDER[persona.id]}
              aria-label="Ask Mise"
              maxLength={MAX_PROMPT}
              disabled={busy}
              rows={1}
              className="max-h-40 min-h-12 px-3 pt-3 pb-1.5"
            />
            <InputGroupAddon
              align="block-end"
              className="gap-2 pr-2"
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest("button")) textareaRef.current?.focus()
              }}
            >
              <span className="hidden items-center gap-1.5 text-xs font-normal sm:flex">
                <Kbd>↵</Kbd>
                to send
                <KbdGroup className="ml-1.5">
                  <Kbd>⇧</Kbd>
                  <Kbd>↵</Kbd>
                </KbdGroup>
                new line
              </span>
              {input.length > MAX_PROMPT - 100 ? (
                <span className="text-xs font-normal tabular">
                  {input.length}/{MAX_PROMPT}
                </span>
              ) : null}
              <InputGroupButton variant="default" size="icon-xs" className="ml-auto rounded-full" onClick={submit} disabled={busy || !input.trim()} aria-label="Send">
                <ArrowUpIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Welcome({ persona, onPick, disabled }: { persona: Persona; onPick: (prompt: string) => void; disabled: boolean }) {
  return (
    <div className="my-auto flex flex-col gap-6 py-2">
      <div className="flex flex-col gap-3">
        <BrandMark className="size-10" />
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-lg font-semibold tracking-tight text-balance">Hi {persona.firstName}, what can I pull up?</h3>
          <p className="text-sm text-pretty text-muted-foreground">{INTRO[persona.id]}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Try asking</p>
        <SuggestionList items={SUGGESTIONS[persona.id]} onPick={onPick} disabled={disabled} />
      </div>
    </div>
  )
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end pl-10">
      <p className="rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap text-primary-foreground">
        <span className="sr-only">You: </span>
        {text}
      </p>
    </div>
  )
}

function AssistantTurn({ message, last, ...handlers }: { message: AssistantMessage; last: boolean } & ReplyHandlers) {
  return (
    <div className="flex gap-3" aria-busy={message.status !== "done"} data-intent={message.status === "thinking" ? undefined : message.reply.intent}>
      <BrandMark className="mt-px size-6" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <span className="sr-only">Mise: </span>
        {message.status === "thinking" ? (
          <ThinkingIndicator />
        ) : (
          <AssistantReply
            reply={message.reply}
            stream={message.status === "streaming" ? { startedAt: message.startedAt, duration: message.duration } : undefined}
            {...handlers}
          />
        )}
        {last && message.status === "done" && message.reply.suggestions?.length ? (
          <FollowUps items={message.reply.suggestions} onPick={handlers.onPrompt} disabled={handlers.busy} />
        ) : null}
      </div>
    </div>
  )
}
