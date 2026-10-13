"use client"

import Link from "next/link"
import * as React from "react"
import {
  ArrowUpRightIcon,
  FilePenLineIcon,
  FlagIcon,
  HandCoinsIcon,
  MessageSquareTextIcon,
  MessageSquareWarningIcon,
  SendIcon,
  TimerIcon,
  Undo2Icon,
} from "lucide-react"

import { WorkerCell } from "@/components/app/identity"
import { KeyValue } from "@/components/app/misc"
import { AnomalyBadges, ClockedTimes, SourceIndicator } from "@/components/timesheets/entry-parts"
import { autoApproveAt, buildEntryRow, disputeReplySuggestions, formatCountdown, isClean, totalsOf } from "@/components/timesheets/model"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { useData, useNow, usePolicies } from "@/hooks/use-demo"
import { formatDate, formatDateList, formatTimeRange, timeAgo } from "@/lib/dates"
import { hours, money, num, plural, rate, round2, workerName } from "@/lib/format"
import type { Lookups } from "@/lib/selectors"
import type { TipBatch } from "@/lib/types"

import { respondToDisputeWithToast, returnTipsWithToast, submitTipDraftWithToast } from "../actions"
import {
  Callout,
  CopilotButton,
  DetailShell,
  Facts,
  List,
  ListRow,
  MissingDetail,
  NoteForm,
  OpenButton,
  PrimaryButton,
  Section,
  Stats,
  type KindDetailProps,
} from "../detail-layout"
import { targetId } from "../kinds"

// Timesheets awaiting venue approval --------------------------------------------

export function TimesheetsDetail({ item, ctx }: KindDetailProps) {
  const entries = useData((d) => d.timeEntries)
  const policies = usePolicies()
  const now = useNow()
  const requestId = targetId(item)
  const request = ctx.lookups.requests.get(requestId)
  const refs = new Set(item.refIds)
  const rows = entries
    .filter((e) => refs.has(e.id))
    .map((e) => buildEntryRow(e, ctx.lookups))
    .sort((a, b) => b.entry.anomalies.length - a.entry.anomalies.length || workerName(a.worker).localeCompare(workerName(b.worker)))
  if (!request || rows.length === 0) return <MissingDetail item={item} ctx={ctx} />

  const venue = ctx.lookups.venues.get(request.venueId)
  const position = ctx.lookups.positions.get(request.positionId)
  const flagged = rows.filter((r) => r.entry.anomalies.length > 0)
  const clean = rows.filter((r) => isClean(r.entry))
  const totals = totalsOf(rows)
  const autoAt = clean
    .map((r) => autoApproveAt(r.entry, policies))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0]
  const dates = [...new Set(rows.map((r) => r.entry.date))]

  return (
    <DetailShell
      item={item}
      ctx={ctx}
      footer={
        <>
          <PrimaryButton ctx={ctx} />
          {ctx.primary?.type === "run" && flagged.length > 0 ? (
            <Button variant="outline" asChild>
              <Link href={`/timesheets?request=${requestId}&tab=flagged`}>
                <FlagIcon data-icon="inline-start" />
                Review {flagged.length} flagged
              </Link>
            </Button>
          ) : null}
          <OpenButton item={item} ctx={ctx} label="Open in Timesheets" />
          <CopilotButton
            ctx={ctx}
            prompt={`Summarize the ${plural(rows.length, "pending timesheet")} for ${request.eventName ?? requestId} and call out anything unusual`}
          />
        </>
      }
    >
      <Stats
        items={[
          { label: "Timesheets", value: num(rows.length), hint: flagged.length ? `${flagged.length} flagged` : "All clean" },
          { label: "Hours", value: hours(totals.hours), hint: `at ${rate(request.billRate)}` },
          { label: "Clean", value: num(clean.length), hint: autoAt ? `Auto-approve ${formatCountdown(autoAt, now)}` : "Nothing auto-approves" },
        ]}
      />

      {flagged.length > 0 ? (
        <Callout icon={FlagIcon} title={`${plural(flagged.length, "exception")} waiting on you`}>
          Flagged hours never auto-approve. Adjust, dispute or approve them as-is. Each Pro&apos;s flags are listed below.
        </Callout>
      ) : null}
      {autoAt ? (
        <Callout icon={TimerIcon}>
          {clean.length === rows.length ? "Every clock-in" : plural(clean.length, "clean clock-in")} matched the schedule inside the venue
          geofence. If you don&apos;t act, {clean.length === 1 ? "it auto-approves" : "the first auto-approves"} {formatCountdown(autoAt, now)}.
        </Callout>
      ) : null}

      <Section title="Shift">
        <Facts>
          <KeyValue label="Event">{request.eventName ?? request.reason}</KeyValue>
          <KeyValue label="Venue">{venue?.shortName ?? "–"}</KeyValue>
          <KeyValue label="Worked">{formatDateList(dates, now)}</KeyValue>
          <KeyValue label="Scheduled">{formatTimeRange(request.startTime, request.endTime)}</KeyValue>
          <KeyValue label="Position">{position?.title ?? "–"}</KeyValue>
          <KeyValue label="Request">
            <Link href={`/requests/${request.id}`} className="underline-offset-4 hover:underline">
              {request.id}
            </Link>
          </KeyValue>
        </Facts>
      </Section>

      <Section title={flagged.length ? "Flagged first" : "Timesheets"}>
        <List label="Pending timesheets">
          {rows.map((r) => (
            <ListRow key={r.id} className="items-start">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <WorkerCell
                  worker={r.worker}
                  size="sm"
                  subtitle={
                    <>
                      {r.supplier?.shortName ?? "–"} · <ClockedTimes entry={r.entry} /> · {hours(r.hours)}
                    </>
                  }
                />
                <AnomalyBadges anomalies={r.entry.anomalies} className="pl-8.5" />
              </div>
              <span className="pt-0.5 text-sm font-medium tabular">{money(r.entry.amount, true)}</span>
              <Button variant="ghost" size="icon-sm" asChild>
                <Link href={`/timesheets?request=${requestId}&entry=${r.id}`} aria-label={`Open ${workerName(r.worker)}'s timesheet`}>
                  <ArrowUpRightIcon />
                </Link>
              </Button>
            </ListRow>
          ))}
        </List>
      </Section>
    </DetailShell>
  )
}

// Timesheet dispute (supplier replies) -------------------------------------------

export function DisputeDetail({ item, ctx }: KindDetailProps) {
  const entryId = targetId(item)
  const entry = useData((d) => d.timeEntries.find((e) => e.id === entryId))
  const now = useNow()
  const formId = React.useId()
  const noteRef = React.useRef<HTMLTextAreaElement>(null)
  const [note, setNote] = React.useState("")
  const [submitted, setSubmitted] = React.useState(false)
  if (!entry?.dispute || entry.status !== "Disputed" || entry.dispute.response) return <MissingDetail item={item} ctx={ctx} />

  const row = buildEntryRow(entry, ctx.lookups)
  const dispute = entry.dispute
  const venue = row.venue?.shortName ?? "the venue"
  const error = note.trim().length < 5 ? "Add a short reply. The venue sees it next to the hours." : undefined
  const invalid = submitted && !!error

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (error) return
    ctx.commit(() => respondToDisputeWithToast(entry.id, note.trim()))
  }

  const applySuggestion = (text: string) => {
    setNote(text)
    noteRef.current?.focus()
  }

  return (
    <DetailShell
      item={item}
      ctx={ctx}
      footer={
        <>
          <Button type="submit" form={formId}>
            <SendIcon data-icon="inline-start" />
            Send reply
          </Button>
          <OpenButton item={item} ctx={ctx} label="Open in Timesheets" />
          <CopilotButton ctx={ctx} prompt={`Help me reply to the "${dispute.reason}" dispute on ${entry.id}`} />
        </>
      }
    >
      <Callout icon={MessageSquareWarningIcon} title={`${dispute.reason} · ${dispute.by} · ${timeAgo(dispute.at, now)}`} destructive>
        <p>&ldquo;{dispute.note}&rdquo;</p>
        <p>
          The {money(entry.amount, true)} stays off the invoice until {venue} closes this out.
        </p>
      </Callout>

      <Section title="Timesheet">
        <WorkerCell worker={row.worker} subtitle={[row.position?.title, row.supplier?.shortName].filter(Boolean).join(" · ")} />
        <Facts>
          <KeyValue label="Venue">{row.venue?.shortName ?? "–"}</KeyValue>
          <KeyValue label="Date">{formatDate(entry.date)}</KeyValue>
          <KeyValue label="Scheduled">{row.request ? formatTimeRange(row.request.startTime, row.request.endTime) : "–"}</KeyValue>
          <KeyValue label="Clocked">
            <ClockedTimes entry={entry} />
          </KeyValue>
          <KeyValue label="Hours">{hours(row.hours)}</KeyValue>
          <KeyValue label="Captured by">
            <SourceIndicator source={entry.source} />
          </KeyValue>
        </Facts>
        <AnomalyBadges anomalies={entry.anomalies} />
      </Section>

      <Section title={`Reply to ${venue}`}>
        <form id={formId} onSubmit={submit} noValidate>
          <FieldGroup className="gap-4">
            <Field data-invalid={invalid}>
              <FieldLabel htmlFor={`${formId}-note`} className="sr-only">
                Your reply
              </FieldLabel>
              <Textarea
                ref={noteRef}
                id={`${formId}-note`}
                data-inbox-focus=""
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    e.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder="Confirm the Pro and the hours, or accept the venue's correction."
                aria-invalid={invalid}
              />
              {invalid ? (
                <FieldError>{error}</FieldError>
              ) : (
                <FieldDescription>{dispute.by} can approve, adjust or reassign the hours once you reply.</FieldDescription>
              )}
            </Field>
            <Field>
              <FieldTitle>Suggested replies</FieldTitle>
              <div className="flex flex-col gap-1.5">
                {disputeReplySuggestions(row).map((text) => (
                  <Button
                    key={text}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto justify-start py-1.5 text-left whitespace-normal"
                    onClick={() => applySuggestion(text)}
                  >
                    {text}
                  </Button>
                ))}
              </div>
            </Field>
          </FieldGroup>
        </form>
      </Section>
    </DetailShell>
  )
}

// Tips ----------------------------------------------------------------------------

function tipTotals(batch: TipBatch) {
  const amount = round2(batch.lines.reduce((s, l) => s + l.amount, 0))
  const worked = round2(batch.lines.reduce((s, l) => s + l.hours, 0))
  return { amount, worked, perHour: worked > 0 ? amount / worked : 0 }
}

function TipLines({ batch, lookups }: { batch: TipBatch; lookups: Lookups }) {
  const lines = [...batch.lines].sort((a, b) => b.amount - a.amount)
  return (
    <List label="Tip split">
      {lines.map((line) => {
        const worker = lookups.workers.get(line.workerId)
        const supplier = worker ? lookups.suppliers.get(worker.supplierId) : undefined
        return (
          <ListRow key={line.workerId}>
            <WorkerCell worker={worker} size="sm" subtitle={`${hours(line.hours)} worked · ${supplier?.shortName ?? "–"}`} className="flex-1" />
            <span className="text-sm font-medium tabular">{money(line.amount, true)}</span>
          </ListRow>
        )
      })}
    </List>
  )
}

function TipFacts({ batch, lookups }: { batch: TipBatch; lookups: Lookups }) {
  const now = useNow()
  const costCenter = lookups.costCenters.get(batch.costCenterId)
  return (
    <Facts>
      <KeyValue label="Event">{batch.eventName}</KeyValue>
      <KeyValue label="Date">{formatDate(batch.date)}</KeyValue>
      <KeyValue label="Split">{batch.method}</KeyValue>
      <KeyValue label="Created by">
        {batch.createdBy} · <span className="font-normal text-muted-foreground">{timeAgo(batch.createdAt, now)}</span>
      </KeyValue>
      <KeyValue label="Cost center">{costCenter ? `${costCenter.code} · ${costCenter.name}` : "–"}</KeyValue>
      <KeyValue label="Requests">
        {batch.requestIds.length === 0 ? (
          "–"
        ) : (
          <span className="flex flex-wrap gap-x-2">
            {batch.requestIds.map((id) => (
              <Link key={id} href={`/requests/${id}`} className="underline-offset-4 hover:underline">
                {id}
              </Link>
            ))}
          </span>
        )}
      </KeyValue>
    </Facts>
  )
}

export function TipsDetail({ item, ctx }: KindDetailProps) {
  const batchId = targetId(item)
  const batch = useData((d) => d.tipBatches.find((b) => b.id === batchId))
  const [returning, setReturning] = React.useState(false)
  if (!batch || batch.status !== "Pending approval") return <MissingDetail item={item} ctx={ctx} />
  const totals = tipTotals(batch)

  return (
    <DetailShell
      item={item}
      ctx={ctx}
      footer={
        returning ? (
          <NoteForm
            label="Why are you returning these tips?"
            description={`${batch.createdBy} sees this on the batch. Nothing is paid until it's resubmitted.`}
            placeholder="e.g. The suite pool is missing the 4 PM runners, please add them and resubmit."
            submitLabel="Return tips"
            destructive
            onCancel={() => setReturning(false)}
            onSubmit={(note) => ctx.commit(() => returnTipsWithToast(batch.id, note))}
          />
        ) : (
          <>
            <PrimaryButton ctx={ctx} />
            <Button variant="outline" onClick={() => setReturning(true)}>
              <Undo2Icon data-icon="inline-start" />
              Return with note
            </Button>
            <OpenButton item={item} ctx={ctx} label="Open in Tips" />
            <CopilotButton ctx={ctx} prompt={`Check the tip split for ${batch.eventName}, does anything look off?`} />
          </>
        )
      }
    >
      <Stats
        items={[
          { label: "Pros", value: num(batch.lines.length) },
          { label: "Hours", value: hours(totals.worked) },
          { label: "Per hour", value: money(totals.perHour, true) },
        ]}
      />
      <Callout icon={HandCoinsIcon}>
        Tips pass through at cost, with no markup or program fee. Pros are paid the next business day after approval.
      </Callout>
      {batch.note ? (
        <Callout icon={MessageSquareTextIcon} title={`Note from ${batch.createdBy}`}>
          {batch.note}
        </Callout>
      ) : null}
      <Section title="Batch">
        <TipFacts batch={batch} lookups={ctx.lookups} />
      </Section>
      <Section title="Split">
        <TipLines batch={batch} lookups={ctx.lookups} />
      </Section>
    </DetailShell>
  )
}

export function TipDraftDetail({ item, ctx }: KindDetailProps) {
  const batchId = targetId(item)
  const batch = useData((d) => d.tipBatches.find((b) => b.id === batchId))
  const policies = usePolicies()
  if (!batch || batch.status !== "Draft") return <MissingDetail item={item} ctx={ctx} />
  const totals = tipTotals(batch)

  return (
    <DetailShell
      item={item}
      ctx={ctx}
      footer={
        <>
          <PrimaryButton ctx={ctx} />
          <Button variant="outline" disabled={batch.lines.length === 0} onClick={() => ctx.commit(() => submitTipDraftWithToast(batch.id))}>
            <SendIcon data-icon="inline-start" />
            Submit as is
          </Button>
          <CopilotButton ctx={ctx} prompt={`Help me finish the ${batch.eventName} tip batch`} />
        </>
      }
    >
      <Stats
        items={[
          { label: "Pros", value: num(batch.lines.length) },
          { label: "Hours", value: hours(totals.worked) },
          { label: "Per hour", value: money(totals.perHour, true) },
        ]}
      />
      <Callout icon={FilePenLineIcon} title="Only you can see this draft">
        {policies.requireTipApproval
          ? "Once submitted it goes to approval, then Pros are paid the next business day."
          : "Once submitted it's approved by policy and Pros are paid the next business day."}
      </Callout>
      <Section title="Batch">
        <TipFacts batch={batch} lookups={ctx.lookups} />
      </Section>
      <Section title="Split so far">
        <TipLines batch={batch} lookups={ctx.lookups} />
      </Section>
    </DetailShell>
  )
}
