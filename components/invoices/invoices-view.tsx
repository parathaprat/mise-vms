"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { subDays } from "date-fns"
import { BadgeCheckIcon, CalendarClockIcon, DownloadIcon, HourglassIcon, WalletIcon } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/app/page-header"
import { StatCard } from "@/components/app/stat-card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useData, useLookups, useNow, usePersona } from "@/hooks/use-demo"
import { formatDate, parseLocal, toISODate } from "@/lib/dates"
import { hours, money, num, plural } from "@/lib/format"
import { entryInScope } from "@/lib/selectors"

import { InvoiceTable } from "./invoice-table"
import {
  accruingInScope,
  buildInvoiceRows,
  buildPaymentRows,
  downloadFile,
  invoiceSummaryCsv,
  isStatusFilter,
  nextInvoiceRun,
  nextPaymentDate,
  type InvoiceRow,
  type InvoiceStatusFilter,
} from "./invoice-utils"
import { NextRunCard } from "./next-run-card"
import { PaymentsTable } from "./payments-table"
import { RemittanceSheet } from "./remittance-sheet"

type Tab = "invoices" | "payments"

export function InvoicesView() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const persona = usePersona()
  const lookups = useLookups()
  const now = useNow()
  const msaFeePct = useData((d) => d.policies.msaFeePct)
  const invoices = useData((d) => d.invoices)
  const payments = useData((d) => d.payments)
  const timeEntries = useData((d) => d.timeEntries)
  const tipBatches = useData((d) => d.tipBatches)

  const tab: Tab = searchParams.get("tab") === "payments" ? "payments" : "invoices"
  const statusParam = searchParams.get("status")
  const status: InvoiceStatusFilter = isStatusFilter(statusParam) ? statusParam : "all"
  const paymentParam = searchParams.get("payment")
  const todayISO = toISODate(now)
  const isSupplier = persona.id === "supplier"

  const setParams = React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key)
        else next.set(key, value)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const rows = React.useMemo(
    () => buildInvoiceRows(invoices, payments, lookups, persona, msaFeePct, todayISO),
    [invoices, payments, lookups, persona, msaFeePct, todayISO]
  )
  const paymentRows = React.useMemo(
    () => buildPaymentRows(payments, invoices, lookups, persona, msaFeePct),
    [payments, invoices, lookups, persona, msaFeePct]
  )
  const tiles = React.useMemo(
    () => accruingInScope(timeEntries, tipBatches, lookups, persona, msaFeePct),
    [timeEntries, tipBatches, lookups, persona, msaFeePct]
  )
  const pendingTimesheets = React.useMemo(
    () => timeEntries.filter((e) => e.status === "Pending" && entryInScope(e, lookups, persona)).length,
    [timeEntries, lookups, persona]
  )

  const kpis = React.useMemo(() => {
    const pick = (r: InvoiceRow) => (isSupplier ? r.totals.netToSupplier : r.totals.totalDue)
    const sum = (list: InvoiceRow[]) => list.reduce((s, r) => s + pick(r), 0)
    const awaiting = rows.filter((r) => r.invoice.status === "Pending approval" || r.invoice.status === "Disputed")
    const disputed = awaiting.filter((r) => r.invoice.status === "Disputed").length
    const approved = rows.filter((r) => r.invoice.status === "Approved")
    const cutoff = toISODate(subDays(parseLocal(todayISO), 30))
    const paid = rows.filter((r) => r.invoice.status === "Paid" && !!r.invoice.paidAt && r.invoice.paidAt.slice(0, 10) >= cutoff)
    const scheduledDates = approved
      .map((r) => (r.payment?.status === "Scheduled" ? r.payment.date : undefined))
      .filter((d): d is string => !!d)
      .sort()
    return {
      awaiting: { count: awaiting.length, amount: sum(awaiting), disputed },
      approved: { count: approved.length, amount: sum(approved), payDate: scheduledDates[0] },
      paid: { count: paid.length, amount: sum(paid) },
    }
  }, [rows, isSupplier, todayISO])

  const accrual = React.useMemo(
    () => ({
      amount: tiles.reduce((s, t) => s + (isSupplier ? t.estimatedNet : t.amount), 0),
      hours: tiles.reduce((s, t) => s + t.hours, 0),
    }),
    [tiles, isSupplier]
  )

  const runAt = nextInvoiceRun(now)
  const payDate = kpis.approved.payDate ? parseLocal(kpis.approved.payDate) : nextPaymentDate(now)
  const selectedPayment = paymentParam ? (paymentRows.find((r) => r.id === paymentParam) ?? null) : null

  function exportCsv() {
    if (rows.length === 0) {
      toast("No invoices to export yet")
      return
    }
    downloadFile(`mise-invoices-${todayISO}.csv`, invoiceSummaryCsv(rows))
    toast.success(`Exported ${plural(rows.length, "invoice")}`, { description: "Totals, program fee and net to supplier for every invoice in your scope." })
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        actions={
          <Button variant="outline" onClick={exportCsv}>
            <DownloadIcon data-icon="inline-start" />
            Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={isSupplier ? "Awaiting Compass approval" : "Awaiting approval"}
          icon={HourglassIcon}
          value={money(kpis.awaiting.amount)}
          hint={
            kpis.awaiting.count === 0
              ? "Nothing waiting on approval"
              : `${plural(kpis.awaiting.count, "invoice")}${kpis.awaiting.disputed ? ` · ${num(kpis.awaiting.disputed)} disputed` : ""}${isSupplier ? " · net to you" : ""}`
          }
          href="/invoices?status=needs-approval"
        />
        <StatCard
          label="Approved & scheduled"
          icon={BadgeCheckIcon}
          value={money(kpis.approved.amount)}
          hint={
            kpis.approved.count === 0
              ? `Next payment run ${formatDate(payDate, "EEE, MMM d")}`
              : `${plural(kpis.approved.count, "invoice")} · pays ${formatDate(payDate, "EEE, MMM d")}${isSupplier ? " · net" : ""}`
          }
          href="/invoices?status=approved"
        />
        <StatCard
          label={isSupplier ? "Received last 30 days" : "Paid last 30 days"}
          icon={WalletIcon}
          value={money(kpis.paid.amount)}
          hint={kpis.paid.count === 0 ? "No payments in the last 30 days" : `${plural(kpis.paid.count, "invoice")} · 100% auto-matched`}
          href="/invoices?tab=payments"
        />
        <StatCard
          label="Next invoice run"
          icon={CalendarClockIcon}
          value={money(accrual.amount)}
          hint={
            tiles.length === 0
              ? `${formatDate(runAt, "EEEE, MMM d")} · nothing accruing yet`
              : `${formatDate(runAt, "EEEE, MMM d")} · ${hours(accrual.hours)} approved${isSupplier ? " · est. net" : ""}`
          }
        />
      </div>

      <NextRunCard
        tiles={tiles}
        persona={persona}
        runAt={runAt}
        pendingTimesheets={pendingTimesheets}
        onRan={() => setParams({ tab: null, status: "needs-approval", payment: null })}
      />

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "payments" ? "payments" : null, payment: null })} className="gap-4">
        <TabsList variant="line">
          <TabsTrigger value="invoices">
            Invoices
            <span className="text-xs text-muted-foreground tabular">{num(rows.length)}</span>
          </TabsTrigger>
          <TabsTrigger value="payments">
            Payments
            <span className="text-xs text-muted-foreground tabular">{num(paymentRows.length)}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <InvoiceTable
            rows={rows}
            persona={persona}
            status={status}
            onStatusChange={(next) => setParams({ status: next === "all" ? null : next })}
            todayISO={todayISO}
            onPaymentReleased={(paymentId) => setParams({ tab: "payments", payment: paymentId })}
          />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTable rows={paymentRows} persona={persona} todayISO={todayISO} onOpen={(id) => setParams({ payment: id })} />
        </TabsContent>
      </Tabs>

      <RemittanceSheet row={selectedPayment} onOpenChange={(open) => !open && setParams({ payment: null })} />
    </>
  )
}
