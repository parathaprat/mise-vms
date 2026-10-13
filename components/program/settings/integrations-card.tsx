"use client"

import { Fragment } from "react"
import { ArchiveIcon, BriefcaseBusinessIcon, HashIcon, KeyRoundIcon, LandmarkIcon, SmartphoneIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { StatusBadge, type Tone } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemFooter, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { useData, usePolicies } from "@/hooks/use-demo"
import { formatDate } from "@/lib/dates"

import { IconTile } from "../shared"

type IntegrationStatus = "connected" | "available" | "archive"

const STATUS: Record<IntegrationStatus, { tone: Tone; label: string }> = {
  connected: { tone: "success", label: "Connected" },
  available: { tone: "muted", label: "Available" },
  archive: { tone: "info", label: "Read-only" },
}

interface Integration {
  id: string
  name: string
  description: string
  detail: string
  icon: LucideIcon
  hue: number
  status: IntegrationStatus
}

export function IntegrationsCard({ className }: { className?: string }) {
  const cutoverDate = useData((d) => d.cutoverDate)
  const policies = usePolicies()

  const integrations: Integration[] = [
    {
      id: "instawork",
      name: "Instawork marketplace",
      description: "Requests, confirmations, check-ins and timesheets sync both ways in real time.",
      detail: "Live · webhooks",
      icon: SmartphoneIcon,
      hue: 145,
      status: "connected",
    },
    {
      id: "s4hana",
      name: "SAP S/4HANA AP",
      description: "Approved invoices post to accounts payable with GL and cost center coding.",
      detail: "Nightly · 2:00 AM CT",
      icon: LandmarkIcon,
      hue: 220,
      status: "connected",
    },
    {
      id: "workday",
      name: "Workday HCM",
      description: `Hands off Pros nearing the ${policies.contractualHoursCap}-hour cap for conversion to Compass associates.`,
      detail: "Not connected",
      icon: BriefcaseBusinessIcon,
      hue: 30,
      status: "available",
    },
    {
      id: "slack",
      name: "Slack",
      description: "Approvals, no-shows and rate changes post to #compass-vms-integration.",
      detail: "Compass Group workspace",
      icon: HashIcon,
      hue: 300,
      status: "connected",
    },
    {
      id: "fieldglass",
      name: "SAP Fieldglass",
      description: "Work orders, time sheets and invoices from before cutover, searchable, never editable.",
      detail: cutoverDate ? `Archive through ${formatDate(cutoverDate, "MMM d, yyyy")}` : "Archive",
      icon: ArchiveIcon,
      hue: 250,
      status: "archive",
    },
    {
      id: "google",
      name: "Google Workspace SSO",
      description: "Single sign-on and SCIM provisioning for Compass, Levy and Chartwells accounts.",
      detail: "SAML · SCIM",
      icon: KeyRoundIcon,
      hue: 200,
      status: "connected",
    },
  ]

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2>Integrations</h2>
        </CardTitle>
        <CardDescription>The systems Mise keeps in sync, so nobody re-keys a shift, a timesheet or an invoice.</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="grid gap-3 sm:grid-cols-2">
          {integrations.map((integration) => {
            const status = STATUS[integration.status]
            return (
              <Item key={integration.id} variant="outline" role="listitem" className="items-start">
                <ItemMedia>
                  <IconTile icon={integration.icon} hue={integration.hue} size="lg" />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="line-clamp-none">{integration.name}</ItemTitle>
                  <ItemDescription className="text-xs">{integration.description}</ItemDescription>
                </ItemContent>
                <ItemFooter className="pl-[52px]">
                  <span className="truncate text-xs text-muted-foreground">{integration.detail}</span>
                  <ItemActions>
                    {integration.status === "available" ? (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() =>
                          toast.success(`Access requested · ${integration.name}`, {
                            description: "Compass IT will reach out to schedule the connection.",
                          })
                        }
                      >
                        Request access
                      </Button>
                    ) : null}
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </ItemActions>
                </ItemFooter>
              </Item>
            )
          })}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

const SHORTCUTS: { combos: string[][]; label: string; where?: string }[] = [
  { combos: [["⌘", "K"]], label: "Search, or ask a question" },
  { combos: [["⌘", "J"]], label: "Ask Mise" },
  { combos: [["J"], ["K"]], label: "Next and previous item", where: "Inbox" },
  { combos: [["A"]], label: "Approve the selected item", where: "Inbox" },
  { combos: [["⌘", "↵"]], label: "Send a note or decision" },
  { combos: [["⌘", "S"]], label: "Save policy changes", where: "Policies" },
  { combos: [["Esc"]], label: "Close a dialog, sheet or panel" },
]

export function ShortcutsCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2>Keyboard shortcuts</h2>
        </CardTitle>
        <CardDescription>Use Ctrl in place of ⌘ on Windows.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
              <dt className="min-w-0 text-sm">
                {s.label}
                {s.where ? <span className="text-muted-foreground"> · {s.where}</span> : null}
              </dt>
              <dd className="flex shrink-0 items-center gap-1.5">
                {s.combos.map((combo, i) => (
                  <Fragment key={combo.join("+")}>
                    {i > 0 ? (
                      <span className="text-xs text-muted-foreground" aria-hidden>
                        /
                      </span>
                    ) : null}
                    <KbdGroup>
                      {combo.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </KbdGroup>
                  </Fragment>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
