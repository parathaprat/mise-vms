"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowLeftIcon,
  BanIcon,
  CalendarIcon,
  CalendarPlusIcon,
  EllipsisIcon,
  LinkIcon,
  LockIcon,
  MailIcon,
  MapPinIcon,
  MapPinOffIcon,
  PhoneIcon,
  SparklesIcon,
  StarIcon,
  UserRoundXIcon,
} from "lucide-react"
import { toast } from "sonner"

import { SupplierMark, WorkerAvatar } from "@/components/app/identity"
import { CopyId, EmptyState } from "@/components/app/misc"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge, type Tone } from "@/components/app/status-badge"
import { useUi } from "@/components/shell/ui-store"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { usePersona } from "@/hooks/use-demo"
import { formatDate } from "@/lib/dates"
import { num, workerLegalName } from "@/lib/format"
import type { Persona, WorkerStatus } from "@/lib/types"

import { BlockDialog, UnblockButton, type BlockTarget } from "./block-dialog"
import { FavoriteControl } from "./favorite-control"
import {
  ActivityCard,
  CaptainNotesCard,
  CertificationsCard,
  ContractualHoursCard,
  OnboardingCard,
  PositionsCard,
  RecentWorkCard,
  UpcomingShiftsCard,
} from "./profile-sections"
import { useProProfile, type ProProfileData } from "./use-pro-profile"
import { FLAG_TONE, metroLabel } from "./use-workforce"

const STATUS_TONE: Record<WorkerStatus, Tone> = {
  Active: "success",
  Onboarding: "info",
  Inactive: "muted",
}

export function ProProfile({ id }: { id: string }) {
  const persona = usePersona()
  return <ProProfileView key={persona.id} id={id} persona={persona} />
}

function BackToWorkforce() {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href="/workforce">
        <ArrowLeftIcon data-icon="inline-start" />
        Back to workforce
      </Link>
    </Button>
  )
}

function ProProfileView({ id, persona }: { id: string; persona: Persona }) {
  const access = useProProfile(id)

  if (access.kind === "missing") {
    return (
      <EmptyState
        icon={UserRoundXIcon}
        title={`${id} isn't in this workspace`}
        description="The link may be from an older demo session. Pros are regenerated relative to today when the demo resets."
        action={<BackToWorkforce />}
        className="py-16"
      />
    )
  }
  if (access.kind === "other-supplier") {
    return (
      <EmptyState
        icon={LockIcon}
        title="This Pro isn't on your roster"
        description={`${id} works with another FlexForce supplier. ${persona.org} can view and manage only its own Pros.`}
        action={<BackToWorkforce />}
        className="py-16"
      />
    )
  }
  if (access.kind === "out-of-market") {
    return (
      <EmptyState
        icon={MapPinOffIcon}
        title="Outside your markets"
        description={`${id} works the ${metroLabel(access.worker.metro)} market, which isn't part of ${persona.org}. Switch persona to view this profile.`}
        action={<BackToWorkforce />}
        className="py-16"
      />
    )
  }
  return <ProfileBody profile={access.profile} />
}

function bookingBlocker(profile: ProProfileData): string | null {
  const { row, model, eligibleVenues, hours } = profile
  const { worker } = row
  if (worker.status !== "Active") return `${worker.status}, not yet cleared for shifts`
  if (model.policies.blockOverCapWorkers && hours.used >= hours.cap) return `At the ${hours.cap}-hour contractual cap`
  const blocked = new Set(row.blocks.map((b) => b.venueId))
  if (eligibleVenues.length > 0 && eligibleVenues.every((v) => blocked.has(v.id))) return "On the do-not-return list at every venue in their market"
  if (eligibleVenues.length === 0) return "No venues of yours in their market"
  return null
}

function ProfileBody({ profile }: { profile: ProProfileData }) {
  const { model, row, eligibleVenues } = profile
  const { worker } = row
  const { persona, canManage, venuesById } = model
  const askCopilot = useUi((s) => s.askCopilot)
  const [blockTarget, setBlockTarget] = React.useState<BlockTarget>({ open: false })
  const blockedIds = row.blocks.map((b) => b.venueId)
  const canBlock = canManage && eligibleVenues.some((v) => !blockedIds.includes(v.id))
  const blocker = bookingBlocker(profile)
  const requestHref = `/requests/new?worker=${row.id}`
  const titles = row.positions.map((p) => p.title)

  const copyLink = () => {
    void navigator.clipboard?.writeText(window.location.href).catch(() => undefined)
    toast.success("Profile link copied", { description: "Anyone with access to this workspace can open it." })
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/workforce" className="inline-flex items-center gap-1 rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
            <ArrowLeftIcon className="size-3.5" aria-hidden />
            Workforce
          </Link>
        }
        title={row.name}
        description={[titles.length ? titles.join(", ") : "No positions on file", row.supplier?.name, row.metroLabel].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button variant="outline" onClick={() => askCopilot(`Tell me about ${row.name}`)}>
              <SparklesIcon data-icon="inline-start" />
              Ask Mise
            </Button>
            {canManage ? (
              <FavoriteControl worker={worker} venues={eligibleVenues} favoriteVenueIds={row.favoriteVenueIds} blockedVenueIds={blockedIds} />
            ) : null}
            {canManage ? (
              blocker ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                      <Button disabled>
                        <CalendarPlusIcon data-icon="inline-start" />
                        Request this Pro
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{blocker}</TooltipContent>
                </Tooltip>
              ) : (
                <Button asChild>
                  <Link href={requestHref}>
                    <CalendarPlusIcon data-icon="inline-start" />
                    Request this Pro
                  </Link>
                </Button>
              )
            ) : null}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={copyLink}>
                    <LinkIcon />
                    Copy profile link
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                {canManage ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={!canBlock}
                        onSelect={() => setBlockTarget({ workerId: row.id, open: true })}
                      >
                        <BanIcon />
                        {canBlock ? "Add to do-not-return…" : "On every do-not-return list"}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <SummaryCard profile={profile} />

      {row.blocks.length ? (
        <section className="flex flex-col gap-3" aria-label="Do-not-return">
          {row.blocks.map((block) => {
            const venue = venuesById.get(block.venueId)
            return (
              <Alert key={block.venueId} variant="destructive">
                <BanIcon />
                <AlertTitle>On the {venue?.name ?? "venue"} do-not-return list</AlertTitle>
                <AlertDescription className="[&_p:not(:last-child)]:mb-1">
                  <p>&ldquo;{block.reason}&rdquo;</p>
                  <p>
                    Added by {block.by} on {formatDate(block.at, "MMM d, yyyy")}.{" "}
                    {persona.id === "supplier" ? "Mise won't offer them shifts there." : "Suppliers can't offer them shifts there."}
                  </p>
                </AlertDescription>
                {canManage && venue ? (
                  <AlertAction>
                    <UnblockButton worker={worker} venue={venue} size="xs" />
                  </AlertAction>
                ) : null}
              </Alert>
            )
          })}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <ContractualHoursCard profile={profile} />
          <CertificationsCard profile={profile} />
          <UpcomingShiftsCard profile={profile} requestHref={canManage && !blocker ? requestHref : undefined} />
          <RecentWorkCard profile={profile} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <OnboardingCard profile={profile} />
          <PositionsCard profile={profile} />
          <CaptainNotesCard profile={profile} />
          <ActivityCard profile={profile} />
        </div>
      </div>

      {canManage ? (
        <BlockDialog
          target={blockTarget}
          onOpenChange={(open) => setBlockTarget((prev) => ({ ...prev, open }))}
          candidates={[row]}
          venues={model.scopeVenues}
        />
      ) : null}
    </>
  )
}

function SummaryCard({ profile }: { profile: ProProfileData }) {
  const { row, model } = profile
  const { worker } = row
  const { persona, venuesById } = model
  const favoriteNames = row.favoriteVenueIds.map((id) => venuesById.get(id)?.shortName).filter(Boolean)

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <WorkerAvatar worker={worker} size="lg" className="data-[size=lg]:size-14 *:data-[slot=avatar-fallback]:text-lg" />
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={STATUS_TONE[worker.status]}>{worker.status}</StatusBadge>
              <CopyId value={worker.id} />
              {favoriteNames.length ? (
                <StatusBadge tone="warning" dot={false}>
                  <StarIcon className="size-3 fill-current" aria-hidden />
                  {persona.id === "supplier" ? "Favorited by" : "Favorite at"} {favoriteNames.join(", ")}
                </StatusBadge>
              ) : null}
              {row.blocks.length ? <StatusBadge tone="danger">Do-not-return · {row.blocks.length}</StatusBadge> : null}
              {row.flags
                .filter((f) => f.kind !== "hours-cap" && f.kind !== "hours-warn")
                .slice(0, 2)
                .map((flag) => (
                  <StatusBadge key={flag.label} tone={FLAG_TONE[flag.kind]}>
                    {flag.label}
                  </StatusBadge>
                ))}
            </div>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <SupplierMark supplier={row.supplier} size="xs" />
                {row.supplier?.name ?? "Supplier"}
              </li>
              <li className="flex items-center gap-1.5">
                <MapPinIcon className="size-3.5" aria-hidden />
                {row.metroLabel}
              </li>
              <li className="flex items-center gap-1.5">
                <PhoneIcon className="size-3.5" aria-hidden />
                <a href={`tel:${worker.phone.replace(/[^\d+]/g, "")}`} className="tabular hover:text-foreground hover:underline">
                  {worker.phone}
                </a>
              </li>
              <li className="flex min-w-0 items-center gap-1.5">
                <MailIcon className="size-3.5 shrink-0" aria-hidden />
                <a href={`mailto:${worker.email}`} className="truncate hover:text-foreground hover:underline">
                  {worker.email}
                </a>
              </li>
              <li className="flex items-center gap-1.5">
                <CalendarIcon className="size-3.5" aria-hidden />
                Joined {formatDate(worker.joinedAt, "MMM yyyy")}
              </li>
            </ul>
            {worker.preferredName ? (
              <p className="text-xs text-muted-foreground">
                Legal name <span className="font-medium text-foreground">{workerLegalName(worker)}</span>, used on timesheets, tips and invoices.
              </p>
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4 xl:shrink-0">
          <SummaryStat label="Rating">
            <span className="flex items-center gap-1">
              <StarIcon className="size-3.5 fill-warning text-warning" aria-hidden />
              {worker.rating.toFixed(2)}
            </span>
          </SummaryStat>
          <SummaryStat label="Reliability">{Math.round(worker.reliability * 100)}%</SummaryStat>
          <SummaryStat label="Lifetime shifts">{num(worker.lifetimeShifts)}</SummaryStat>
          <SummaryStat label={persona.id === "venue" ? "Shifts with you" : "Recent Compass shifts"}>{num(row.shiftsHere)}</SummaryStat>
        </dl>
      </CardContent>
    </Card>
  )
}

function SummaryStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 bg-card px-4 py-3 xl:min-w-32">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-lg font-semibold tracking-tight tabular">{children}</dd>
    </div>
  )
}
