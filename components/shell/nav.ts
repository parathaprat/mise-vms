import {
  BadgeDollarSignIcon,
  BuildingIcon,
  CalendarRangeIcon,
  ChartColumnIcon,
  ClipboardListIcon,
  CoinsIcon,
  HandshakeIcon,
  HouseIcon,
  InboxIcon,
  ReceiptTextIcon,
  ScaleIcon,
  Settings2Icon,
  TimerIcon,
  UsersRoundIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

import type { PersonaId } from "@/lib/types"

export type NavBadge = "inbox" | "timesheets" | "tips" | "requests"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
  personas: PersonaId[]
  badge?: NavBadge
  match?: string
  /** One line shown in search and help so people know what lives here. */
  hint?: string
}

/** A top-level place in the app. Partners only ever see five of these. */
export interface NavSection {
  id: string
  title: string
  /** Same place, named the way each role thinks about it. */
  titles?: Partial<Record<PersonaId, string>>
  icon: LucideIcon
  personas: PersonaId[]
  badge?: NavBadge
  pages: NavItem[]
}

const ALL: PersonaId[] = ["venue", "program", "supplier"]

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "home",
    title: "Home",
    icon: HouseIcon,
    personas: ALL,
    pages: [{ title: "Home", href: "/", icon: HouseIcon, personas: ALL, hint: "Today at a glance and what needs you" }],
  },
  {
    id: "staffing",
    title: "Staffing",
    titles: { supplier: "Orders" },
    icon: ClipboardListIcon,
    personas: ALL,
    pages: [
      {
        title: "Requests",
        href: "/requests",
        icon: ClipboardListIcon,
        personas: ALL,
        match: "/requests",
        hint: "Every staffing request and how it's filling",
      },
      {
        title: "Schedule",
        href: "/schedule",
        icon: CalendarRangeIcon,
        personas: ALL,
        hint: "The week by venue, plus the live check-in board",
      },
    ],
  },
  {
    id: "approvals",
    title: "Approvals",
    titles: { supplier: "Time" },
    icon: InboxIcon,
    personas: ALL,
    badge: "inbox",
    pages: [
      {
        title: "To do",
        href: "/inbox",
        icon: InboxIcon,
        personas: ALL,
        badge: "inbox",
        hint: "Everything waiting on you, one decision at a time",
      },
      {
        title: "Timesheets",
        href: "/timesheets",
        icon: TimerIcon,
        personas: ALL,
        badge: "timesheets",
        hint: "Hours worked, captured by geofenced check-in",
      },
      { title: "Tips", href: "/tips", icon: CoinsIcon, personas: ALL, badge: "tips", hint: "Enter and approve event tips" },
    ],
  },
  {
    id: "spend",
    title: "Spend",
    titles: { supplier: "Get paid" },
    icon: WalletIcon,
    personas: ALL,
    pages: [
      {
        title: "Invoices",
        href: "/invoices",
        icon: ReceiptTextIcon,
        personas: ALL,
        match: "/invoices",
        hint: "Weekly invoices and payments, built from approved time",
      },
      { title: "Insights", href: "/insights", icon: ChartColumnIcon, personas: ALL, hint: "Spend, fill rate and supplier quality" },
    ],
  },
  {
    id: "team",
    title: "Team",
    titles: { program: "Program", supplier: "Pros" },
    icon: UsersRoundIcon,
    personas: ALL,
    pages: [
      {
        title: "Pros",
        href: "/workforce",
        icon: UsersRoundIcon,
        personas: ALL,
        match: "/workforce",
        hint: "Favorites, blocked Pros and compliance",
      },
      { title: "Suppliers", href: "/suppliers", icon: HandshakeIcon, personas: ["program"], hint: "Scorecards, tiers and certificates" },
      { title: "Rates", href: "/rates", icon: BadgeDollarSignIcon, personas: ALL, hint: "What each position pays and bills" },
      { title: "Locations", href: "/locations", icon: BuildingIcon, personas: ["program", "venue"], hint: "Venues and cost centers" },
      { title: "Policies", href: "/policies", icon: ScaleIcon, personas: ["program"], hint: "Approval rules the platform enforces for you" },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = {
  title: "Settings",
  href: "/settings",
  icon: Settings2Icon,
  personas: ALL,
  hint: "Profile, notifications, appearance",
}

export function sectionTitle(section: NavSection, persona: PersonaId): string {
  return section.titles?.[persona] ?? section.title
}

export function sectionsFor(persona: PersonaId): (NavSection & { pages: NavItem[] })[] {
  return NAV_SECTIONS.filter((s) => s.personas.includes(persona))
    .map((s) => ({ ...s, pages: s.pages.filter((p) => p.personas.includes(persona)) }))
    .filter((s) => s.pages.length)
}

/** Every page a role can reach, for search and help. */
export function pagesFor(persona: PersonaId): NavItem[] {
  return [...sectionsFor(persona).flatMap((s) => s.pages), SETTINGS_ITEM]
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/") return pathname === "/"
  return pathname === item.href || pathname.startsWith(`${item.match ?? item.href}/`)
}

export function activeSection(pathname: string, persona: PersonaId) {
  return sectionsFor(persona).find((s) => s.pages.some((p) => isActive(pathname, p)))
}

export const ROUTE_TITLES: { prefix: string; title: string }[] = [
  { prefix: "/requests/new", title: "Request staff" },
  { prefix: "/requests", title: "Requests" },
  { prefix: "/inbox", title: "To do" },
  { prefix: "/schedule", title: "Schedule" },
  { prefix: "/timesheets", title: "Timesheets" },
  { prefix: "/tips", title: "Tips" },
  { prefix: "/invoices", title: "Invoices" },
  { prefix: "/workforce", title: "Pros" },
  { prefix: "/suppliers", title: "Suppliers" },
  { prefix: "/rates", title: "Rates" },
  { prefix: "/locations", title: "Locations" },
  { prefix: "/policies", title: "Policies" },
  { prefix: "/insights", title: "Insights" },
  { prefix: "/settings", title: "Settings" },
]
