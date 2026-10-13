"use client"

import * as React from "react"
import { MonitorIcon, MoonIcon, RotateCcwIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { Mark } from "@/components/app/identity"
import { KeyValue } from "@/components/app/misc"
import { PageHeader } from "@/components/app/page-header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useData, usePersona, usePolicies } from "@/hooks/use-demo"
import { formatDate } from "@/lib/dates"
import { plural } from "@/lib/format"
import { PERSONAS, PROGRAM_NAME } from "@/lib/reference"
import { useStore } from "@/lib/store"
import type { Persona, PersonaId } from "@/lib/types"

import { useToday } from "../shared"
import { IntegrationsCard, ShortcutsCard } from "./integrations-card"

const PERSONA_ORDER: PersonaId[] = ["program", "venue", "supplier"]

const ROLE: Record<PersonaId, string> = {
  program: "Program administrator",
  venue: "Venue manager",
  supplier: "Supplier partner",
}

type NotificationId = "digest" | "noShowSms" | "timesheets" | "invoices" | "slack"

const NOTIFICATION_DEFAULTS: Record<PersonaId, Record<NotificationId, boolean>> = {
  program: { digest: true, noShowSms: false, timesheets: true, invoices: true, slack: true },
  venue: { digest: true, noShowSms: true, timesheets: true, invoices: false, slack: false },
  supplier: { digest: true, noShowSms: true, timesheets: true, invoices: true, slack: true },
}

const subscribeNoop = () => () => {}

function useMounted(): boolean {
  return React.useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  )
}

export function SettingsPage() {
  const persona = usePersona()
  return (
    <>
      <PageHeader title="Settings" description="Your profile, notifications and the systems Mise connects to." />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <ProfileCard persona={persona} />
          <NotificationsCard key={persona.id} persona={persona} />
          <IntegrationsCard />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <AppearanceCard />
          <ShortcutsCard />
          <DemoCard />
        </div>
      </div>
    </>
  )
}

function accessLabel(persona: Persona, venueNames: Map<string, string>, venueCount: number, supplierMarkets: number): string {
  if (persona.id === "supplier") return `${persona.org} requests in ${plural(supplierMarkets, "market")}`
  if (persona.venueIds === "all") return `All ${venueCount} venues`
  return persona.venueIds.map((id) => venueNames.get(id) ?? id).join(", ")
}

function ProfileCard({ persona }: { persona: Persona }) {
  const setPersona = useStore((s) => s.setPersona)
  const venues = useData((d) => d.venues)
  const suppliers = useData((d) => d.suppliers)
  const venueNames = React.useMemo(() => new Map(venues.map((v) => [v.id, v.name])), [venues])
  const supplierMarkets = suppliers.find((s) => s.id === persona.supplierId)?.metros.length ?? 0

  const onPersonaChange = (value: string) => {
    const next = PERSONAS[value as PersonaId]
    if (!next || next.id === persona.id) return
    setPersona(next.id)
    toast.success(`Viewing Mise as ${next.name}`, { description: `${next.title} · ${next.org}` })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Profile</h2>
        </CardTitle>
        <CardDescription>Signed in with Google Workspace SSO. Details come from your company directory.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <Mark label={persona.name} hue={persona.hue} size="lg" className="size-14 rounded-2xl text-lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate font-heading text-lg font-semibold tracking-tight">{persona.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {persona.title} · {persona.org}
            </p>
          </div>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <KeyValue label="Email" className="min-w-0">
            <span className="block truncate">{persona.email}</span>
          </KeyValue>
          <KeyValue label="Role">{ROLE[persona.id]}</KeyValue>
          <KeyValue label="Access" className="min-w-0">
            <span className="text-pretty">{accessLabel(persona, venueNames, venues.length, supplierMarkets)}</span>
          </KeyValue>
        </dl>
        <FieldSeparator />
        <FieldGroup>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel htmlFor="settings-persona">Switch demo persona</FieldLabel>
              <FieldDescription>See Mise the way each team does. Data and changes carry over between personas.</FieldDescription>
            </FieldContent>
            <Select value={persona.id} onValueChange={onPersonaChange}>
              <SelectTrigger id="settings-persona" className="w-full @md/field-group:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PERSONA_ORDER.map((id) => {
                    const p = PERSONAS[id]
                    return (
                      <SelectItem key={id} value={id}>
                        <Mark label={p.name} hue={p.hue} size="xs" />
                        <span className="truncate">
                          {p.name} <span className="text-muted-foreground">· {p.org}</span>
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function NotificationsCard({ persona }: { persona: Persona }) {
  const policies = usePolicies()
  const [prefs, setPrefs] = React.useState(() => NOTIFICATION_DEFAULTS[persona.id])

  const rows: { id: NotificationId; label: string; description: string }[] = [
    {
      id: "digest",
      label: "Daily digest email",
      description: `A 7:00 AM summary of fills, approvals and spend, sent to ${persona.email}.`,
    },
    {
      id: "noShowSms",
      label: "Real-time no-show alerts (SMS)",
      description:
        persona.id === "supplier"
          ? `A text the moment one of your ${persona.org} Pros misses check-in.`
          : persona.id === "venue"
            ? "A text the moment a Pro misses check-in at your venues."
            : "A text the moment a Pro misses check-in anywhere in the program.",
    },
    {
      id: "timesheets",
      label: "Timesheets ready for review",
      description: `When timesheets are waiting on you, before they auto-approve after ${policies.timesheetAutoApproveHours} hours.`,
    },
    {
      id: "invoices",
      label: "Invoice issued",
      description: persona.id === "supplier" ? "When Mise issues an invoice for your shifts." : "When a weekly invoice is issued for your cost centers.",
    },
    {
      id: "slack",
      label: "Slack alerts to #compass-vms-integration",
      description: "Approvals, no-shows and rate changes, posted to the shared channel.",
    },
  ]

  const onChange = (row: (typeof rows)[number], checked: boolean) => {
    setPrefs((p) => ({ ...p, [row.id]: checked }))
    toast.success(`${row.label} ${checked ? "turned on" : "turned off"}`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Notifications</h2>
        </CardTitle>
        <CardDescription>Choose what reaches you outside Mise. Your Inbox always has everything.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          {rows.map((row, i) => (
            <React.Fragment key={row.id}>
              {i > 0 ? <FieldSeparator /> : null}
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={`notify-${row.id}`}>{row.label}</FieldLabel>
                  <FieldDescription>{row.description}</FieldDescription>
                </FieldContent>
                <Switch id={`notify-${row.id}`} checked={prefs[row.id]} onCheckedChange={(checked) => onChange(row, checked)} />
              </Field>
            </React.Fragment>
          ))}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function AppearanceCard() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  const value = mounted ? (theme ?? "system") : ""

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Appearance</h2>
        </CardTitle>
        <CardDescription>Light, dark, or match your operating system.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          value={value}
          onValueChange={(v) => v && setTheme(v)}
          aria-label="Theme"
          className="w-full *:flex-1"
        >
          <ToggleGroupItem value="light">
            <SunIcon data-icon="inline-start" />
            Light
          </ToggleGroupItem>
          <ToggleGroupItem value="dark">
            <MoonIcon data-icon="inline-start" />
            Dark
          </ToggleGroupItem>
          <ToggleGroupItem value="system">
            <MonitorIcon data-icon="inline-start" />
            System
          </ToggleGroupItem>
        </ToggleGroup>
        {mounted && theme === "system" && resolvedTheme ? (
          <p className="text-xs text-muted-foreground">Following your system · currently {resolvedTheme}.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function DemoCard() {
  const resetDemo = useStore((s) => s.resetDemo)
  const seededFor = useData((d) => d.seededFor)
  const cutoverDate = useData((d) => d.cutoverDate)
  const today = useToday()

  const onReset = () => {
    resetDemo()
    toast.success("Demo data reset", { description: `Fresh requests, shifts and invoices generated for ${formatDate(today, "EEEE, MMM d")}.` })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Demo controls</h2>
        </CardTitle>
        <CardDescription>This {PROGRAM_NAME} demo is generated relative to today and stored only in this browser.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4">
          <KeyValue label="Generated for">{seededFor ? formatDate(seededFor, "EEE, MMM d") : "–"}</KeyValue>
          <KeyValue label="Shared workflow started">{cutoverDate ? formatDate(cutoverDate, "MMM d, yyyy") : "–"}</KeyValue>
        </dl>
      </CardContent>
      <CardFooter className="flex-col items-start gap-3">
        <p className="text-xs text-muted-foreground text-pretty">
          Resetting regenerates every request, shift, timesheet, tip batch and invoice relative to today, and clears rate, policy and approval
          changes you&apos;ve made.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">
              <RotateCcwIcon data-icon="inline-start" />
              Reset demo data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
                <RotateCcwIcon />
              </AlertDialogMedia>
              <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
              <AlertDialogDescription>
                Mise regenerates the whole program relative to today. Rates, policies and approvals you&apos;ve changed are cleared. This only affects
                this browser.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onReset}>
                Reset data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  )
}
