import { hueStyle } from "@/components/app/identity"
import { round2 } from "@/lib/format"
import { METROS, metroById } from "@/lib/reference"
import { billFromPay, postMsaRate } from "@/lib/rules"
import type { PositionCategory, RateCardEntry } from "@/lib/types"

export const CATEGORY_HUE: Record<PositionCategory, number> = {
  Culinary: 28,
  Concessions: 62,
  Bar: 318,
  Service: 222,
  Leadership: 276,
  Support: 168,
}

export function categoryDotStyle(category: PositionCategory) {
  return hueStyle(CATEGORY_HUE[category])
}

export function markupLabel(markupPct: number): string {
  return `${Number((markupPct * 100).toFixed(1))}%`
}

export function metroLabel(id: string): string {
  return metroById(id)?.label ?? id
}

/** Activity and change summaries carry raw metro ids, e.g. "Grill Cook (chicago)". */
export function prettyRateText(text: string): string {
  let out = text
  for (const m of METROS) out = out.replaceAll(`(${m.id})`, `(${m.label})`)
  return out
}

export function isPublishedRateActivity(text: string): boolean {
  return /\b(published|approved)\b/i.test(text)
}

export interface RateBreakdown {
  pay: number
  markupPct: number
  markup: number
  bill: number
  fee: number
  net: number
  ot: number
}

export function rateBreakdown(pay: number, markupPct: number, feePct: number, otMultiplier: number): RateBreakdown {
  const bill = billFromPay(pay, markupPct)
  return {
    pay,
    markupPct,
    markup: round2(bill - pay),
    bill,
    fee: round2((bill * feePct) / 100),
    net: postMsaRate(bill, feePct),
    ot: round2(bill * otMultiplier),
  }
}

export function cardBreakdown(card: RateCardEntry, feePct: number, otMultiplier: number): RateBreakdown {
  return {
    ...rateBreakdown(card.payRate, card.markupPct, feePct, otMultiplier),
    bill: card.billRate,
    markup: round2(card.billRate - card.payRate),
    fee: round2((card.billRate * feePct) / 100),
    net: postMsaRate(card.billRate, feePct),
    ot: round2(card.billRate * otMultiplier),
  }
}
