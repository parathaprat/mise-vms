"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import {
  BanIcon,
  CheckIcon,
  CircleDashedIcon,
  ClipboardXIcon,
  CopyIcon,
  EllipsisIcon,
  FileInputIcon,
  MessageSquareIcon,
  PencilIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TimerIcon,
  UserPlusIcon,
  XCircleIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DataTable, type ColumnDef } from "@/components/app/data-table"
import { hueStyle, SupplierMark, WorkerCell } from "@/components/app/identity"
import {
  CopyId,
  EmptyState,
  KeyValue,
  LiveDot,
  TimeAgo,
} from "@/components/app/misc"
import { PageHeader } from "@/components/app/page-header"
import {
  ChangeStatusBadge,
  EntryStatusBadge,
  RequestStatusBadge,
  StatusBadge,
} from "@/components/app/status-badge"
import { ACTIVITY_ICON } from "@/components/shell/notifications"
import { useUi } from "@/components/shell/ui-store"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  useData,
  useLookups,
  useNow,
  usePersona,
  useRequestView,
} from "@/hooks/use-demo"
import {
  formatClock,
  formatDate,
  formatDateList,
  formatDateTime,
  formatTimeRange,
  timeAgo,
} from "@/lib/dates"
import { hours, initials, money, num, rate, round2 } from "@/lib/format"
import { PERSONAS } from "@/lib/reference"
import { ANOMALY_LABELS, postMsaRate } from "@/lib/rules"
import {
  requestInScope,
  workOrdersFor,
  type RequestView,
  type WorkOrder,
} from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { PersonaId, TimeEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

import {
  AddHeadcountDialog,
  CancelRequestDialog,
  DeclineRequestDialog,
  EditDetailsDialog,
} from "./request-dialogs"
import { RequestRoster } from "./request-roster"

const TAB_KEYS = [
  "roster",
  "timesheets",
  "workorders",
  "activity",
  "details",
] as const
type TabKey = (typeof TAB_KEYS)[number]

interface Step {
  key: string
  label: string
  state: "done" | "current" | "upcoming" | "stopped"
  hint: string
  at?: string
}

function buildSteps(
  view: RequestView,
  entries: TimeEntry[],
  now: Date
): Step[] {
  const { req, fill } = view
  const program = req.approvals.find((a) => a.id === "program")
  const assigned =
    view.req.state === "active" &&
    fill.total > 0 &&
    (fill.filled >= fill.total || now >= view.start)
  const allApproved =
    entries.length > 0 &&
    entries.every((e) => e.status !== "Pending" && e.status !== "Disputed")
  const allInvoiced =
    entries.length > 0 && entries.every((e) => e.status === "Invoiced")
  const worked = now >= view.end
  const working = now >= view.start && now < view.end
  const cancelled = req.state === "cancelled"
  const steps: Step[] = [
    {
      key: "posted",
      label: "Posted",
      state: "done",
      hint: `by ${req.createdBy}`,
      at: req.createdAt,
    },
    {
      key: "approved",
      label: "Approved",
      state:
        cancelled && program?.status === "Rejected"
          ? "stopped"
          : req.state === "pending"
            ? "current"
            : req.state === "draft"
              ? "upcoming"
              : "done",
      hint: program
        ? program.status === "Pending"
          ? `Waiting on ${program.approverName}`
          : `${program.status} · ${program.approverName}`
        : "Auto-approved by policy",
      at: program?.at ?? (req.state === "active" ? req.createdAt : undefined),
    },
    {
      key: "staffed",
      label: "Staffed",
      state: cancelled
        ? "stopped"
        : assigned
          ? "done"
          : req.state === "active"
            ? "current"
            : "upcoming",
      hint:
        req.state === "active"
          ? `${num(fill.filled)}/${num(fill.total)} confirmed`
          : "Distribution starts on approval",
    },
    {
      key: "worked",
      label: "Worked",
      state: cancelled
        ? "stopped"
        : worked
          ? "done"
          : working
            ? "current"
            : "upcoming",
      hint: worked
        ? `${num(fill.completed)} shifts worked`
        : working
          ? `${num(fill.checkedIn)} on site now`
          : formatDate(view.start, "EEE, MMM d"),
    },
    {
      key: "hours",
      label: "Hours approved",
      state:
        cancelled && entries.length === 0
          ? "stopped"
          : allApproved
            ? "done"
            : entries.length
              ? "current"
              : "upcoming",
      hint: entries.length
        ? `${num(entries.filter((e) => e.status !== "Pending" && e.status !== "Disputed").length)}/${num(entries.length)} timesheets`
        : "Captured at clock-out",
    },
    {
      key: "invoiced",
      label: "Invoiced",
      state:
        cancelled && entries.length === 0
          ? "stopped"
          : allInvoiced
            ? "done"
            : allApproved
              ? "current"
              : "upcoming",
      hint: allInvoiced
        ? [...new Set(entries.map((e) => e.invoiceId))]
            .filter(Boolean)
            .join(", ")
        : "Next Monday run",
    },
  ]
  return steps
}

function Pipeline({ steps }: { steps: Step[] }) {
  const doneCount = steps.filter((s) => s.state === "done").length
  return (
    <Card className="gap-4 py-4">
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-full bg-muted">
          <div
            className="h-1.5 rounded-full bg-primary transition-[width] duration-700"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        <ol className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          {steps.map((s) => (
            <li key={s.key} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                  s.state === "done" &&
                    "border-primary bg-primary text-primary-foreground",
                  s.state === "current" && "border-primary text-primary",
                  s.state === "stopped" &&
                    "border-destructive/40 text-destructive"
                )}
              >
                {s.state === "done" ? (
                  <CheckIcon className="size-3" />
                ) : s.state === "current" ? (
                  <CircleDashedIcon className="size-3 animate-spin [animation-duration:3s]" />
                ) : s.state === "stopped" ? (
                  <XCircleIcon className="size-3" />
                ) : null}
              </span>
              <div className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "text-sm font-medium",
                    s.state === "upcoming" && "text-muted-foreground"
                  )}
                >
                  {s.label}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {s.hint}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-heading text-lg font-semibold tracking-tight tabular">
        {value}
      </span>
      {hint ? (
        <span className="truncate text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  )
}

function TimesheetsTab({
  view,
  entries,
}: {
  view: RequestView
  entries: TimeEntry[]
}) {
  const persona = usePersona()
  const lookups = useLookups()
  const approveEntries = useStore((s) => s.approveEntries)
  const clean = entries.filter(
    (e) => e.status === "Pending" && e.anomalies.length === 0
  )
  const columns = React.useMemo<ColumnDef<TimeEntry, unknown>[]>(
    () => [
      {
        id: "pro",
        header: "Pro",
        cell: ({ row }) => (
          <WorkerCell
            worker={lookups.workers.get(row.original.workerId)}
            size="sm"
            subtitle={
              lookups.suppliers.get(
                lookups.workers.get(row.original.workerId)?.supplierId ?? ""
              )?.shortName
            }
          />
        ),
      },
      {
        id: "date",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap">
            {formatDate(row.original.date, "EEE, MMM d")}
          </span>
        ),
      },
      {
        id: "clock",
        header: "Clocked",
        cell: ({ row }) => (
          <span className="text-sm whitespace-nowrap tabular">
            {formatClock(row.original.clockIn)} –{" "}
            {row.original.clockOut ? (
              formatClock(row.original.clockOut)
            ) : (
              <span className="text-destructive">missing</span>
            )}
          </span>
        ),
      },
      {
        id: "hours",
        header: "Hours",
        cell: ({ row }) => (
          <span className="text-sm tabular">
            {hours(row.original.regularHours + row.original.overtimeHours)}
            {row.original.overtimeHours > 0 ? (
              <span className="ml-1 text-xs text-warning-foreground dark:text-warning">
                OT {hours(row.original.overtimeHours)}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <span className="text-sm tabular">
            {money(row.original.amount, true)}
          </span>
        ),
      },
      {
        id: "flags",
        header: "Flags",
        cell: ({ row }) =>
          row.original.anomalies.length ? (
            <div className="flex flex-wrap gap-1">
              {row.original.anomalies.map((a) => (
                <Badge
                  key={a}
                  variant="outline"
                  className="border-warning/40 text-warning-foreground dark:text-warning"
                >
                  {ANOMALY_LABELS[a]}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">–</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <EntryStatusBadge status={row.original.status} />,
      },
    ],
    [lookups]
  )
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={TimerIcon}
        title="No hours captured yet"
        description="Timesheets appear here automatically the moment each Pro clocks out, no TITO uploads."
      />
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {num(entries.length)} timesheets ·{" "}
          {hours(
            round2(
              entries.reduce((s, e) => s + e.regularHours + e.overtimeHours, 0)
            )
          )}{" "}
          ·{" "}
          {money(
            entries.reduce((s, e) => s + e.amount, 0),
            true
          )}
        </p>
        <div className="flex gap-2">
          {persona.id === "venue" && clean.length ? (
            <Button
              size="sm"
              onClick={() => {
                const n = approveEntries(clean.map((e) => e.id))
                toast.success(`Approved ${n} timesheets`, {
                  description:
                    "They roll into the next invoice run automatically.",
                })
              }}
            >
              <CheckIcon data-icon="inline-start" />
              Approve {clean.length} clean
            </Button>
          ) : null}
          <Button size="sm" variant="outline" asChild>
            <Link href={`/timesheets?request=${view.req.id}&tab=all`}>
              Open in Timesheets
            </Link>
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <DataTable
          columns={columns}
          data={entries}
          getRowId={(e) => e.id}
          pageSize={15}
          className="min-w-[760px]"
          dense
        />
      </div>
    </div>
  )
}

function WorkOrdersTab({ orders }: { orders: WorkOrder[] }) {
  const lookups = useLookups()
  const columns = React.useMemo<ColumnDef<WorkOrder, unknown>[]>(
    () => [
      {
        id: "id",
        header: "Work order",
        cell: ({ row }) => <CopyId value={row.original.id} />,
      },
      {
        id: "pro",
        header: "Pro",
        cell: ({ row }) => (
          <WorkerCell
            worker={lookups.workers.get(row.original.workerId)}
            href={`/workforce/${row.original.workerId}`}
            size="sm"
          />
        ),
      },
      {
        id: "dates",
        header: "Dates",
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.dates.length === 1
              ? formatDate(row.original.dates[0], "EEE, MMM d")
              : `${row.original.dates.length} dates`}
          </span>
        ),
      },
      {
        id: "rate",
        header: "Bill rate",
        cell: ({ row }) => (
          <span className="text-sm tabular">{rate(row.original.billRate)}</span>
        ),
      },
      {
        id: "hours",
        header: "Hours billed",
        cell: ({ row }) => (
          <span className="text-sm tabular">
            {row.original.hoursBilled ? hours(row.original.hoursBilled) : "–"}
          </span>
        ),
      },
      {
        id: "created",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.createdAt
              ? formatDateTime(row.original.createdAt)
              : "–"}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            tone={
              row.original.status === "Active"
                ? "primary"
                : row.original.status === "Completed"
                  ? "success"
                  : "muted"
            }
          >
            {row.original.status}
          </StatusBadge>
        ),
      },
    ],
    [lookups]
  )
  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <SparklesIcon />
        <AlertTitle>Work orders create themselves</AlertTitle>
        <AlertDescription>
          Each Pro gets a work order the instant they confirm, no job-seeker
          submissions, onboarding uploads, position-count caps or rate revisions
          to accept.
        </AlertDescription>
      </Alert>
      {orders.length === 0 ? (
        <EmptyState
          icon={ClipboardXIcon}
          title="No work orders yet"
          description="They'll appear as Pros confirm shifts on this request."
        />
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            data={orders}
            getRowId={(o) => o.id}
            pageSize={15}
            className="min-w-[720px]"
            dense
          />
        </div>
      )}
    </div>
  )
}

function ActivityTab({ view }: { view: RequestView }) {
  const persona = usePersona()
  const now = useNow()
  const activities = useData((d) => d.activities)
  const comments = useData((d) => d.comments)
  const addComment = useStore((s) => s.addComment)
  const [body, setBody] = React.useState("")
  const items = React.useMemo(() => {
    const acts = activities
      .filter((a) => a.requestId === view.req.id)
      .map((a) => ({ type: "activity" as const, at: a.at, a }))
    const cs = comments
      .filter((c) => c.requestId === view.req.id)
      .map((c) => ({ type: "comment" as const, at: c.at, c }))
    return [...acts, ...cs]
      .sort((x, y) => y.at.localeCompare(x.at))
      .slice(0, 80)
  }, [activities, comments, view.req.id])

  const send = () => {
    if (!body.trim()) return
    addComment(view.req.id, body)
    setBody("")
    toast.success("Message sent", {
      description: "Everyone on this request is notified.",
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>
            Every change, fill and message on this request, the audit trail is
            built in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No activity yet.
            </p>
          ) : (
            <ol className="flex flex-col">
              {items.map((item) => {
                if (item.type === "comment") {
                  const p = PERSONAS[item.c.authorPersona as PersonaId]
                  return (
                    <li
                      key={item.c.id}
                      className="relative flex gap-3 pb-5 last:pb-0"
                    >
                      <span
                        className="relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full hue-chip text-[10px] font-semibold"
                        style={hueStyle(p?.hue ?? 260)}
                      >
                        {initials(item.c.author)}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {item.c.author}
                          </span>{" "}
                          · {timeAgo(item.c.at, now)}
                        </span>
                        <p className="rounded-lg rounded-tl-sm border bg-muted/40 px-3 py-2 text-sm text-pretty">
                          {item.c.body}
                        </p>
                      </div>
                    </li>
                  )
                }
                const Icon = ACTIVITY_ICON[item.a.kind] ?? MessageSquareIcon
                return (
                  <li
                    key={item.a.id}
                    className="relative flex gap-3 pb-5 last:pb-0"
                  >
                    <span className="relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
                      <Icon className="size-3.5" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                      <span className="text-sm text-pretty">{item.a.text}</span>
                      <TimeAgo
                        value={item.a.at}
                        className="text-xs text-muted-foreground"
                      />
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </CardContent>
      </Card>
      <Card className="self-start">
        <CardHeader>
          <CardTitle>Message the team</CardTitle>
          <CardDescription>
            Venue, program office and suppliers see the same thread, no side
            emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Textarea
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send()
            }}
            placeholder={
              persona.id === "supplier"
                ? "e.g. 11 of 14 are returning Pros, sent the gate map in their briefing."
                : "e.g. Pros should use Gate K and arrive 20 minutes early for line-up."
            }
            aria-label="Message"
          />
          <Button onClick={send} disabled={!body.trim()} className="self-end">
            <SendIcon data-icon="inline-start" />
            Send
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function DetailsTab({ view }: { view: RequestView }) {
  const lookups = useLookups()
  const policies = useData((d) => d.policies)
  const rateCards = useData((d) => d.rateCards)
  const { req, costCenter } = view
  const markup = req.payRate ? req.billRate / req.payRate - 1 : 0
  const agency = req.agencyAward
    ? lookups.suppliers.get(req.agencyAward.supplierId)
    : lookups.suppliers.get(req.supplierIds[0] ?? "")
  const cardRate = rateCards.find(
    (item) =>
      item.positionId === req.positionId &&
      item.metro === view.venue.metro
  )?.billRate
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Shift briefing</CardTitle>
          <CardDescription>Exactly what Pros see in the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4">
            <KeyValue label="Duties">{req.duties}</KeyValue>
            <KeyValue label="Check-in">{req.checkIn}</KeyValue>
            <KeyValue label="Attire">{req.attire}</KeyValue>
            <KeyValue label="Parking & transit">{req.parking || "–"}</KeyValue>
            {req.notes ? (
              <KeyValue label="Note to suppliers">{req.notes}</KeyValue>
            ) : null}
          </dl>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Rates</CardTitle>
            <CardDescription>
              Awarded within the published rate card, transparent end to end.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <KeyValue label="Pro pay">{rate(req.payRate)}</KeyValue>
              <KeyValue label="Markup">{Math.round(markup * 100)}%</KeyValue>
              <KeyValue label="Awarded rate">{rate(req.billRate)}</KeyValue>
              <KeyValue label="Card ceiling">
                {cardRate !== undefined ? rate(cardRate) : "–"}
              </KeyValue>
              <KeyValue label={`Program fee (${policies.msaFeePct}%)`}>
                {rate(
                  round2(
                    req.billRate - postMsaRate(req.billRate, policies.msaFeePct)
                  )
                )}
              </KeyValue>
              <KeyValue label="Supplier net">
                {rate(postMsaRate(req.billRate, policies.msaFeePct))}
              </KeyValue>
              <KeyValue label={`Overtime (×${policies.overtimeMultiplier})`}>
                {rate(round2(req.billRate * policies.overtimeMultiplier))}
              </KeyValue>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Agency &amp; safety</CardTitle>
            <CardDescription>
              Who received the work, and why they were eligible.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {agency ? (
              <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
                <SupplierMark supplier={agency} size="md" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {agency.name}
                    {req.agencyAward ? (
                      <Badge variant="secondary">Best fit awarded</Badge>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {req.agencyAward?.reason ??
                      "Selected for this request"}
                  </span>
                </div>
                <span className="text-sm font-medium tabular">
                  {rate(req.billRate)}
                </span>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">
                <ShieldCheckIcon />
                Background checked
              </Badge>
              <Badge variant="outline">Insured agency</Badge>
              {cardRate !== undefined ? (
                <Badge variant="outline">
                  {req.billRate <= cardRate ? "Within rate card" : "Rate exception"}
                </Badge>
              ) : null}
              {req.requiredCerts.map((c) => (
                <Badge key={c} variant="secondary">
                  {c}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              If the awarded agency cannot fill, Mise opens only the remaining
              shifts to the next insured agency with safety-ready workers.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Approvals & cost center</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ol className="flex flex-col gap-3">
              {req.approvals.map((a) => (
                <li key={a.id} className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                      (a.status === "Approved" ||
                        a.status === "Auto-approved") &&
                        "border-success bg-success text-success-foreground",
                      a.status === "Rejected" &&
                        "border-destructive bg-destructive text-destructive-foreground",
                      a.status === "Pending" && "border-warning text-warning"
                    )}
                  >
                    {a.status === "Pending" ? (
                      <CircleDashedIcon className="size-3" />
                    ) : a.status === "Rejected" ? (
                      <XCircleIcon className="size-3" />
                    ) : (
                      <CheckIcon className="size-3" />
                    )}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {a.label} · {a.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {a.approverName}
                      {a.at ? ` · ${formatDateTime(a.at)}` : ""}
                      {a.note ? ` · ${a.note}` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            <dl className="grid grid-cols-2 gap-4 border-t pt-4">
              <KeyValue label="Cost center">
                {costCenter.code} · {costCenter.name}
              </KeyValue>
              <KeyValue label="GL code">{costCenter.glCode}</KeyValue>
              <KeyValue label="Approver">{costCenter.approverName}</KeyValue>
              <KeyValue label="Weekly budget">
                {money(costCenter.weeklyBudget)}
              </KeyValue>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function RequestDetail({ id }: { id: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const persona = usePersona()
  const now = useNow()
  const view = useRequestView(id)
  const lookups = useLookups()
  const changeRequests = useData((d) => d.changeRequests)
  const approveRequest = useStore((s) => s.approveRequest)
  const submitDraft = useStore((s) => s.submitDraft)
  const askCopilot = useUi((s) => s.askCopilot)
  const [dialog, setDialog] = React.useState<
    "headcount" | "cancel" | "edit" | "decline" | null
  >(null)
  const tabParam = params.get("tab") as TabKey | null
  const tab: TabKey =
    tabParam && TAB_KEYS.includes(tabParam) ? tabParam : "roster"

  const entries = React.useMemo(
    () => (view ? (lookups.entriesByRequest.get(view.req.id) ?? []) : []),
    [lookups, view]
  )
  const orders = React.useMemo(
    () =>
      view
        ? workOrdersFor(
            view.req,
            lookups.shiftsByRequest.get(view.req.id) ?? [],
            entries
          )
        : [],
    [view, lookups, entries]
  )

  if (!view) {
    return (
      <EmptyState
        icon={ClipboardXIcon}
        title={`${id} isn't in this workspace`}
        description="It may belong to an older demo session. Requests are regenerated relative to today when the demo resets."
        action={
          <Button asChild size="sm">
            <Link href="/requests">Back to requests</Link>
          </Button>
        }
      />
    )
  }
  if (!requestInScope(view.req, persona)) {
    return (
      <EmptyState
        icon={BanIcon}
        title="Not available in this workspace"
        description={`${view.req.id} belongs to ${view.venue.name}, which isn't visible to ${persona.org}. Switch persona to view it.`}
        action={
          <Button asChild size="sm">
            <Link href="/requests">Back to requests</Link>
          </Button>
        }
      />
    )
  }

  const { req, venue, position, costCenter, fill, status } = view
  const steps = buildSteps(view, entries, now)
  const pendingChanges = changeRequests.filter(
    (c) => c.requestId === req.id && c.status === "Pending"
  )
  const recentChanges = changeRequests
    .filter((c) => c.requestId === req.id && c.status !== "Pending")
    .slice(0, 2)
  const actualCost = entries.reduce((s, e) => s + e.amount, 0)
  const actualHours = entries.reduce(
    (s, e) => s + e.regularHours + e.overtimeHours,
    0
  )
  const isOver = status === "Completed" || status === "Cancelled"
  const canEdit = persona.id !== "supplier" && req.state === "active" && !isOver
  const setTab = (value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value === "roster") next.delete("tab")
    else next.set("tab", value)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <CopyId value={req.id} />
            <span>
              Posted by {req.createdBy} · <TimeAgo value={req.createdAt} />
            </span>
            {req.source === "Legacy import" ? (
              <Badge variant="outline" className="gap-1">
                <FileInputIcon />
                Imported history
              </Badge>
            ) : null}
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {req.headcount} × {position.title}
            <RequestStatusBadge status={status} className="text-sm" />
          </span>
        }
        description={`${req.eventName ? `${req.eventName} · ` : ""}${venue.name} · ${costCenter.code} ${costCenter.name} · ${formatDateList(req.dates, now)} · ${formatTimeRange(req.startTime, req.endTime)}`}
        actions={
          <>
            {persona.id === "program" && req.state === "pending" ? (
              <>
                <Button variant="outline" onClick={() => setDialog("decline")}>
                  Decline
                </Button>
                <Button
                  onClick={() => {
                    approveRequest(req.id)
                    toast.success(`${req.id} approved`, {
                      description: "Distribution to suppliers has started.",
                    })
                  }}
                >
                  <CheckIcon data-icon="inline-start" />
                  Approve
                </Button>
              </>
            ) : null}
            {req.state === "draft" && persona.id !== "supplier" ? (
              <Button
                onClick={() => {
                  const result = submitDraft(req.id)
                  if (result)
                    toast.success(
                      result.requiresProgramApproval
                        ? `${req.id} sent for program approval`
                        : `${req.id} is live`
                    )
                }}
              >
                <SendIcon data-icon="inline-start" />
                Submit request
              </Button>
            ) : null}
            {canEdit ? (
              <Button variant="outline" onClick={() => setDialog("headcount")}>
                <UserPlusIcon data-icon="inline-start" />
                Add headcount
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setTab("activity")}>
              <MessageSquareIcon data-icon="inline-start" />
              Message
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={() => askCopilot(`How is ${req.id} staffing up?`)}
                  >
                    <SparklesIcon />
                    Ask Mise about this
                  </DropdownMenuItem>
                  {persona.id !== "supplier" ? (
                    <DropdownMenuItem asChild>
                      <Link href={`/requests/new?duplicate=${req.id}`}>
                        <CopyIcon />
                        Duplicate request
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  {canEdit ||
                  (req.state === "draft" && persona.id !== "supplier") ? (
                    <DropdownMenuItem onSelect={() => setDialog("edit")}>
                      <PencilIcon />
                      Edit briefing
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
                {persona.id !== "supplier" &&
                req.state !== "cancelled" &&
                status !== "Completed" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDialog("cancel")}
                      >
                        <BanIcon />
                        {req.state === "draft"
                          ? "Discard draft"
                          : "Cancel request"}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {req.liveFill && req.state === "active" ? (
        <Alert className="border-brand/60 bg-brand/15">
          <Spinner className="text-brand-foreground dark:text-brand" />
          <AlertTitle>
            Distributing to{" "}
            {req.supplierIds
              .map((s) => lookups.suppliers.get(s)?.shortName)
              .filter(Boolean)
              .join(", ")}
          </AlertTitle>
          <AlertDescription className="flex w-full flex-col gap-2">
            <span>
              {req.favoritesFirst ? "Favorites were offered first. " : ""}
              {num(fill.filled)} of {num(fill.total)} confirmed, work orders
              are created as each Pro accepts.
            </span>
            <Progress
              value={fill.total ? (fill.filled / fill.total) * 100 : 0}
              className="h-1.5"
            />
          </AlertDescription>
        </Alert>
      ) : null}

      {req.state === "cancelled" ? (
        <Alert variant="destructive">
          <BanIcon />
          <AlertTitle>Cancelled</AlertTitle>
          <AlertDescription>
            {req.cancelledReason ?? "This request was cancelled."}
          </AlertDescription>
        </Alert>
      ) : null}

      {req.state === "pending" ? (
        <Alert className="border-warning/40 bg-warning/10">
          <CircleDashedIcon className="text-warning" />
          <AlertTitle>Waiting for program approval</AlertTitle>
          <AlertDescription>
            Estimated {money(view.estimate)} exceeds the auto-approve limit.{" "}
            {persona.id === "program"
              ? "Approve to start distribution immediately."
              : "Priya Raman was notified, distribution starts the moment it's approved."}
          </AlertDescription>
        </Alert>
      ) : null}

      {pendingChanges.map((c) => (
        <Alert key={c.id} className="border-warning/40 bg-warning/10">
          <CircleDashedIcon className="text-warning" />
          <AlertTitle className="flex items-center gap-2">
            {c.summary} <ChangeStatusBadge status={c.status} />
          </AlertTitle>
          <AlertDescription>
            {c.detail} Requested by {c.requestedBy} ·{" "}
            {timeAgo(c.createdAt, now)}.
            {persona.id === "program" ? (
              <Link
                href="/inbox"
                className="ml-1 font-medium text-primary underline-offset-2 hover:underline"
              >
                Review in Inbox
              </Link>
            ) : null}
          </AlertDescription>
        </Alert>
      ))}

      <Pipeline steps={steps} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MiniStat
          label="Staffed"
          value={`${num(fill.filled)}/${num(fill.total)}`}
          hint={
            fill.open
              ? `${num(fill.open)} open`
              : fill.total && fill.filled >= fill.total
                ? "Fully staffed"
                : fill.noShows
                  ? `${num(fill.noShows)} no-show${fill.noShows === 1 ? "" : "s"} not replaced`
                  : "–"
          }
        />
        <MiniStat
          label={status === "In progress" ? "On site now" : "Worked"}
          value={
            status === "In progress" ? (
              <span className="flex items-center gap-2">
                {num(fill.checkedIn)}
                <LiveDot />
              </span>
            ) : (
              num(fill.completed)
            )
          }
          hint={
            fill.noShows
              ? `${num(fill.noShows)} no-show${fill.noShows === 1 ? "" : "s"}${fill.backfilled ? ` · ${num(fill.backfilled)} backfilled` : ""}`
              : "Geofenced check-in"
          }
        />
        <MiniStat
          label="Hours"
          value={
            actualHours
              ? hours(round2(actualHours))
              : hours(round2(view.hoursPerShift * fill.total))
          }
          hint={
            actualHours
              ? "Captured"
              : `${hours(view.hoursPerShift)} per shift, scheduled`
          }
        />
        <MiniStat
          label="Labor cost"
          value={money(actualCost || view.estimate)}
          hint={
            actualCost ? `of ${money(view.estimate)} estimated` : "Estimated"
          }
        />
        <MiniStat
          label="Bill rate"
          value={rate(req.billRate)}
          hint={`Pay ${rate(req.payRate)} · rate card`}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList variant="line">
            <TabsTrigger value="roster">
              Roster
              <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground tabular">
                {num(fill.filled)}
              </span>
            </TabsTrigger>
            <TabsTrigger value="timesheets">
              Timesheets
              <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground tabular">
                {num(entries.length)}
              </span>
            </TabsTrigger>
            <TabsTrigger value="workorders">
              Work orders
              <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground tabular">
                {num(orders.length)}
              </span>
            </TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="roster">
          <RequestRoster view={view} />
        </TabsContent>
        <TabsContent value="timesheets">
          <TimesheetsTab view={view} entries={entries} />
        </TabsContent>
        <TabsContent value="workorders">
          <WorkOrdersTab orders={orders} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab view={view} />
        </TabsContent>
        <TabsContent value="details">
          <DetailsTab view={view} />
        </TabsContent>
      </Tabs>

      {recentChanges.length ? (
        <p className="text-xs text-muted-foreground">
          Recent changes:{" "}
          {recentChanges.map((c, i) => (
            <span key={c.id}>
              {i > 0 ? " · " : ""}
              {c.summary} ({c.status.toLowerCase()}{" "}
              {c.decidedBy ? `by ${c.decidedBy}` : ""})
            </span>
          ))}
        </p>
      ) : null}

      <AddHeadcountDialog
        view={view}
        open={dialog === "headcount"}
        onOpenChange={(o) => setDialog(o ? "headcount" : null)}
      />
      <CancelRequestDialog
        view={view}
        open={dialog === "cancel"}
        onOpenChange={(o) => setDialog(o ? "cancel" : null)}
      />
      <EditDetailsDialog
        view={view}
        open={dialog === "edit"}
        onOpenChange={(o) => setDialog(o ? "edit" : null)}
      />
      <DeclineRequestDialog
        view={view}
        open={dialog === "decline"}
        onOpenChange={(o) => setDialog(o ? "decline" : null)}
      />
    </>
  )
}
