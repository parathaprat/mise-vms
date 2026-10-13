import {
  ClipboardCheckIcon,
  ClockIcon,
  FilePenLineIcon,
  FileWarningIcon,
  GitPullRequestArrowIcon,
  HandCoinsIcon,
  MessageSquareWarningIcon,
  ReceiptTextIcon,
  ScaleIcon,
  ShieldAlertIcon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react"

import type { InboxItem, InboxKind } from "@/lib/selectors"
import type { PersonaId } from "@/lib/types"

export type InboxGroup = "all" | "time" | "approvals" | "invoices" | "staffing" | "compliance"

export const INBOX_GROUPS: { value: InboxGroup; label: string }[] = [
  { value: "all", label: "All" },
  { value: "time", label: "Time & tips" },
  { value: "approvals", label: "Approvals" },
  { value: "invoices", label: "Invoices" },
  { value: "staffing", label: "Staffing" },
  { value: "compliance", label: "Compliance" },
]

export const KIND_GROUP: Record<InboxKind, Exclude<InboxGroup, "all">> = {
  timesheets: "time",
  dispute: "time",
  tips: "time",
  "tips-draft": "time",
  "request-approval": "approvals",
  change: "approvals",
  invoice: "invoices",
  "invoice-dispute": "invoices",
  staffing: "staffing",
  compliance: "compliance",
  "supplier-coi": "compliance",
}

/** Groups a persona can ever receive; others only appear if something unexpected lands in them. */
const PERSONA_GROUPS: Record<PersonaId, InboxGroup[]> = {
  venue: ["time", "invoices", "staffing", "compliance"],
  program: ["approvals", "invoices", "compliance"],
  supplier: ["time", "staffing"],
}

export function parseGroup(value: string | null): InboxGroup {
  return INBOX_GROUPS.some((g) => g.value === value) ? (value as InboxGroup) : "all"
}

export function inGroup(item: InboxItem, group: InboxGroup): boolean {
  return group === "all" || KIND_GROUP[item.kind] === group
}

export function groupCounts(items: InboxItem[]): Record<InboxGroup, number> {
  const counts: Record<InboxGroup, number> = { all: items.length, time: 0, approvals: 0, invoices: 0, staffing: 0, compliance: 0 }
  for (const item of items) counts[KIND_GROUP[item.kind]]++
  return counts
}

export function visibleGroups(persona: PersonaId, counts: Record<InboxGroup, number>): { value: InboxGroup; label: string }[] {
  return INBOX_GROUPS.filter((g) => g.value === "all" || PERSONA_GROUPS[persona].includes(g.value) || counts[g.value] > 0)
}

export const KIND_META: Record<InboxKind, { label: string; icon: LucideIcon }> = {
  timesheets: { label: "Timesheets", icon: ClockIcon },
  dispute: { label: "Timesheet dispute", icon: MessageSquareWarningIcon },
  tips: { label: "Tips", icon: HandCoinsIcon },
  "tips-draft": { label: "Tip draft", icon: FilePenLineIcon },
  "request-approval": { label: "Request approval", icon: ClipboardCheckIcon },
  change: { label: "Change request", icon: GitPullRequestArrowIcon },
  invoice: { label: "Invoice", icon: ReceiptTextIcon },
  "invoice-dispute": { label: "Invoice dispute", icon: ScaleIcon },
  staffing: { label: "Staffing gap", icon: UserPlusIcon },
  compliance: { label: "Compliance", icon: ShieldAlertIcon },
  "supplier-coi": { label: "Supplier insurance", icon: FileWarningIcon },
}

export const PRIORITY_TONE: Record<InboxItem["priority"], string> = {
  high: "bg-destructive/10 text-destructive",
  normal: "bg-primary/10 text-primary",
  low: "bg-muted text-muted-foreground",
}

/** What the headline amount on an item represents. */
export const AMOUNT_LABEL: Partial<Record<InboxKind, string>> = {
  timesheets: "awaiting approval",
  dispute: "on hold",
  tips: "in tips",
  "tips-draft": "draft total",
  invoice: "total due",
  "invoice-dispute": "invoice total",
  "request-approval": "estimated",
}

/** The record an item points at: `ts:JP-4003` → `JP-4003`. */
export function targetId(item: Pick<InboxItem, "id">): string {
  return item.id.slice(item.id.indexOf(":") + 1)
}

/** Where Enter takes you, a deep link straight to the record when the destination supports one. */
export function openHref(item: InboxItem): string {
  if (item.kind === "dispute") return `/timesheets?tab=disputed&entry=${targetId(item)}`
  return item.href
}
