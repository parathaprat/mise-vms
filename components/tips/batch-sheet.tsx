"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowUpRightIcon,
  BadgeCheckIcon,
  CheckIcon,
  FilePenLineIcon,
  HandCoinsIcon,
  HourglassIcon,
  PencilIcon,
  ReceiptTextIcon,
  SendIcon,
  Trash2Icon,
  Undo2Icon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

import { SupplierMark, WorkerCell } from "@/components/app/identity"
import { CopyId, KeyValue } from "@/components/app/misc"
import { StatusBadge, TIP_TONE } from "@/components/app/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useNow } from "@/hooks/use-demo"
import { formatDate, formatDateTime } from "@/lib/dates"
import { hours as formatHours, money, num, pct, plural, rate } from "@/lib/format"
import type { Invoice } from "@/lib/types"
import { cn } from "@/lib/utils"

import { approveTips, deleteDraft, returnTips, submitTips } from "./tip-actions"
import { isPolicyApproval, nextBusinessDay, nextInvoiceRun, TIP_STATUS_LABEL } from "./tip-utils"
import type { TipRow, TipsModel } from "./use-tips"

const LIST = new Intl.ListFormat("en-US", { style: "long", type: "conjunction" })

interface BatchSheetProps {
  row: TipRow | null
  model: TipsModel
  onOpenChange: (open: boolean) => void
  onEdit: (batchId: string) => void
  onDeleted: () => void
}

export function BatchSheet({ row, model, onOpenChange, onEdit, onDeleted }: BatchSheetProps) {
  // Keep the last batch on screen while the sheet animates closed.
  const [shown, setShown] = React.useState<TipRow | null>(row)
  if (row && row !== shown) setShown(row)
  const current = row ?? shown

  return (
    <Sheet open={!!row} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        {current ? (
          <BatchDetail key={current.id} row={current} model={model} onEdit={onEdit} onDeleted={onDeleted} />
        ) : (
          <SheetHeader>
            <SheetTitle>Tip batch</SheetTitle>
            <SheetDescription>Select a batch to see its split and status.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}

// Status timeline ----------------------------------------------------------------

type StepState = "done" | "current" | "upcoming" | "blocked"

interface TimelineStep {
  key: string
  icon: LucideIcon
  title: string
  detail?: React.ReactNode
  at?: string
  state: StepState
}

const STEP_DOT: Record<StepState, string> = {
  done: "border-success/30 bg-success/12 text-success dark:bg-success/18",
  current: "border-foreground/25 bg-background text-foreground ring-3 ring-foreground/5",
  upcoming: "border-dashed bg-background text-muted-foreground",
  blocked: "border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/20",
}

const STEP_LABEL: Record<StepState, string> = {
  done: "Done",
  current: "In progress",
  upcoming: "Up next",
  blocked: "Needs attention",
}

function InvoiceLinks({ invoices, model }: { invoices: Invoice[]; model: TipsModel }) {
  return (
    <span className="flex flex-col gap-1">
      <span>Billed at cost. Tips never carry a program fee.</span>
      <span className="flex flex-wrap gap-x-3 gap-y-1">
        {invoices.map((invoice) => (
          <Link
            key={invoice.id}
            href={`/invoices/${invoice.id}`}
            className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
          >
            {invoice.id}
            {model.persona.id !== "supplier" ? (
              <span className="font-normal text-muted-foreground">· {model.suppliersById.get(invoice.supplierId)?.shortName ?? "Supplier"}</span>
            ) : null}
            <ArrowUpRightIcon className="size-3" aria-hidden />
          </Link>
        ))}
      </span>
    </span>
  )
}

function buildTimeline(row: TipRow, model: TipsModel, now: Date): TimelineStep[] {
  const { batch, invoices, shares, venue } = row
  const { persona, today, policies } = model
  const isSupplier = persona.id === "supplier"
  const venueName = venue?.shortName ?? "The venue"
  const payers = isSupplier ? "You" : LIST.format(shares.map((s) => s.supplier?.shortName ?? "The supplier"))
  const pros = plural(row.lines.length, "Pro")

  const steps: TimelineStep[] = [
    {
      key: "entered",
      icon: FilePenLineIcon,
      title: `Entered by ${batch.createdBy}`,
      detail: `${batch.method} · ${plural(row.allPros, "Pro")}`,
      at: batch.createdAt,
      state: "done",
    },
  ]

  if (batch.status === "Draft") {
    steps.push({
      key: "approval",
      icon: SendIcon,
      title: "Not submitted yet",
      detail: policies.requireTipApproval
        ? "Submit it to send the split for venue approval."
        : "Program policy approves tips automatically on submit.",
      state: "current",
    })
  } else if (batch.status === "Pending approval") {
    steps.push({
      key: "approval",
      icon: HourglassIcon,
      title: "Waiting on venue approval",
      detail:
        persona.id === "venue"
          ? "Check the split, then approve it or return it with a note."
          : `${venueName} approves the split before anything is paid.`,
      state: "current",
    })
  } else if (batch.status === "Rejected") {
    steps.push({
      key: "approval",
      icon: Undo2Icon,
      title: "Returned for changes",
      detail: isSupplier ? "The venue is correcting the split." : batch.note,
      state: "blocked",
    })
  } else {
    const auto = isPolicyApproval(batch.approvedBy)
    steps.push({
      key: "approval",
      icon: BadgeCheckIcon,
      title: auto ? "Approved automatically" : `Approved by ${batch.approvedBy ?? venueName}`,
      detail: auto ? "Program policy doesn't require tip approval." : undefined,
      at: batch.approvedAt,
      state: "done",
    })
  }

  const approved = batch.status === "Approved" || batch.status === "Paid"
  const payDay = approved && batch.approvedAt ? nextBusinessDay(batch.approvedAt) : null
  const prosPaid = !!payDay && payDay <= today
  if (payDay) {
    steps.push({
      key: "pros",
      icon: HandCoinsIcon,
      title: prosPaid ? "Pros paid" : isSupplier ? "Pay your Pros" : "Pros get paid",
      detail: prosPaid
        ? `${payers} paid ${pros} directly, without waiting on the invoice.`
        : `${payers} ${isSupplier || shares.length > 1 ? "pay" : "pays"} ${pros} ${formatDate(payDay, "EEEE, MMM d")}.`,
      at: prosPaid ? payDay : undefined,
      state: prosPaid ? "done" : "current",
    })
  } else {
    steps.push({ key: "pros", icon: HandCoinsIcon, title: "Pros paid", detail: "The next business day after approval.", state: "upcoming" })
  }

  if (invoices.length) {
    steps.push({
      key: "invoice",
      icon: ReceiptTextIcon,
      title: invoices.length === 1 ? `Billed on ${invoices[0].id}` : `Billed on ${num(invoices.length)} supplier invoices`,
      detail: <InvoiceLinks invoices={invoices} model={model} />,
      at: invoices.map((i) => i.issuedAt).sort()[0],
      state: "done",
    })
  } else {
    steps.push({
      key: "invoice",
      icon: ReceiptTextIcon,
      title: approved ? "On the next weekly invoice" : "Billed on the weekly invoice",
      detail: approved
        ? `At cost with no program fee · issued ${formatDate(nextInvoiceRun(now), "EEE, MMM d")}`
        : "Billed at cost. Tips never carry a program fee.",
      state: approved && prosPaid ? "current" : "upcoming",
    })
  }

  const paidInvoices = invoices.filter((i) => i.status === "Paid")
  const reimbursed = invoices.length ? paidInvoices.length === invoices.length : batch.status === "Paid"
  steps.push({
    key: "reimbursed",
    icon: WalletIcon,
    title: isSupplier ? (reimbursed ? "Reimbursed" : "You're reimbursed") : "Supplier reimbursed",
    detail: reimbursed
      ? undefined
      : invoices.length
        ? `When ${LIST.format(invoices.map((i) => i.id))} ${invoices.length === 1 ? "is" : "are"} paid.`
        : "When the invoice is paid.",
    at: reimbursed
      ? paidInvoices
          .map((i) => i.paidAt)
          .filter((v): v is string => !!v)
          .sort()
          .pop()
      : undefined,
    state: reimbursed ? "done" : invoices.length ? "current" : "upcoming",
  })
  return steps
}

function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const Icon = step.icon
        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 ? (
              <span
                aria-hidden
                className={cn("absolute top-8 bottom-1 left-3.5 w-px", step.state === "done" ? "bg-success/40" : "bg-border")}
              />
            ) : null}
            <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full border", STEP_DOT[step.state])}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className={cn("text-sm font-medium", step.state === "upcoming" && "text-muted-foreground")}>
                  <span className="sr-only">{STEP_LABEL[step.state]}: </span>
                  {step.title}
                </span>
                {step.at ? (
                  <span className="text-xs text-muted-foreground tabular">
                    {step.at.includes("T") ? formatDateTime(step.at) : formatDate(step.at, "EEE, MMM d")}
                  </span>
                ) : null}
              </div>
              {step.detail ? <div className="text-xs text-pretty text-muted-foreground">{step.detail}</div> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// Detail -------------------------------------------------------------------------

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground text-pretty">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function HeaderStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-base font-semibold tracking-tight tabular">{value}</dd>
    </div>
  )
}

interface BatchDetailProps {
  row: TipRow
  model: TipsModel
  onEdit: (batchId: string) => void
  onDeleted: () => void
}

function BatchDetail({ row, model, onEdit, onDeleted }: BatchDetailProps) {
  const now = useNow()
  const [returning, setReturning] = React.useState(false)
  const { batch, venue, costCenter, lines, total, hours, shares, invoices } = row
  const { persona, workersById, suppliersById, canCreate, canApprove, policies, today } = model
  const isSupplier = persona.id === "supplier"
  const hiddenPros = row.allPros - lines.length
  const steps = React.useMemo(() => buildTimeline(row, model, now), [row, model, now])
  const sortedLines = React.useMemo(
    () => [...lines].sort((a, b) => b.amount - a.amount || b.hours - a.hours),
    [lines]
  )

  const payDay = batch.approvedAt ? nextBusinessDay(batch.approvedAt) : null
  let hint: string | null = null
  if (batch.status === "Pending approval" && !canApprove) {
    hint = isSupplier
      ? "The venue approves the split before anything is paid."
      : `Waiting on ${venue?.shortName ?? "the venue"}. Venue managers approve tips.`
  } else if (batch.status === "Rejected" && !canCreate) {
    hint = "Returned to the venue for changes."
  } else if (batch.status === "Approved" && isSupplier && payDay && payDay > today) {
    hint = `Pay these Pros by ${formatDate(payDay, "EEE, MMM d")}. Mise bills it at cost on your next invoice.`
  } else if (batch.status === "Approved" && !invoices.length) {
    hint = `Bills at cost on the ${formatDate(nextInvoiceRun(now), "EEE, MMM d")} invoice run.`
  } else if (batch.status === "Paid") {
    hint = isSupplier ? "Reimbursed. Nothing left to do." : "Pros paid and supplier reimbursed. Nothing left to do."
  }

  const canDelete = canCreate && batch.status === "Draft"
  const singleInvoice = invoices.length === 1 && (batch.status === "Approved" || batch.status === "Paid") ? invoices[0] : null

  return (
    <>
      <SheetHeader className="gap-3 border-b pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={TIP_TONE[batch.status]}>{TIP_STATUS_LABEL[batch.status]}</StatusBadge>
          <span className="text-xs text-muted-foreground">{batch.method}</span>
          <CopyId value={batch.id} className="ml-auto" />
        </div>
        <div className="flex flex-col gap-0.5">
          <SheetTitle className="text-lg text-balance">{batch.eventName}</SheetTitle>
          <SheetDescription>
            {venue?.name ?? "Unknown venue"} · {formatDate(batch.date, "EEEE, MMM d")}
          </SheetDescription>
        </div>
        <dl className="grid grid-cols-3 divide-x rounded-lg border">
          <HeaderStat label={isSupplier ? "Your Pros' tips" : "Total tips"} value={money(total, true)} />
          <HeaderStat
            label="Pros"
            value={
              <>
                {num(lines.length)}
                {isSupplier && hiddenPros > 0 ? <span className="text-sm font-normal text-muted-foreground"> of {num(row.allPros)}</span> : null}
              </>
            }
          />
          <HeaderStat label="Per hour" value={hours ? rate(total / hours) : "–"} />
        </dl>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        {batch.status === "Rejected" ? (
          <Alert variant="destructive">
            <Undo2Icon />
            <AlertTitle>Returned for changes</AlertTitle>
            <AlertDescription className="[&_p:not(:last-child)]:mb-1">
              {isSupplier ? (
                <p>The venue is correcting this batch. Nothing is paid until it&apos;s resubmitted and approved.</p>
              ) : (
                <>
                  {batch.note ? <p>“{batch.note}”</p> : null}
                  <p>
                    {canCreate ? "Fix the split and resubmit." : `Waiting on ${venue?.shortName ?? "the venue"} to fix the split.`}{" "}
                    Nothing is paid until it&apos;s approved.
                  </p>
                </>
              )}
            </AlertDescription>
          </Alert>
        ) : batch.note ? (
          <figure className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-3 py-2.5">
            <blockquote className="text-sm text-pretty">&ldquo;{batch.note}&rdquo;</blockquote>
            <figcaption className="text-xs text-muted-foreground">Note from {batch.createdBy}</figcaption>
          </figure>
        ) : null}

        <Section title="Status">
          <Timeline steps={steps} />
        </Section>

        {!isSupplier && shares.length ? (
          <Section title="Routing by supplier" description="Each supplier pays its own Pros, then bills the tips at cost on its weekly invoice.">
            <ul className="flex flex-col gap-3">
              {shares.map((share) => (
                <li key={share.supplierId} className="flex flex-col gap-1.5">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    <SupplierMark supplier={share.supplier} size="xs" />
                    <span className="truncate font-medium">{share.supplier?.shortName ?? "Unknown supplier"}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {plural(share.pros, "Pro")} · {formatHours(share.hours)}
                    </span>
                    <span className="ml-auto font-medium tabular">{money(share.total, true)}</span>
                  </div>
                  <Progress value={total ? (share.total / total) * 100 : 0} aria-label={`${share.supplier?.shortName ?? "Supplier"} share`} />
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section
          title={isSupplier ? "Your Pros" : "Split"}
          description={
            isSupplier && hiddenPros > 0
              ? `${plural(hiddenPros, "Pro")} from other suppliers ${hiddenPros === 1 ? "is" : "are"} on this batch. Their amounts stay with the venue and their supplier.`
              : undefined
          }
        >
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 text-xs text-muted-foreground">Pro</TableHead>
                  <TableHead className="h-9 text-right text-xs text-muted-foreground">Hours</TableHead>
                  {!isSupplier ? <TableHead className="h-9 text-right text-xs text-muted-foreground">Share</TableHead> : null}
                  <TableHead className="h-9 text-right text-xs text-muted-foreground">Tips</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLines.map((line) => {
                  const worker = workersById.get(line.workerId)
                  const supplier = worker ? suppliersById.get(worker.supplierId) : undefined
                  return (
                    <TableRow key={line.workerId} className="hover:bg-transparent">
                      <TableCell className="max-w-56">
                        <WorkerCell
                          worker={worker}
                          size="sm"
                          href={worker ? `/workforce/${worker.id}` : undefined}
                          subtitle={isSupplier ? line.workerId : (supplier?.shortName ?? line.workerId)}
                        />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular">{formatHours(line.hours)}</TableCell>
                      {!isSupplier ? (
                        <TableCell className="text-right text-muted-foreground tabular">{total ? pct(line.amount / total) : "–"}</TableCell>
                      ) : null}
                      <TableCell className="text-right font-medium tabular">{money(line.amount, true)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell>{plural(lines.length, "Pro")}</TableCell>
                  <TableCell className="text-right tabular">{formatHours(hours)}</TableCell>
                  {!isSupplier ? <TableCell /> : null}
                  <TableCell className="text-right tabular">{money(total, true)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </Section>

        <Section title="Details">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <KeyValue label="Venue">{venue?.name ?? "–"}</KeyValue>
            <KeyValue label="Cost center">{costCenter ? `${costCenter.code} · ${costCenter.name}` : "–"}</KeyValue>
            <KeyValue label="Entered">
              <span className="tabular">{formatDateTime(batch.createdAt)}</span>
            </KeyValue>
            <KeyValue label="Split method">{batch.method}</KeyValue>
            <KeyValue label={batch.requestIds.length === 1 ? "Request" : "Requests"} className="col-span-2">
              {batch.requestIds.length ? (
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  {batch.requestIds.map((id) => (
                    <Link key={id} href={`/requests/${id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                      {id}
                    </Link>
                  ))}
                </span>
              ) : (
                "–"
              )}
            </KeyValue>
          </dl>
        </Section>
      </div>

      {hint || canDelete || (canCreate && batch.status === "Rejected") || (canApprove && batch.status === "Pending approval") || singleInvoice ? (
        <SheetFooter className="mt-0 flex-row flex-wrap items-center justify-end gap-2 border-t">
          {canDelete ? <DeleteDraftButton row={row} onDeleted={onDeleted} /> : null}
          {hint ? <p className="mr-auto text-xs text-muted-foreground text-pretty">{hint}</p> : null}
          {canCreate && batch.status === "Draft" ? (
            <>
              <Button variant="outline" onClick={() => onEdit(batch.id)}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
              <Button onClick={() => submitTips(batch.id)}>
                <SendIcon data-icon="inline-start" />
                {policies.requireTipApproval ? "Submit for approval" : "Submit tips"}
              </Button>
            </>
          ) : null}
          {canApprove && batch.status === "Pending approval" ? (
            <>
              <Button variant="ghost" onClick={() => onEdit(batch.id)}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
              <Button variant="outline" onClick={() => setReturning(true)}>
                <Undo2Icon data-icon="inline-start" />
                Return
              </Button>
              <Button onClick={() => approveTips(batch.id)}>
                <CheckIcon data-icon="inline-start" />
                Approve {money(total, true)}
              </Button>
            </>
          ) : null}
          {canCreate && batch.status === "Rejected" ? (
            <Button onClick={() => onEdit(batch.id)}>
              <PencilIcon data-icon="inline-start" />
              Edit &amp; resubmit
            </Button>
          ) : null}
          {singleInvoice ? (
            <Button variant="outline" asChild>
              <Link href={`/invoices/${singleInvoice.id}`}>
                <ReceiptTextIcon data-icon="inline-start" />
                View {singleInvoice.id}
              </Link>
            </Button>
          ) : null}
        </SheetFooter>
      ) : null}

      {canApprove ? (
        <ReturnDialog row={row} own={batch.createdBy === persona.name} open={returning} onOpenChange={setReturning} />
      ) : null}
    </>
  )
}

function DeleteDraftButton({ row, onDeleted }: { row: TipRow; onDeleted: () => void }) {
  const { batch } = row
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Delete draft" className="mr-auto text-muted-foreground hover:text-destructive">
          <Trash2Icon />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
          <AlertDialogDescription>
            {batch.eventName} · {money(row.total, true)} for {plural(row.lines.length, "Pro")}. Nothing has been submitted or paid.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep draft</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (deleteDraft(batch.id)) onDeleted()
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const RETURN_REASONS = [
  "Pool total doesn't match the captain's sheet",
  "A Pro is missing from the split",
  "Hours should match approved timesheets",
  "Split should only include bartenders",
]

interface ReturnDialogProps {
  row: TipRow
  /** The approver entered this batch themselves. */
  own: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ReturnDialog({ row, own, open, onOpenChange }: ReturnDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <ReturnForm row={row} own={own} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ReturnForm({ row, own, onDone }: { row: TipRow; own: boolean; onDone: () => void }) {
  const id = React.useId()
  const [note, setNote] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const { batch } = row

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!note.trim()) {
      setInvalid(true)
      return
    }
    if (returnTips(batch.id, note)) onDone()
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Return tips for changes</DialogTitle>
        <DialogDescription>
          {own
            ? `The note stays on ${batch.eventName} until the split is fixed.`
            : `${batch.createdBy} sees your note on ${batch.eventName}.`}{" "}
          Nothing is paid until it&apos;s resubmitted and approved.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor={id}>What needs to change?</FieldLabel>
          <Textarea
            id={id}
            value={note}
            rows={3}
            autoFocus
            aria-invalid={invalid || undefined}
            placeholder="e.g. Pool should be $2,140 per the captain's sheet"
            onChange={(e) => {
              setNote(e.target.value)
              if (e.target.value.trim()) setInvalid(false)
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {RETURN_REASONS.map((reason) => (
              <Button
                key={reason}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setNote(reason)
                  setInvalid(false)
                }}
              >
                {reason}
              </Button>
            ))}
          </div>
          {invalid ? (
            <FieldError>{own ? "Add a note about what needs to change." : `Add a note so ${batch.createdBy} knows what to fix.`}</FieldError>
          ) : (
            <FieldDescription>Quick picks fill in the note. You can edit it before sending.</FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive">
          <Undo2Icon data-icon="inline-start" />
          Return tips
        </Button>
      </DialogFooter>
    </form>
  )
}
