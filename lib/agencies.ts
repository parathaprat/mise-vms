import type { DemoData } from "@/lib/data"
import { hashString } from "@/lib/random"
import { certStatus, requiredCertsFor } from "@/lib/rules"
import { workerSafetyReady } from "@/lib/safety"
import type {
  ISODate,
  Position,
  Supplier,
  Venue,
} from "@/lib/types"

export interface AgencyOffer {
  supplier: Supplier
  eligible: boolean
  readyWorkers: number
  reliability: number
  fillRate: number
  offeredRate: number
  savingsPerHour: number
  score: number
  reason: string
  blockers: string[]
}

interface AgencyOfferInput {
  data: DemoData
  venue?: Venue
  position?: Position
  billRate: number
  headcount: number
  today: ISODate
}

export function buildAgencyOffers({
  data,
  venue,
  position,
  billRate,
  headcount,
  today,
}: AgencyOfferInput): AgencyOffer[] {
  if (!venue || !position) return []
  const required = requiredCertsFor(position, venue)
  const requestById = new Map(data.requests.map((request) => [request.id, request]))
  const workersBySupplier = new Map<string, typeof data.workers>()

  for (const worker of data.workers) {
    if (
      worker.metro !== venue.metro ||
      !worker.positionIds.includes(position.id)
    ) {
      continue
    }
    const list = workersBySupplier.get(worker.supplierId)
    if (list) list.push(worker)
    else workersBySupplier.set(worker.supplierId, [worker])
  }

  return data.suppliers
    .filter((supplier) => supplier.metros.includes(venue.metro))
    .map((supplier) => {
      const blockers: string[] = []
      if (!supplier.active) blockers.push("Agency is paused")
      if (supplier.coiExpires < today) blockers.push("Insurance expired")

      const workers = workersBySupplier.get(supplier.id) ?? []
      const ready = workers.filter(
        (worker) =>
          workerSafetyReady(worker, today) &&
          required.every((cert) => {
            const state = certStatus(worker, cert, today)
            return state !== "missing" && state !== "expired"
          })
      )
      if (ready.length === 0) blockers.push("No safety-ready workers nearby")

      const history = data.shifts.filter((shift) => {
        if (!shift.workerId) return false
        const worker = data.workers.find((item) => item.id === shift.workerId)
        const request = requestById.get(shift.requestId)
        return (
          worker?.supplierId === supplier.id &&
          request?.venueId === venue.id &&
          shift.status !== "Cancelled"
        )
      })
      const worked = history.filter(
        (shift) =>
          shift.status === "Completed" || shift.status === "Checked in"
      ).length
      const fillRate = history.length ? worked / history.length : 0.9
      const reliability = ready.length
        ? ready.reduce((sum, worker) => sum + worker.reliability, 0) /
          ready.length
        : 0

      const discountStep = hashString(`${supplier.id}|${position.id}`) % 4
      const offeredRate = Math.max(0, billRate - discountStep * 0.25)
      const savingsPerHour = Math.max(0, billRate - offeredRate)
      const coverage = Math.min(1, ready.length / Math.max(1, headcount))
      const rateValue = billRate
        ? Math.min(1, savingsPerHour / Math.max(1, billRate * 0.04))
        : 0
      const score =
        reliability * 40 + fillRate * 25 + coverage * 25 + rateValue * 10
      const eligible = blockers.length === 0

      return {
        supplier,
        eligible,
        readyWorkers: ready.length,
        reliability,
        fillRate,
        offeredRate,
        savingsPerHour,
        score: eligible ? score : 0,
        reason: `${ready.length} safety-ready nearby · ${Math.round(
          reliability * 100
        )}% reliable · ${
          savingsPerHour > 0
            ? `$${offeredRate.toFixed(2)}/hr offer`
            : "at the card rate"
        }`,
        blockers,
      }
    })
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        b.score - a.score ||
        a.offeredRate - b.offeredRate
    )
}
