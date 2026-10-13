"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import * as React from "react"
import { LayoutGroup, motion } from "motion/react"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  CircleHelpIcon,
  CompassIcon,
  LaptopIcon,
  MoonIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  Settings2Icon,
  SunIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { BrandMark } from "@/components/app/brand"
import { hueStyle } from "@/components/app/identity"
import { LiveDot } from "@/components/app/misc"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { useData, useLookups, usePersona } from "@/hooks/use-demo"
import { initials, num } from "@/lib/format"
import { BRAND_NAME, PERSONAS, PROGRAM_NAME } from "@/lib/reference"
import { requestInScope } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { PersonaId } from "@/lib/types"
import { cn } from "@/lib/utils"

import { useOnboarding } from "@/components/onboarding/onboarding-store"

import { isActive, sectionsFor, sectionTitle } from "./nav"
import { NotificationsPopover } from "./notifications"
import { useUi } from "./ui-store"
import { useNavCounts } from "./use-nav-counts"

const PERSONA_BLURB: Record<PersonaId, string> = {
  venue: "Request staff, see who's on site, approve time & tips",
  program: "Set rates and rules, approve exceptions, see all spend",
  supplier: "Fill shifts, answer venues, get paid",
}

function PersonaAvatar({ id, className }: { id: PersonaId; className?: string }) {
  const p = PERSONAS[id]
  return (
    <span
      className={cn("hue-chip flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold", className)}
      style={hueStyle(p.hue)}
    >
      {initials(p.name)}
    </span>
  )
}

function WorkspaceSwitcher() {
  const persona = usePersona()
  const setPersona = useStore((s) => s.setPersona)
  const router = useRouter()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group/ws flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors hover:bg-muted data-[state=open]:bg-muted"
        >
          <PersonaAvatar id={persona.id} className="size-6 text-[10px]" />
          <span className="truncate">{persona.org}</span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="start" sideOffset={8}>
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {PROGRAM_NAME} workspaces · demo seats
        </DropdownMenuLabel>
        <DropdownMenuGroup>
          {(Object.keys(PERSONAS) as PersonaId[]).map((id) => {
            const p = PERSONAS[id]
            return (
              <DropdownMenuItem
                key={id}
                className="items-start gap-3 py-2"
                onSelect={() => {
                  if (id === persona.id) return
                  setPersona(id)
                  router.push("/")
                  toast.success(`Now viewing as ${p.name}`, { description: `${p.title} · ${p.org}` })
                }}
              >
                <PersonaAvatar id={id} className="mt-0.5" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{p.org}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.name} · {p.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{PERSONA_BLURB[id]}</span>
                </div>
                {id === persona.id ? <CheckIcon className="mt-1" /> : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu() {
  const persona = usePersona()
  const resetDemo = useStore((s) => s.resetDemo)
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
          <PersonaAvatar id={persona.id} className="size-8 text-xs" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="end" sideOffset={8}>
        <DropdownMenuLabel className="flex flex-col">
          <span className="text-sm font-medium">{persona.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{persona.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => router.push("/settings")}>
            <Settings2Icon />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => useOnboarding.getState().openHelp()}>
            <CircleHelpIcon />
            Help & guides
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => useOnboarding.getState().startTour()}>
            <CompassIcon />
            Take the tour
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {theme === "dark" ? <MoonIcon /> : theme === "light" ? <SunIcon /> : <LaptopIcon />}
              Appearance
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme ?? "light"} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => {
              resetDemo()
              router.push("/")
              toast.success("Demo data reset", { description: "A fresh week of FlexForce activity was generated." })
            }}
          >
            <RotateCcwIcon />
            Reset demo data
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative overflow-hidden"
    >
      <motion.span
        key={dark ? "moon" : "sun"}
        initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="flex"
      >
        {dark ? <MoonIcon /> : <SunIcon />}
      </motion.span>
    </Button>
  )
}

function LivePill() {
  const persona = usePersona()
  const lookups = useLookups()
  const shifts = useData((d) => d.shifts)
  const onSite = React.useMemo(() => {
    let count = 0
    for (const s of shifts) {
      if (s.status !== "Checked in") continue
      const req = lookups.requests.get(s.requestId)
      if (!req || !requestInScope(req, persona)) continue
      if (persona.id === "supplier" && lookups.workers.get(s.workerId ?? "")?.supplierId !== persona.supplierId) continue
      count++
    }
    return count
  }, [shifts, lookups, persona])
  return (
    <Link
      href="/schedule?view=live"
      className="hidden items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium transition-colors hover:bg-muted md:flex"
    >
      <LiveDot tone={onSite > 0 ? "success" : "warning"} calm={onSite === 0} />
      <motion.span key={onSite} initial={{ y: -4, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} className="tabular">
        {num(onSite)}
      </motion.span>
      <span className="text-muted-foreground">on site</span>
    </Link>
  )
}

function NavStrip() {
  const pathname = usePathname()
  const persona = usePersona()
  const counts = useNavCounts()
  const [hovered, setHovered] = React.useState<string | null>(null)
  const sections = sectionsFor(persona.id)

  return (
    <nav
      aria-label="Primary"
      data-tour="nav"
      className="-mb-px flex h-11 w-fit max-w-full items-stretch overflow-x-auto [scrollbar-width:none]"
      onMouseLeave={() => setHovered(null)}
    >
      <LayoutGroup id="nav">
        {sections.map((section) => {
          const active = section.pages.some((p) => isActive(pathname, p))
          const badge = section.badge ? counts[section.badge] : 0
          return (
            <Link
              key={section.id}
              href={section.pages[0].href}
              onMouseEnter={() => setHovered(section.id)}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 px-3 text-sm whitespace-nowrap transition-colors sm:px-3.5",
                active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {hovered === section.id ? (
                <motion.span
                  layoutId="nav-hover"
                  className="absolute inset-x-0.5 inset-y-1.5 rounded-md bg-muted"
                  transition={{ type: "spring", stiffness: 520, damping: 40 }}
                />
              ) : null}
              <span className="relative">{sectionTitle(section, persona.id)}</span>
              {badge > 0 ? (
                <span className="relative rounded-full bg-brand px-1.5 text-[10px] leading-4 font-semibold text-brand-foreground tabular">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
              {active ? (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-foreground"
                  transition={{ type: "spring", stiffness: 520, damping: 42 }}
                />
              ) : null}
            </Link>
          )
        })}
      </LayoutGroup>
    </nav>
  )
}

function PrimaryAction() {
  const persona = usePersona()
  const supplier = persona.id === "supplier"
  return (
    <Button size="sm" asChild className="ml-0.5 hidden sm:inline-flex" data-tour="cta">
      <Link href={supplier ? "/requests?tab=open" : "/requests/new"}>
        <PlusIcon data-icon="inline-start" />
        {supplier ? "Fill shifts" : "Request staff"}
      </Link>
    </Button>
  )
}

export function AppHeader() {
  const setCommandOpen = useUi((s) => s.setCommandOpen)
  const openHelp = useOnboarding((s) => s.openHelp)

  return (
    <header data-print="hide" className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/65">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 md:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-lg pr-1" aria-label={`${BRAND_NAME} home`}>
          <BrandMark className="size-7" />
          <span className="hidden font-heading text-[15px] font-semibold tracking-tight sm:inline">{BRAND_NAME}</span>
        </Link>
        <span aria-hidden className="text-lg font-light text-border">/</span>
        <WorkspaceSwitcher />
        <div className="ml-auto flex items-center gap-1">
          <LivePill />
          <button
            type="button"
            data-tour="search"
            onClick={() => setCommandOpen(true)}
            className="group/search hidden h-8 w-64 items-center gap-2 rounded-lg border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-muted/50 lg:flex"
          >
            <SearchIcon className="size-3.5" />
            <span>
              Search or <span className="text-shimmer font-medium">ask Mise</span>…
            </span>
            <Kbd className="ml-auto">⌘K</Kbd>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setCommandOpen(true)}
            aria-label="Search or ask Mise"
            data-tour="search"
          >
            <SearchIcon />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => openHelp()} aria-label="Help" data-tour="help">
            <CircleHelpIcon />
          </Button>
          <ThemeToggle />
          <NotificationsPopover />
          <PrimaryAction />
          <div className="ml-1.5">
            <UserMenu />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1400px] px-2 md:px-4 lg:px-6">
        <NavStrip />
      </div>
    </header>
  )
}
