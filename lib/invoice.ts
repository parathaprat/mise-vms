import { round2 } from "@/lib/format"
import type { Invoice, InvoiceLine } from "@/lib/types"

export interface InvoiceTotals {
  labor: number
  overtime: number
  tips: number
  credits: number
  totalDue: number
  programFee: number
  netToSupplier: number
  hours: number
}

export function lineTotals(lines: InvoiceLine[], msaFeePct: number): InvoiceTotals {
  let labor = 0
  let overtime = 0
  let tips = 0
  let credits = 0
  let hours = 0
  for (const l of lines) {
    if (l.kind === "labor") {
      labor += l.amount
      hours += l.quantity
    } else if (l.kind === "overtime") {
      overtime += l.amount
      hours += l.quantity
    } else if (l.kind === "tips") tips += l.amount
    else credits += l.amount
  }
  const laborAll = labor + overtime + credits
  const programFee = round2(Math.max(0, laborAll) * (msaFeePct / 100))
  const totalDue = round2(laborAll + tips)
  return {
    labor: round2(labor),
    overtime: round2(overtime),
    tips: round2(tips),
    credits: round2(credits),
    totalDue,
    programFee,
    netToSupplier: round2(totalDue - programFee),
    hours: round2(hours),
  }
}

export function invoiceTotals(invoice: Pick<Invoice, "lines">, msaFeePct: number): InvoiceTotals {
  return lineTotals(invoice.lines, msaFeePct)
}
