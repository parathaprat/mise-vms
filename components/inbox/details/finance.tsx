"use client"

import Link from "next/link"
import * as React from "react"
import { MessageSquareWarningIcon, ScaleIcon, ShieldCheckIcon } from "lucide-react"

import { SupplierCell } from "@/components/app/identity"
import { CopyId, KeyValue } from "@/components/app/misc"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useData, useNow, usePolicies } from "@/hooks/use-demo"
import { daysFromToday, formatDate, formatDateTime, timeAgo } from "@/lib/dates"
import { hours, money, num, plural, rate, round2 } from "@/lib/format"
import { lineTotals } from "@/lib/invoice"
import type { Invoice, InvoiceDispute, InvoiceLine } from "@/lib/types"
import { cn } from "@/lib/utils"

import { resolveInvoiceDisputeWithToast } from "../actions"
import {
  Callout,
  CopilotButton,
  DetailShell,
  Facts,
  List,
  ListRow,
  MissingDetail,
  OpenButton,
  PrimaryButton,
  Section,
  Stats,
  type DetailContext,
  type KindDetailProps,
} from "../detail-layout"
import { targetId } from "../kinds"

function period(invoice: Invoice): string {
  return `${formatDate(invoice.periodStart, "MMM d")} – ${formatDate(invoice.periodEnd, "MMM d")}`
}

function lineMeta(line: InvoiceLine): string {
  const parts = [line.date ? formatDate(line.date, "EEE, MMM d") : null]
  if (line.kind === "labor" || line.kind === "overtime") parts.push(`${hours(line.quantity)} × ${rate(line.rate)}`)
  return parts.filter(Boolean).join(" · ")
}

function MoneyRow({ label, value, strong, muted }: { label: string; value: number; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 text-sm", muted && "text-muted-foreground")}>
      <dt>{label}</dt>
      <dd className={cn("tabular", strong && "font-semibold")}>{money(value, true)}</dd>
    </div>
  )
}

// Invoice approval ------------------------------------------------------------------

export function InvoiceDetail({ item, ctx }: KindDetailProps) {
  const invoiceId = targetId(item)
  const invoice = useData((d) => d.invoices.find((i) => i.id === invoiceId))
  const policies = usePolicies()
  const now = useNow()
  if (!invoice || invoice.status !== "Pending approval") return <MissingDetail item={item} ctx={ctx} />

  const supplier = ctx.lookups.suppliers.get(invoice.supplierId)
  const venue = ctx.lookups.venues.get(invoice.venueId)
  const totals = lineTotals(invoice.lines, policies.msaFeePct)
  const entryCount = new Set(invoice.lines.flatMap((l) => l.timeEntryIds)).size
  const largest = invoice.lines
    .filter((l) => l.kind !== "credit")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
  const dueIn = daysFromToday(invoice.dueDate, now)

  return (
    <DetailShell
      item={item}
      ctx={ctx}
      footer={
        <>
          <PrimaryButton ctx={ctx} />
          <OpenButton item={item} ctx={ctx} label="Review lines" />
          <CopilotButton ctx={ctx} prompt={`Summarize ${invoice.id} from ${supplier?.shortName ?? "the supplier"} and flag anything unusual`} />
        </>
      }
    >
      <Stats
        items={[
          { label: "Hours", value: hours(totals.hours), hint: plural(invoice.lines.length, "line") },
          { label: "Timesheets", value: num(entryCount), hint: "approved & geofenced" },
          {
            label: "Due",
            value: formatDate(invoice.dueDate, "MMM d"),
            hint: dueIn < 0 ? "Past due" : dueIn === 0 ? "Today" : `in ${plural(dueIn, "day")}`,
          },
        ]}
      />
      <Callout icon={ShieldCheckIcon} title="Nothing to reconcile">
        Every labor line traces to approved, geofenced timesheets. No TITO uploads or sign-in sheets to match up.
      </Callout>

      <Section title="Breakdown">
        <div className="flex flex-col gap-2">
          <dl className="flex flex-col gap-2">
            <MoneyRow label="Labor" value={totals.labor} />
            {totals.overtime ? <MoneyRow label="Overtime" value={totals.overtime} /> : null}
            {totals.tips ? <MoneyRow label="Tips · at cost" value={totals.tips} /> : null}
            {totals.credits ? <MoneyRow label="Credits" value={totals.credits} /> : null}
          </dl>
          <Separator />
          <dl className="flex flex-col gap-2">
            <MoneyRow label="Total due" value={totals.totalDue} strong />
            <MoneyRow label={`Program fee · ${policies.msaFeePct}%`} value={-totals.programFee} muted />
            <MoneyRow label={`Net to ${supplier?.shortName ?? "supplier"}`} value={totals.netToSupplier} muted />
          </dl>
        </div>
      </Section>

      <Section title="Largest lines">
        <List label="Largest invoice lines">
          {largest.map((line) => (
            <ListRow key={line.id}>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{line.description}</span>
                <span className="truncate text-xs text-muted-foreground">{lineMeta(line)}</span>
              </div>
              <span className="text-sm font-medium tabular">{money(line.amount, true)}</span>
            </ListRow>
          ))}
        </List>
      </Section>

      <Section title="Invoice">
        <Facts>
          <KeyValue label="Supplier">
            <SupplierCell supplier={supplier} />
          </KeyValue>
          <KeyValue label="Venue">{venue?.shortName ?? "–"}</KeyValue>
          <KeyValue label="Period">{period(invoice)}</KeyValue>
          <KeyValue label="Issued">{formatDateTime(invoice.issuedAt)}</KeyValue>
          <KeyValue label="PO">
            <CopyId value={invoice.poNumber} />
          </KeyValue>
          <KeyValue label="Pays">Next Friday after approval</KeyValue>
        </Facts>
      </Section>
    </DetailShell>
  )
}

// Invoice disputes -------------------------------------------------------------------

export function InvoiceDisputeDetail({ item, ctx }: KindDetailProps) {
  const invoiceId = targetId(item)
  const invoice = useData((d) => d.invoices.find((i) => i.id === invoiceId))
  const policies = usePolicies()
  if (!invoice || invoice.status !== "Disputed") return <MissingDetail item={item} ctx={ctx} />
  const open = invoice.disputes.filter((d) => d.status === "Open")
  if (open.length === 0) return <MissingDetail item={item} ctx={ctx} />

  const supplier = ctx.lookups.suppliers.get(invoice.supplierId)
  const venue = ctx.lookups.venues.get(invoice.venueId)
  const totals = lineTotals(invoice.lines, policies.msaFeePct)

  return (
    <DetailShell
      item={item}
      ctx={ctx}
      footer={
        <>
          <OpenButton item={item} ctx={ctx} label="Open invoice" />
          <CopilotButton ctx={ctx} prompt={`How should I resolve the "${open[0].reason}" dispute on ${invoice.id}?`} />
        </>
      }
    >
      <Callout icon={ScaleIcon} title={`${plural(open.length, "open dispute")} holding ${invoice.id}`}>
        {supplier?.shortName ?? "The supplier"} isn&apos;t paid until every disputed line is resolved, with a credit or without. Once the last
        one closes, the invoice goes back to Pending approval.
      </Callout>

      {open.map((dispute, index) => (
        <DisputeResolver key={dispute.id} invoice={invoice} dispute={dispute} focusTarget={index === 0} ctx={ctx} />
      ))}

      <Section title="Invoice">
        <Facts>
          <KeyValue label="Supplier">
            <SupplierCell supplier={supplier} />
          </KeyValue>
          <KeyValue label="Venue">{venue?.shortName ?? "–"}</KeyValue>
          <KeyValue label="Period">{period(invoice)}</KeyValue>
          <KeyValue label="Total due">{money(totals.totalDue, true)}</KeyValue>
          <KeyValue label="Lines">{num(invoice.lines.length)}</KeyValue>
          <KeyValue label="PO">
            <CopyId value={invoice.poNumber} />
          </KeyValue>
        </Facts>
      </Section>
    </DetailShell>
  )
}

interface ResolverProps {
  invoice: Invoice
  dispute: InvoiceDispute
  /** The first resolver's credit field is where `a` sends focus. */
  focusTarget: boolean
  ctx: DetailContext
}

function DisputeResolver({ invoice, dispute, focusTarget, ctx }: ResolverProps) {
  const now = useNow()
  const id = React.useId()
  const [credit, setCredit] = React.useState("")
  const [note, setNote] = React.useState("")
  const [submitted, setSubmitted] = React.useState(false)
  const line = invoice.lines.find((l) => l.id === dispute.lineId)
  const max = round2(Math.max(0, line?.amount ?? 0))
  const value = credit.trim() === "" ? Number.NaN : Number(credit)
  const error = Number.isNaN(value)
    ? "Enter a credit: use 0 to resolve without one."
    : value < 0
      ? "Credits can't be negative."
      : value > max
        ? `A credit can't exceed the ${money(max, true)} line.`
        : undefined
  const invalid = submitted && !!error

  const picks: { value: string; label: string }[] = [{ value: "0", label: "No credit" }]
  if (line && (line.kind === "labor" || line.kind === "overtime") && line.rate <= max) picks.push({ value: String(round2(line.rate)), label: "1 hour" })
  picks.push({ value: String(round2(max * 0.1)), label: "10%" }, { value: String(max), label: "Full line" })
  const uniquePicks = picks.filter((p, i) => picks.findIndex((q) => q.value === p.value) === i)
  const picked = uniquePicks.find((p) => Number(p.value) === value)?.value ?? ""

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (error) return
    ctx.commit(() => resolveInvoiceDisputeWithToast(invoice.id, dispute.id, round2(value), note))
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <MessageSquareWarningIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={`${id}-title`} className="text-sm font-medium">
            {dispute.reason}
          </h3>
          <p className="text-sm text-pretty text-muted-foreground">
            &ldquo;{dispute.note}&rdquo; · {dispute.by} · {timeAgo(dispute.at, now)}
          </p>
        </div>
      </div>

      {line ? (
        <div className="flex items-center gap-3 rounded-md bg-muted/50 px-3 py-2.5">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm">{line.description}</span>
            <span className="truncate text-xs text-muted-foreground">
              {lineMeta(line)}
              {line.requestId ? (
                <>
                  {" · "}
                  <Link href={`/timesheets?request=${line.requestId}&tab=invoiced`} className="underline-offset-4 hover:text-foreground hover:underline">
                    See timesheets
                  </Link>
                </>
              ) : null}
            </span>
          </div>
          <span className="text-sm font-medium tabular">{money(line.amount, true)}</span>
        </div>
      ) : null}

      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-4">
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor={`${id}-credit`}>Credit</FieldLabel>
            <InputGroup className="max-w-48">
              <InputGroupAddon>
                <InputGroupText>$</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id={`${id}-credit`}
                data-inbox-focus={focusTarget ? "" : undefined}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={credit}
                onChange={(e) => setCredit(e.target.value)}
                aria-invalid={invalid}
              />
            </InputGroup>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={picked}
              onValueChange={(v) => {
                if (v) setCredit(v)
              }}
              aria-label="Quick credit amounts"
              className="flex-wrap"
            >
              {uniquePicks.map((p) => (
                <ToggleGroupItem key={p.value} value={p.value}>
                  {p.label}
                  {p.value !== "0" ? <span className="text-muted-foreground tabular">{money(Number(p.value), true)}</span> : null}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {invalid ? (
              <FieldError>{error}</FieldError>
            ) : (
              <FieldDescription>Up to {money(max, true)}. Credits come off labor, so the program fee shrinks with them.</FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-note`}>Resolution note · optional</FieldLabel>
            <Textarea
              id={`${id}-note`}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Agreed with the captain's sheet: one Pro left at 9:30 PM."
            />
          </Field>
          <Field orientation="horizontal">
            <Button type="submit">
              {Number.isNaN(value) || error ? "Resolve dispute" : value > 0 ? `Resolve with ${money(value, true)} credit` : "Resolve without credit"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </section>
  )
}
