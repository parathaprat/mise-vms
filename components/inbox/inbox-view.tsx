"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { CalendarRangeIcon, ChartColumnIcon, ClipboardListIcon, InboxIcon, ListFilterIcon, type LucideIcon } from "lucide-react"

import { EmptyState } from "@/components/app/misc"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import { useUi } from "@/components/shell/ui-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useInbox, useLookups, useNow, usePersona } from "@/hooks/use-demo"
import { toISODate } from "@/lib/dates"
import { plural } from "@/lib/format"
import { PERSONAS } from "@/lib/reference"
import { buildInbox, buildLookups } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { ISODate, Persona, PersonaId } from "@/lib/types"

import { primaryActionFor } from "./actions"
import type { DetailContext } from "./detail-layout"
import { InboxDetail } from "./inbox-detail"
import { InboxList, optionId } from "./inbox-list"
import { INBOX_GROUPS, groupCounts, inGroup, openHref, parseGroup, visibleGroups, type InboxGroup } from "./kinds"
import { useIsDesktop } from "./use-is-desktop"

const ZERO_ACTION: Record<PersonaId, { href: string; label: string; icon: LucideIcon }> = {
  venue: { href: "/schedule", label: "Open the schedule", icon: CalendarRangeIcon },
  program: { href: "/insights", label: "Review program insights", icon: ChartColumnIcon },
  supplier: { href: "/requests", label: "Browse open requests", icon: ClipboardListIcon },
}

/** `--inbox-top` is measured by `usePaneTop`; the trailing 4rem matches the shell's bottom padding. */
const PANE = "gap-0 py-0 lg:h-[calc(100svh_-_var(--inbox-top,22rem)_-_4rem)] lg:min-h-[28rem]"

const TYPING = "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='combobox']"
const OVERLAY = "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox'], [data-radix-popper-content-wrapper]"

interface Selection {
  id: string | null
  /** Where the selection sat, so a resolved item hands off to whatever slides into its place. */
  index: number
}

/** `all`: every shortcut. `letters`: j/k/a only, so Enter and arrows keep working on focused controls. */
type KeyScope = "all" | "letters" | "ignore"

function isTyping(el: Element): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || el.matches(TYPING))
}

function keyScope(target: Element | null, sheet: HTMLElement | null): KeyScope {
  if (!target || target === document.body) return "all"
  if (isTyping(target)) return "ignore"
  if (target.closest("[data-inbox-list]")) return "all"
  const overlay = target.closest(OVERLAY)
  return overlay && overlay !== sheet ? "ignore" : "letters"
}

/** Any open dialog other than the inbox's own sheet (Copilot, command menu, confirmations…). */
function foreignDialogOpen(sheet: HTMLElement | null): boolean {
  for (const el of document.querySelectorAll("[role='dialog'], [role='alertdialog']")) {
    if (el !== sheet && el.getAttribute("data-state") === "open") return true
  }
  return false
}

export function InboxPage() {
  const persona = usePersona()
  return <InboxWorkspace key={persona.id} persona={persona} />
}

function useInboxGroup(): InboxGroup {
  return parseGroup(useSearchParams().get("filter"))
}

function useToday(): ISODate {
  return toISODate(useNow())
}

/** Layout offset from the top of the document; unlike `getBoundingClientRect`, ignores entrance transforms. */
function documentTop(el: HTMLElement): number {
  let top = 0
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop
  return top
}

/** Lets the panes fill the rest of the viewport, however much chrome the shell stacks above them. */
function usePaneTop() {
  return React.useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const update = () => el.style.setProperty("--inbox-top", `${documentTop(el)}px`)
    update()
    // The shell is min-h-svh, so the body rarely resizes; watch everything that can push the panes down instead.
    const observer = new ResizeObserver(update)
    for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
      for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) observer.observe(sibling)
    }
    return () => observer.disconnect()
  }, [])
}

function InboxWorkspace({ persona }: { persona: Persona }) {
  const router = useRouter()
  const pathname = usePathname()
  const requested = useInboxGroup()
  const items = useInbox()
  const data = useStore((s) => s.data)
  const lookups = useLookups()
  const now = useNow()
  const today = useToday()
  const isDesktop = useIsDesktop()
  const openCopilot = useUi((s) => s.askCopilot)

  const [selection, setSelection] = React.useState<Selection>({ id: null, index: 0 })
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const listRef = React.useRef<HTMLDivElement>(null)
  const detailRef = React.useRef<HTMLDivElement>(null)
  const sheetRef = React.useRef<HTMLDivElement>(null)
  const focusOnOpen = React.useRef(false)
  const paneTopRef = usePaneTop()

  const { counts, urgent, groups, group, visible, index, selected, primary } = React.useMemo(() => {
    const counts = groupCounts(items)
    const urgent = items.filter((item) => item.priority === "high").length
    const groups = visibleGroups(persona.id, counts)
    const group = groups.some((g) => g.value === requested) ? requested : "all"
    const visible = items.filter((item) => inGroup(item, group))
    const byId = selection.id ? visible.findIndex((item) => item.id === selection.id) : -1
    const index = byId >= 0 ? byId : Math.min(selection.index, visible.length - 1)
    const selected = index >= 0 ? visible[index] : undefined
    const primary = selected ? primaryActionFor(selected, data, persona, today) : null
    return { counts, urgent, groups, group, visible, index, selected, primary }
  }, [items, persona, requested, selection, data, today])

  const groupLabel = INBOX_GROUPS.find((g) => g.value === group)?.label ?? "All"

  const selectIndex = (next: number) => {
    const clamped = Math.max(0, Math.min(visible.length - 1, next))
    const item = visible[clamped]
    if (item) setSelection({ id: item.id, index: clamped })
  }

  const changeGroup = (next: InboxGroup) => {
    const params = new URLSearchParams(window.location.search)
    if (next === "all") params.delete("filter")
    else params.set("filter", next)
    const qs = params.toString()
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
    setSelection((s) => ({ id: s.id, index: 0 }))
  }

  const commit = (mutation: () => unknown) => {
    const current = selected
    mutation()
    if (!current) return
    const state = useStore.getState()
    const after = buildInbox(state.data, buildLookups(state.data), PERSONAS[state.persona], now).filter((item) => inGroup(item, group))
    if (after.some((item) => item.id === current.id)) return
    const next = Math.max(0, Math.min(index, after.length - 1))
    setSelection({ id: after[next]?.id ?? null, index: next })
    if (isDesktop) listRef.current?.focus({ preventScroll: true })
  }

  const runPrimary = () => {
    if (!primary) return
    if (primary.type === "navigate") {
      router.push(primary.href)
    } else if (primary.type === "run") {
      commit(primary.run)
    } else {
      const root = isDesktop ? detailRef.current : sheetOpen ? sheetRef.current : null
      const field = root?.querySelector<HTMLElement>("[data-inbox-focus]")
      if (field) {
        field.focus()
      } else if (!isDesktop) {
        focusOnOpen.current = true
        setSheetOpen(true)
      }
    }
  }

  const askCopilot = (prompt: string) => {
    setSheetOpen(false)
    openCopilot(prompt)
  }

  const ctx: Omit<DetailContext, "variant"> = { persona, lookups, today, primary, runPrimary, commit, askCopilot }

  const onKeyDown = React.useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
    const sheet = sheetRef.current
    if (foreignDialogOpen(sheet)) return
    const target = event.target instanceof Element ? event.target : null

    if (event.key === "Escape") {
      if (target && isTyping(target) && detailRef.current?.contains(target)) {
        event.preventDefault()
        listRef.current?.focus()
      }
      return
    }

    const scope = keyScope(target, sheet)
    if (scope === "ignore" || !selected) return
    const all = scope === "all"
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const plain = !event.shiftKey

    let move: number | null = null
    if ((key === "j" && plain) || (all && key === "ArrowDown")) move = index + 1
    else if ((key === "k" && plain) || (all && key === "ArrowUp")) move = index - 1
    else if (all && key === "Home") move = 0
    else if (all && key === "End") move = visible.length - 1

    if (move != null) {
      event.preventDefault()
      selectIndex(move)
      if (isDesktop && document.activeElement !== listRef.current) listRef.current?.focus({ preventScroll: true })
    } else if (all && key === "Enter" && !event.repeat) {
      event.preventDefault()
      router.push(openHref(selected))
    } else if (key === "a" && plain && !event.repeat) {
      event.preventDefault()
      runPrimary()
    }
  })

  React.useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  const selectedId = selected?.id
  React.useEffect(() => {
    if (!selectedId || (!isDesktop && sheetOpen)) return
    document.getElementById(optionId(selectedId))?.scrollIntoView({ block: "nearest" })
  }, [selectedId, isDesktop, sheetOpen])

  const zero = ZERO_ACTION[persona.id]
  const ZeroIcon = zero.icon

  return (
    <>
      <PageHeader
        title="Inbox"
        actions={
          items.length > 0 ? (
            <>
              {urgent > 0 ? (
                <StatusBadge tone="danger" pulse>
                  {urgent} urgent
                </StatusBadge>
              ) : null}
              <span className="text-sm text-muted-foreground tabular">{plural(items.length, "item")} waiting</span>
            </>
          ) : null
        }
      >
        {items.length > 0 ? (
          <div className="-mx-4 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={group}
              onValueChange={(value) => {
                if (value) changeGroup(value as InboxGroup)
              }}
              aria-label="Filter inbox"
            >
              {groups.map((g) => (
                <ToggleGroupItem key={g.value} value={g.value} className="gap-1.5">
                  {g.label}
                  <Badge variant="secondary" className="tabular">
                    {counts[g.value]}
                  </Badge>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ) : null}
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="Inbox zero"
          description="Nothing needs you right now. Mise will surface the next decision the moment it lands."
          action={
            <Button variant="outline" asChild>
              <Link href={zero.href}>
                <ZeroIcon data-icon="inline-start" />
                {zero.label}
              </Link>
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ListFilterIcon}
          title={`Nothing in ${groupLabel}`}
          description={`This queue is clear. ${plural(counts.all, "other item")} still ${counts.all === 1 ? "needs" : "need"} you.`}
          action={
            <Button variant="outline" onClick={() => changeGroup("all")}>
              Show all {counts.all}
            </Button>
          }
        />
      ) : (
        <div ref={paneTopRef} className="grid gap-4 lg:grid-cols-[400px_minmax(0,1fr)]">
          <Card className={PANE}>
            <InboxList
              heading={group === "all" ? "Waiting on you" : groupLabel}
              items={visible}
              selectedId={selectedId}
              primaryLabel={primary?.label}
              listRef={listRef}
              onSelect={(next) => {
                selectIndex(next)
                if (!isDesktop) setSheetOpen(true)
              }}
              onOpen={(item) => router.push(openHref(item))}
            />
          </Card>
          {isDesktop && selected ? (
            <Card ref={detailRef} className={PANE}>
              <InboxDetail key={selected.id} item={selected} ctx={{ ...ctx, variant: "pane" }} />
            </Card>
          ) : null}
        </div>
      )}

      <Sheet open={!isDesktop && sheetOpen && !!selected} onOpenChange={setSheetOpen}>
        <SheetContent
          ref={sheetRef}
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
          onOpenAutoFocus={(event) => {
            if (!focusOnOpen.current) return
            focusOnOpen.current = false
            const field = sheetRef.current?.querySelector<HTMLElement>("[data-inbox-focus]")
            if (!field) return
            event.preventDefault()
            field.focus()
          }}
          onEscapeKeyDown={(event) => {
            if (event.target instanceof Element && event.target.closest("[data-inbox-note]")) event.preventDefault()
          }}
        >
          {selected ? <InboxDetail key={selected.id} item={selected} ctx={{ ...ctx, variant: "sheet" }} /> : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
