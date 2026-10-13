"use client"

import { addDays, nextFriday, startOfDay } from "date-fns"
import { create } from "zustand"
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware"

import { DATA_VERSION, makeIdFactory, type DemoData } from "@/lib/data"
import { buildAgencyOffers } from "@/lib/agencies"
import { formatClock, parseLocal, shiftWindow, toISODate, toLocal } from "@/lib/dates"
import { advance, fateFor, jitterFor } from "@/lib/engine"
import { money, round2, workerName } from "@/lib/format"
import { lineTotals } from "@/lib/invoice"
import { PERSONAS } from "@/lib/reference"
import {
  billFromPay,
  detectAnomalies,
  estimateRequestCost,
  recomputeEntries,
  requiredCertsFor,
} from "@/lib/rules"
import { generateDemoData } from "@/lib/seed"
import type {
  Activity,
  AdjustmentReason,
  AppNotification,
  CostCenter,
  DisputeReason,
  HireType,
  InvoiceLine,
  Payment,
  PersonaId,
  Policies,
  RequestReason,
  Shift,
  StaffingRequest,
  TimeEntry,
  TipBatch,
  TipLine,
} from "@/lib/types"

export interface RequestDraftInput {
  venueId: string
  costCenterId: string
  positionId: string
  eventName?: string
  reason: RequestReason
  hireType: HireType
  dates: string[]
  startTime: string
  endTime: string
  breakMinutes: number
  headcount: number
  duties: string
  attire: string
  checkIn: string
  parking: string
  notes?: string
  favoritesFirst: boolean
  supplierIds: string[]
  requestedWorkerIds?: string[]
}

export interface CreateRequestResult {
  id: string
  state: StaffingRequest["state"]
  requiresProgramApproval: boolean
}

export interface TipBatchInput {
  venueId: string
  costCenterId: string
  date: string
  eventName: string
  requestIds: string[]
  lines: TipLine[]
  method: TipBatch["method"]
  note?: string
  submit: boolean
}

interface StoreActions {
  setPersona: (persona: PersonaId) => void
  resetDemo: () => void
  ensureFresh: () => void
  tick: () => void

  createRequest: (input: RequestDraftInput, options?: { asDraft?: boolean }) => CreateRequestResult
  submitDraft: (id: string) => CreateRequestResult | null
  approveRequest: (id: string, note?: string) => void
  rejectRequest: (id: string, note: string) => void
  cancelRequest: (id: string, reason: string) => void
  updateRequestDetails: (
    id: string,
    patch: Partial<Pick<StaffingRequest, "notes" | "checkIn" | "attire" | "parking" | "duties" | "eventName">>
  ) => void
  addHeadcount: (id: string, delta: number, note?: string) => "applied" | "pending"
  assignWorker: (shiftId: string, workerId: string) => void
  unassignWorker: (shiftId: string, reason: string) => void
  cancelShift: (shiftId: string, reason: string) => void
  decideChange: (id: string, approve: boolean, note?: string) => void
  requestRateRevision: (rateCardId: string, newPayRate: number, detail: string) => void

  approveEntries: (ids: string[]) => number
  adjustEntry: (
    id: string,
    patch: { clockIn?: string; clockOut?: string; breakMinutes?: number },
    reason: AdjustmentReason,
    note?: string
  ) => void
  disputeEntry: (id: string, reason: DisputeReason, note: string) => void
  respondToDispute: (id: string, note: string) => void
  reassignEntry: (id: string, newWorkerId: string, note?: string) => void

  createTipBatch: (input: TipBatchInput) => string
  updateTipBatch: (id: string, lines: TipLine[], note?: string) => void
  submitTipBatch: (id: string) => void
  approveTipBatch: (id: string) => void
  rejectTipBatch: (id: string, note: string) => void
  deleteTipBatch: (id: string) => void

  approveInvoice: (id: string) => void
  disputeInvoiceLine: (invoiceId: string, lineId: string, reason: string, note: string) => void
  resolveInvoiceDispute: (invoiceId: string, disputeId: string, creditAmount: number, note?: string) => void
  runInvoiceCycle: () => number
  payInvoices: (ids: string[]) => string | null

  toggleFavorite: (venueId: string, workerId: string) => void
  blockWorker: (venueId: string, workerId: string, reason: string) => void
  unblockWorker: (venueId: string, workerId: string) => void

  updateRateCard: (id: string, patch: { payRate?: number; markupPct?: number }) => number
  updateCostCenter: (id: string, patch: Partial<Omit<CostCenter, "id" | "venueId">>) => void
  updatePolicies: (patch: Partial<Policies>) => void
  setSupplierActive: (id: string, active: boolean) => void
  renewSupplierCoi: (id: string) => void

  addComment: (requestId: string, body: string) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
}

export interface StoreState extends StoreActions {
  data: DemoData
  persona: PersonaId
  ready: boolean
}

const STORAGE_KEY = "mise-vms-demo"

function emptyData(): DemoData {
  return {
    version: 0,
    seededFor: "",
    cutoverDate: "",
    venues: [],
    costCenters: [],
    positions: [],
    rateCards: [],
    suppliers: [],
    workers: [],
    rosters: [],
    requests: [],
    shifts: [],
    timeEntries: [],
    tipBatches: [],
    invoices: [],
    payments: [],
    changeRequests: [],
    activities: [],
    comments: [],
    notifications: [],
    policies: {
      autoApproveRequestsUnder: 12000,
      autoApproveHeadcountPct: 25,
      timesheetAutoApproveHours: 72,
      rushLeadTimeHours: 24,
      tier1ExclusiveMinutes: 120,
      contractualHoursCap: 390,
      contractualHoursWarnPct: 85,
      msaFeePct: 2,
      overtimeMultiplier: 1.5,
      overtimeWeeklyThreshold: 40,
      requireTipApproval: true,
      rateChangesRequireProgram: true,
      autoBackfillNoShows: true,
      blockOverCapWorkers: true,
    },
    counters: {
      request: 1,
      shift: 1,
      timeEntry: 1,
      tip: 1,
      invoice: 1,
      payment: 1,
      change: 1,
      activity: 1,
      comment: 1,
      notification: 1,
    },
  }
}

type Persisted = Pick<StoreState, "data" | "persona">

let pendingWrite: { name: string; value: StorageValue<Persisted> } | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null

function flushWrite() {
  if (!pendingWrite || typeof window === "undefined") return
  const { name, value } = pendingWrite
  pendingWrite = null
  try {
    window.localStorage.setItem(name, JSON.stringify(value))
  } catch (error) {
    console.warn("Mise: demo state could not be saved to localStorage", error)
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushWrite)
  window.addEventListener("pagehide", flushWrite)
}

const storage: PersistStorage<Persisted> = {
  getItem: (name) => {
    if (typeof window === "undefined") return null
    try {
      const raw = window.localStorage.getItem(name)
      return raw ? (JSON.parse(raw) as StorageValue<Persisted>) : null
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    pendingWrite = { name, value }
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(flushWrite, 500)
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return
    pendingWrite = null
    window.localStorage.removeItem(name)
  },
}

function personaName(persona: PersonaId) {
  return PERSONAS[persona].name
}

function nowLocal() {
  return toLocal(new Date())
}

function todayISO() {
  return toISODate(new Date())
}

function venuePersonas(venueId: string): PersonaId[] {
  const venues = PERSONAS.venue.venueIds
  return Array.isArray(venues) && venues.includes(venueId)
    ? ["venue", "program", "supplier"]
    : ["program", "supplier"]
}

function makeShifts(
  req: StaffingRequest,
  dates: string[],
  slotStart: number,
  count: number,
  id: () => string
): Shift[] {
  const out: Shift[] = []
  for (const date of dates) {
    for (let i = 0; i < count; i++) {
      const sid = id()
      out.push({
        id: sid,
        requestId: req.id,
        date,
        slot: slotStart + i,
        status: "Open",
        fate: fateFor(sid),
        jitter: jitterFor(sid),
      })
    }
  }
  return out
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      /** Applies an immutable update to the demo data with ID allocation and logging helpers. */
      const mutate = (
        fn: (ctx: {
          data: DemoData
          id: ReturnType<typeof makeIdFactory>["id"]
          log: (a: Omit<Activity, "id" | "at" | "actor"> & { actor?: string; at?: string }) => void
          notify: (n: Omit<AppNotification, "id" | "read" | "at"> & { at?: string }) => void
          who: string
        }) => DemoData | void
      ) => {
        const state = get()
        const factory = makeIdFactory(state.data.counters)
        const logs: Activity[] = []
        const notes: AppNotification[] = []
        const who = personaName(state.persona)
        const result = fn({
          data: state.data,
          id: factory.id,
          who,
          log: (a) =>
            logs.push({ id: factory.id("activity"), at: a.at ?? nowLocal(), actor: a.actor ?? who, ...a }),
          notify: (n) =>
            notes.push({ id: factory.id("notification"), read: false, at: n.at ?? nowLocal(), ...n }),
        })
        const base = result ?? state.data
        set({
          data: {
            ...base,
            activities: logs.length ? [...base.activities, ...logs].slice(-900) : base.activities,
            notifications: notes.length ? [...notes.reverse(), ...base.notifications].slice(0, 120) : base.notifications,
            counters: factory.counters,
          },
        })
      }

      const activateRequest = (
        data: DemoData,
        req: StaffingRequest,
        id: ReturnType<typeof makeIdFactory>["id"]
      ): { requests: StaffingRequest[]; shifts: Shift[] } => {
        const existing = data.shifts.filter((s) => s.requestId === req.id)
        let shifts = data.shifts
        if (existing.length === 0) {
          shifts = [...shifts, ...makeShifts(req, req.dates, 1, req.headcount, () => id("shift"))]
        }
        const requests = data.requests.map((r) => (r.id === req.id ? { ...req, state: "active" as const, liveFill: true } : r))
        return { requests, shifts }
      }

      return {
        data: emptyData(),
        persona: "venue",
        ready: false,

        setPersona: (persona) => set({ persona }),

        resetDemo: () => {
          set({ data: generateDemoData(new Date()), persona: get().persona, ready: true })
        },

        ensureFresh: () => {
          const { data } = get()
          const today = todayISO()
          if (data.version !== DATA_VERSION || data.seededFor !== today || data.requests.length === 0) {
            set({ data: generateDemoData(new Date()), ready: true })
          } else {
            const result = advance(data, new Date())
            set({ data: result.data, ready: true })
          }
        },

        tick: () => {
          const { data, ready } = get()
          if (!ready) return
          const result = advance(data, new Date())
          if (result.changed) set({ data: result.data })
        },

        createRequest: (input, options) => {
          const state = get()
          let result: CreateRequestResult = { id: "", state: "draft", requiresProgramApproval: false }
          mutate(({ data, id, log, notify, who }) => {
            const venue = data.venues.find((v) => v.id === input.venueId)!
            const position = data.positions.find((p) => p.id === input.positionId)!
            const rc = data.rateCards.find((r) => r.positionId === input.positionId && r.metro === venue.metro)
            const payRate = rc?.payRate ?? 0
            const offers = buildAgencyOffers({
              data,
              venue,
              position,
              billRate: rc?.billRate ?? 0,
              headcount: input.headcount,
              today: toISODate(new Date()),
            })
            const chosenOffer =
              offers.find(
                (offer) =>
                  offer.eligible && input.supplierIds.includes(offer.supplier.id)
              ) ?? offers.find((offer) => offer.eligible)
            const billRate = chosenOffer?.offeredRate ?? rc?.billRate ?? 0
            const dates = [...new Set(input.dates)].sort()
            const cost = estimateRequestCost({ ...input, dates, billRate })
            const requiresProgram =
              !options?.asDraft &&
              state.persona !== "program" &&
              cost > data.policies.autoApproveRequestsUnder
            const reqId = id("request")
            const now = nowLocal()
            const req: StaffingRequest = {
              id: reqId,
              venueId: input.venueId,
              costCenterId: input.costCenterId,
              positionId: input.positionId,
              eventName: input.eventName?.trim() || undefined,
              reason: input.reason,
              hireType: input.hireType,
              dates,
              startTime: input.startTime,
              endTime: input.endTime,
              breakMinutes: input.breakMinutes,
              headcount: input.headcount,
              payRate,
              billRate,
              duties: input.duties,
              attire: input.attire,
              checkIn: input.checkIn,
              parking: input.parking,
              notes: input.notes?.trim() || undefined,
              favoritesFirst: input.favoritesFirst,
              supplierIds: chosenOffer
                ? [chosenOffer.supplier.id]
                : input.supplierIds.length
                  ? input.supplierIds
                  : ["s-instawork"],
              agencyAward: chosenOffer
                ? {
                    supplierId: chosenOffer.supplier.id,
                    offeredRate: chosenOffer.offeredRate,
                    score: chosenOffer.score,
                    reason: chosenOffer.reason,
                    awardedAt: now,
                  }
                : undefined,
              requiredCerts: requiredCertsFor(position, venue),
              state: options?.asDraft ? "draft" : requiresProgram ? "pending" : "active",
              createdBy: who,
              createdAt: now,
              approvals: [
                {
                  id: "budget",
                  label: "Budget & policy check",
                  approverName: "Mise policy engine",
                  status: "Auto-approved",
                  at: now,
                  note: requiresProgram
                    ? `Estimated ${money(cost)} exceeds the ${money(data.policies.autoApproveRequestsUnder)} auto-approve limit`
                    : "Within budget and policy",
                },
                ...(requiresProgram
                  ? [{ id: "program", label: "Program approval", approverName: PERSONAS.program.name, status: "Pending" as const }]
                  : []),
              ],
              liveFill: !options?.asDraft && !requiresProgram,
              source: "Mise",
            }
            const shifts = makeShifts(req, dates, 1, input.headcount, () => id("shift"))
            const requested = (input.requestedWorkerIds ?? []).filter(Boolean)
            if (requested.length && req.state === "active") {
              let idx = 0
              for (const workerId of requested) {
                const mine = shifts.filter((s) => s.slot === idx + 1)
                for (const s of mine) {
                  s.workerId = workerId
                  s.status = "Confirmed"
                  s.assignedAt = now
                }
                idx++
                if (idx >= input.headcount) break
              }
            }
            result = { id: reqId, state: req.state, requiresProgramApproval: requiresProgram }
            if (req.state === "draft") {
              log({ kind: "request", text: `${who} saved draft ${reqId} · ${input.headcount} × ${position.title}`, requestId: reqId, venueId: venue.id })
              return { ...data, requests: [...data.requests, req], shifts: [...data.shifts, ...shifts] }
            }
            log({
              kind: "request",
              text: `${who} posted ${reqId} · ${input.headcount} × ${position.title} at ${venue.shortName}`,
              requestId: reqId,
              venueId: venue.id,
            })
            if (requiresProgram) {
              notify({
                title: `${reqId} needs program approval`,
                body: `${input.headcount} × ${position.title} at ${venue.shortName} · est. ${money(cost)}`,
                href: `/requests/${reqId}`,
                kind: "approval",
                personas: ["program"],
                venueId: venue.id,
              })
            } else {
              notify({
                title: `New request ${reqId}`,
                body: `${input.headcount} × ${position.title} · ${venue.shortName} · ${dates.length} ${dates.length === 1 ? "date" : "dates"}`,
                href: `/requests/${reqId}`,
                kind: "request",
                personas: ["supplier"],
                venueId: venue.id,
              })
            }
            return { ...data, requests: [...data.requests, req], shifts: [...data.shifts, ...shifts] }
          })
          return result
        },

        submitDraft: (id) => {
          const state = get()
          const req = state.data.requests.find((r) => r.id === id)
          if (!req || req.state !== "draft") return null
          let result: CreateRequestResult | null = null
          mutate(({ data, id: nextId, log, notify, who }) => {
            const cost = estimateRequestCost(req)
            const requiresProgram = state.persona !== "program" && cost > data.policies.autoApproveRequestsUnder
            const now = nowLocal()
            const updated: StaffingRequest = {
              ...req,
              createdAt: now,
              approvals: [
                { id: "budget", label: "Budget & policy check", approverName: "Mise policy engine", status: "Auto-approved", at: now, note: requiresProgram ? `Estimated ${money(cost)} exceeds the auto-approve limit` : "Within budget and policy" },
                ...(requiresProgram ? [{ id: "program", label: "Program approval", approverName: PERSONAS.program.name, status: "Pending" as const }] : []),
              ],
              state: requiresProgram ? "pending" : "active",
              liveFill: !requiresProgram,
            }
            result = { id: req.id, state: updated.state, requiresProgramApproval: requiresProgram }
            log({ kind: "request", text: `${who} submitted ${req.id}`, requestId: req.id, venueId: req.venueId })
            if (requiresProgram) {
              notify({ title: `${req.id} needs program approval`, body: `Estimated ${money(cost)}`, href: `/requests/${req.id}`, kind: "approval", personas: ["program"], venueId: req.venueId })
              return { ...data, requests: data.requests.map((r) => (r.id === id ? updated : r)) }
            }
            const activated = activateRequest(data, updated, nextId)
            notify({ title: `New request ${req.id}`, body: `${req.headcount} shifts per date at ${data.venues.find((v) => v.id === req.venueId)?.shortName}`, href: `/requests/${req.id}`, kind: "request", personas: ["supplier"], venueId: req.venueId })
            return { ...data, ...activated }
          })
          return result
        },

        approveRequest: (id, note) => {
          mutate(({ data, id: nextId, log, notify, who }) => {
            const req = data.requests.find((r) => r.id === id)
            if (!req || req.state !== "pending") return
            const now = nowLocal()
            const updated: StaffingRequest = {
              ...req,
              approvals: req.approvals.map((a) => (a.status === "Pending" ? { ...a, status: "Approved", at: now, approverName: who, note } : a)),
            }
            const activated = activateRequest(data, updated, nextId)
            log({ kind: "approval", text: `${who} approved ${id}`, requestId: id, venueId: req.venueId })
            notify({ title: `${id} approved`, body: `${who} approved the request. Distribution to suppliers has started.`, href: `/requests/${id}`, kind: "approval", personas: venuePersonas(req.venueId).filter((p) => p !== "program"), venueId: req.venueId })
            return { ...data, ...activated }
          })
        },

        rejectRequest: (id, note) => {
          mutate(({ data, log, notify, who }) => {
            const req = data.requests.find((r) => r.id === id)
            if (!req) return
            const now = nowLocal()
            log({ kind: "approval", text: `${who} declined ${id}: ${note}`, requestId: id, venueId: req.venueId })
            notify({ title: `${id} declined`, body: note, href: `/requests/${id}`, kind: "approval", personas: ["venue"], venueId: req.venueId })
            return {
              ...data,
              requests: data.requests.map((r) =>
                r.id === id
                  ? {
                      ...r,
                      state: "cancelled",
                      liveFill: false,
                      cancelledReason: `Declined by program: ${note}`,
                      approvals: r.approvals.map((a) => (a.status === "Pending" ? { ...a, status: "Rejected", at: now, approverName: who, note } : a)),
                    }
                  : r
              ),
              shifts: data.shifts.map((s) => (s.requestId === id ? { ...s, status: "Cancelled", workerId: undefined, cancelledReason: note } : s)),
            }
          })
        },

        cancelRequest: (id, reason) => {
          mutate(({ data, log, notify, who }) => {
            const req = data.requests.find((r) => r.id === id)
            if (!req) return
            const now = new Date()
            log({ kind: "request", text: `${who} cancelled ${id}: ${reason}`, requestId: id, venueId: req.venueId })
            notify({ title: `${id} cancelled`, body: reason, href: `/requests/${id}`, kind: "request", personas: ["supplier", "program"], venueId: req.venueId })
            return {
              ...data,
              requests: data.requests.map((r) => (r.id === id ? { ...r, state: "cancelled", liveFill: false, cancelledReason: reason } : r)),
              shifts: data.shifts.map((s) => {
                if (s.requestId !== id) return s
                const { start } = shiftWindow(s.date, req.startTime, req.endTime)
                if (start <= now || s.status === "Completed" || s.status === "Checked in") return s
                return { ...s, status: "Cancelled", workerId: undefined, cancelledReason: reason }
              }),
            }
          })
        },

        updateRequestDetails: (id, patch) => {
          mutate(({ data, log, who }) => {
            log({ kind: "request", text: `${who} updated details on ${id}`, requestId: id })
            return { ...data, requests: data.requests.map((r) => (r.id === id ? { ...r, ...patch } : r)) }
          })
        },

        addHeadcount: (id, delta, note) => {
          const state = get()
          const req = state.data.requests.find((r) => r.id === id)
          if (!req || delta <= 0) return "pending"
          const pct = (delta / Math.max(1, req.headcount)) * 100
          const auto = state.persona === "program" || pct <= state.data.policies.autoApproveHeadcountPct
          const position = state.data.positions.find((p) => p.id === req.positionId)
          mutate(({ data, id: nextId, log, notify, who }) => {
            const now = nowLocal()
            const change = {
              id: nextId("change"),
              type: "Headcount increase" as const,
              requestId: id,
              venueId: req.venueId,
              positionId: req.positionId,
              requestedBy: who,
              requestedByPersona: state.persona,
              createdAt: now,
              status: auto ? ("Auto-approved" as const) : ("Pending" as const),
              delta,
              summary: `Add ${delta} ${position?.title ?? "Pros"} to ${id}`,
              detail: note?.trim() || (auto ? `Within the ${data.policies.autoApproveHeadcountPct}% auto-approve threshold.` : `+${Math.round(pct)}% exceeds the ${data.policies.autoApproveHeadcountPct}% auto-approve threshold.`),
              decidedBy: auto ? (state.persona === "program" ? who : `Policy · ≤${data.policies.autoApproveHeadcountPct}% headcount increase`) : undefined,
              decidedAt: auto ? now : undefined,
            }
            if (!auto) {
              log({ kind: "change", text: `${who} requested +${delta} ${position?.title ?? ""} on ${id} (awaiting program)`, requestId: id, venueId: req.venueId })
              notify({ title: "Headcount increase needs approval", body: change.summary, href: "/inbox", kind: "change", personas: ["program"], venueId: req.venueId })
              return { ...data, changeRequests: [change, ...data.changeRequests] }
            }
            const today = todayISO()
            const futureDates = req.dates.filter((d) => d >= today)
            const maxSlot = Math.max(0, ...data.shifts.filter((s) => s.requestId === id).map((s) => s.slot))
            const extra = makeShifts(req, futureDates, maxSlot + 1, delta, () => nextId("shift"))
            log({ kind: "change", text: `${who} added ${delta} ${position?.title ?? "Pros"} to ${id}`, requestId: id, venueId: req.venueId })
            notify({ title: `Headcount increased on ${id}`, body: change.summary, href: `/requests/${id}`, kind: "change", personas: ["supplier"], venueId: req.venueId })
            return {
              ...data,
              changeRequests: [change, ...data.changeRequests],
              requests: data.requests.map((r) => (r.id === id ? { ...r, headcount: r.headcount + delta, liveFill: true } : r)),
              shifts: [...data.shifts, ...extra],
            }
          })
          return auto ? "applied" : "pending"
        },

        assignWorker: (shiftId, workerId) => {
          mutate(({ data, log, who }) => {
            const shift = data.shifts.find((s) => s.id === shiftId)
            const worker = data.workers.find((w) => w.id === workerId)
            if (!shift || !worker) return
            log({ kind: "fill", text: `${who} assigned ${workerName(worker)} to ${shift.requestId}`, requestId: shift.requestId, workerId })
            return {
              ...data,
              shifts: data.shifts.map((s) =>
                s.id === shiftId
                  ? { ...s, workerId, status: "Confirmed", assignedAt: nowLocal(), fate: s.fate === "no_show" ? "normal" : s.fate }
                  : s
              ),
            }
          })
        },

        unassignWorker: (shiftId, reason) => {
          mutate(({ data, log, notify, who }) => {
            const shift = data.shifts.find((s) => s.id === shiftId)
            if (!shift?.workerId) return
            const worker = data.workers.find((w) => w.id === shift.workerId)
            log({ kind: "fill", text: `${who} released ${workerName(worker)} from ${shift.requestId}: ${reason}`, requestId: shift.requestId, workerId: shift.workerId })
            notify({ title: `Slot reopened on ${shift.requestId}`, body: `${workerName(worker)} released: ${reason}`, href: `/requests/${shift.requestId}`, kind: "fill", personas: ["supplier"] })
            return {
              ...data,
              requests: data.requests.map((r) => (r.id === shift.requestId ? { ...r, liveFill: true } : r)),
              shifts: data.shifts.map((s) => (s.id === shiftId ? { ...s, workerId: undefined, status: "Open", assignedAt: undefined } : s)),
            }
          })
        },

        cancelShift: (shiftId, reason) => {
          mutate(({ data, log, who }) => {
            const shift = data.shifts.find((s) => s.id === shiftId)
            if (!shift) return
            log({ kind: "request", text: `${who} cancelled one ${shift.requestId} shift: ${reason}`, requestId: shift.requestId })
            return {
              ...data,
              shifts: data.shifts.map((s) => (s.id === shiftId ? { ...s, status: "Cancelled", workerId: undefined, cancelledReason: reason } : s)),
            }
          })
        },

        decideChange: (id, approve, note) => {
          mutate(({ data, id: nextId, log, notify, who }) => {
            const change = data.changeRequests.find((c) => c.id === id)
            if (!change || change.status !== "Pending") return
            const now = nowLocal()
            let next: DemoData = {
              ...data,
              changeRequests: data.changeRequests.map((c) =>
                c.id === id ? { ...c, status: approve ? "Approved" : "Declined", decidedBy: who, decidedAt: now, detail: note ? `${c.detail}\n\nDecision note: ${note}` : c.detail } : c
              ),
            }
            const requester: PersonaId[] = [change.requestedByPersona]
            if (!approve) {
              log({ kind: "change", text: `${who} declined: ${change.summary}`, requestId: change.requestId })
              notify({ title: "Change request declined", body: `${change.summary}${note ? `, ${note}` : ""}`, href: change.requestId ? `/requests/${change.requestId}` : "/rates", kind: "change", personas: requester })
              return next
            }
            if (change.type === "Headcount increase" && change.requestId && change.delta) {
              const req = next.requests.find((r) => r.id === change.requestId)
              if (req) {
                const today = todayISO()
                const maxSlot = Math.max(0, ...next.shifts.filter((s) => s.requestId === req.id).map((s) => s.slot))
                const extra = makeShifts(req, req.dates.filter((d) => d >= today), maxSlot + 1, change.delta, () => nextId("shift"))
                next = {
                  ...next,
                  requests: next.requests.map((r) => (r.id === req.id ? { ...r, headcount: r.headcount + change.delta!, liveFill: true } : r)),
                  shifts: [...next.shifts, ...extra],
                }
              }
            }
            if (change.type === "Rate revision" && change.rateCardId && change.newRate) {
              const card = next.rateCards.find((r) => r.id === change.rateCardId)
              if (card) {
                const bill = billFromPay(change.newRate, card.markupPct)
                const today = todayISO()
                const venueMetro = new Map(next.venues.map((v) => [v.id, v.metro]))
                let repriced = 0
                next = {
                  ...next,
                  rateCards: next.rateCards.map((r) => (r.id === card.id ? { ...r, payRate: change.newRate!, billRate: bill, version: r.version + 1, effectiveFrom: today, updatedBy: who } : r)),
                  requests: next.requests.map((r) => {
                    if (r.positionId !== card.positionId || venueMetro.get(r.venueId) !== card.metro) return r
                    if (r.state === "cancelled" || [...r.dates].sort()[0] < today) return r
                    repriced++
                    return { ...r, payRate: change.newRate!, billRate: bill }
                  }),
                }
                log({ kind: "rate", text: `${who} approved rate revision, ${change.summary}. ${repriced} upcoming requests repriced automatically.` })
              }
            }
            if (change.type === "Date extension" && change.requestId) {
              const req = next.requests.find((r) => r.id === change.requestId)
              if (req) {
                const newDates = req.dates.map((d) => toISODate(addDays(parseLocal(d), 7)))
                const merged = [...new Set([...req.dates, ...newDates])].sort()
                const extra = makeShifts(req, newDates.filter((d) => !req.dates.includes(d)), 1, req.headcount, () => nextId("shift"))
                next = {
                  ...next,
                  requests: next.requests.map((r) => (r.id === req.id ? { ...r, dates: merged, liveFill: true } : r)),
                  shifts: [...next.shifts, ...extra],
                }
              }
            }
            log({ kind: "change", text: `${who} approved: ${change.summary}`, requestId: change.requestId })
            notify({ title: "Change request approved", body: change.summary, href: change.requestId ? `/requests/${change.requestId}` : "/rates", kind: "change", personas: [...new Set<PersonaId>([...requester, "supplier"])] })
            return next
          })
        },

        requestRateRevision: (rateCardId, newPayRate, detail) => {
          mutate(({ data, id, log, notify, who }) => {
            const card = data.rateCards.find((r) => r.id === rateCardId)
            if (!card) return
            const position = data.positions.find((p) => p.id === card.positionId)
            const persona = get().persona
            const change = {
              id: id("change"),
              type: "Rate revision" as const,
              rateCardId,
              positionId: card.positionId,
              requestedBy: who,
              requestedByPersona: persona,
              createdAt: nowLocal(),
              status: "Pending" as const,
              newRate: round2(newPayRate),
              summary: `Change ${position?.title ?? "position"} (${card.metro}) pay to $${newPayRate.toFixed(2)}/hr`,
              detail,
            }
            log({ kind: "rate", text: `${who} requested a rate revision: ${change.summary}` })
            notify({ title: "Rate revision requested", body: change.summary, href: "/inbox", kind: "rate", personas: ["program"] })
            return { ...data, changeRequests: [change, ...data.changeRequests] }
          })
        },

        approveEntries: (ids) => {
          const target = new Set(ids)
          let count = 0
          mutate(({ data, log, notify, who }) => {
            const now = nowLocal()
            const timeEntries = data.timeEntries.map((e) => {
              if (!target.has(e.id)) return e
              if (e.status !== "Pending" && e.status !== "Disputed") return e
              count++
              return { ...e, status: "Approved" as const, approvedAt: now, approvedBy: who, dispute: undefined }
            })
            if (count === 0) return
            log({ kind: "timesheet", text: `${who} approved ${count} ${count === 1 ? "timesheet" : "timesheets"}` })
            if (count >= 5) notify({ title: `${count} timesheets approved`, body: `${who} approved hours: they roll into the next invoice run automatically.`, href: "/timesheets", kind: "timesheet", personas: ["supplier"] })
            return { ...data, timeEntries }
          })
          return count
        },

        adjustEntry: (id, patch, reason, note) => {
          mutate(({ data, log, who }) => {
            const entry = data.timeEntries.find((e) => e.id === id)
            if (!entry) return
            const req = data.requests.find((r) => r.id === entry.requestId)
            if (!req) return
            const parts: string[] = []
            if (patch.clockIn && patch.clockIn !== entry.clockIn) parts.push(`In ${formatClock(entry.clockIn)} → ${formatClock(patch.clockIn)}`)
            if (patch.clockOut !== undefined && patch.clockOut !== entry.clockOut) parts.push(`Out ${formatClock(entry.clockOut)} → ${formatClock(patch.clockOut)}`)
            if (patch.breakMinutes !== undefined && patch.breakMinutes !== entry.breakMinutes) parts.push(`Break ${entry.breakMinutes} → ${patch.breakMinutes} min`)
            const updated: TimeEntry = {
              ...entry,
              clockIn: patch.clockIn ?? entry.clockIn,
              clockOut: patch.clockOut ?? entry.clockOut,
              breakMinutes: patch.breakMinutes ?? entry.breakMinutes,
            }
            const anomalies = detectAnomalies(updated, req).filter((a) => a !== "late_arrival" && a !== "early_departure")
            const now = nowLocal()
            const final: TimeEntry = {
              ...updated,
              anomalies,
              status: "Approved",
              approvedAt: now,
              approvedBy: who,
              dispute: undefined,
              adjustments: [...entry.adjustments, { at: now, by: who, summary: parts.join(" · ") || "Hours confirmed", reason, note: note?.trim() || undefined }],
            }
            log({ kind: "timesheet", text: `${who} adjusted ${id} (${reason})`, requestId: entry.requestId, workerId: entry.workerId })
            const timeEntries = recomputeEntries(data.timeEntries.map((e) => (e.id === id ? final : e)), data.policies)
            return { ...data, timeEntries }
          })
        },

        disputeEntry: (id, reason, note) => {
          mutate(({ data, log, notify, who }) => {
            const entry = data.timeEntries.find((e) => e.id === id)
            if (!entry) return
            const worker = data.workers.find((w) => w.id === entry.workerId)
            log({ kind: "timesheet", text: `${who} disputed ${id}: ${reason}`, requestId: entry.requestId, workerId: entry.workerId })
            notify({ title: `Timesheet ${id} disputed`, body: `${reason}: ${workerName(worker)}`, href: "/timesheets?tab=disputed", kind: "timesheet", personas: ["supplier"] })
            return {
              ...data,
              timeEntries: data.timeEntries.map((e) =>
                e.id === id ? { ...e, status: "Disputed", dispute: { reason, note: note.trim(), by: who, at: nowLocal() } } : e
              ),
            }
          })
        },

        respondToDispute: (id, note) => {
          mutate(({ data, log, notify, who }) => {
            const entry = data.timeEntries.find((e) => e.id === id)
            if (!entry?.dispute) return
            log({ kind: "timesheet", text: `${who} responded to the dispute on ${id}`, requestId: entry.requestId })
            notify({ title: `Supplier responded on ${id}`, body: note, href: "/timesheets?tab=disputed", kind: "timesheet", personas: ["venue"] })
            return {
              ...data,
              timeEntries: data.timeEntries.map((e) =>
                e.id === id && e.dispute ? { ...e, dispute: { ...e.dispute, response: { note: note.trim(), by: who, at: nowLocal() } } } : e
              ),
            }
          })
        },

        reassignEntry: (id, newWorkerId, note) => {
          mutate(({ data, log, who }) => {
            const entry = data.timeEntries.find((e) => e.id === id)
            const from = data.workers.find((w) => w.id === entry?.workerId)
            const to = data.workers.find((w) => w.id === newWorkerId)
            if (!entry || !to) return
            const now = nowLocal()
            log({ kind: "timesheet", text: `${who} moved ${id} from ${workerName(from)} to ${workerName(to)} (worker swap)`, requestId: entry.requestId, workerId: newWorkerId })
            const timeEntries = recomputeEntries(
              data.timeEntries.map((e) =>
                e.id === id
                  ? {
                      ...e,
                      workerId: newWorkerId,
                      status: "Approved" as const,
                      approvedAt: now,
                      approvedBy: who,
                      dispute: undefined,
                      adjustments: [...e.adjustments, { at: now, by: who, summary: `Hours moved from ${workerName(from)} to ${workerName(to)}`, reason: "Worker swap" as const, note: note?.trim() || undefined }],
                    }
                  : e
              ),
              data.policies
            )
            return {
              ...data,
              timeEntries,
              shifts: data.shifts.map((s) => (s.id === entry.shiftId ? { ...s, workerId: newWorkerId } : s)),
            }
          })
        },

        createTipBatch: (input) => {
          let newId = ""
          mutate(({ data, id, log, notify, who }) => {
            newId = id("tip")
            const status: TipBatch["status"] = !input.submit
              ? "Draft"
              : data.policies.requireTipApproval
                ? "Pending approval"
                : "Approved"
            const now = nowLocal()
            const batch: TipBatch = {
              id: newId,
              venueId: input.venueId,
              costCenterId: input.costCenterId,
              eventName: input.eventName,
              date: input.date,
              requestIds: input.requestIds,
              lines: input.lines.filter((l) => l.amount > 0),
              status,
              method: input.method,
              createdBy: who,
              createdAt: now,
              note: input.note,
              approvedAt: status === "Approved" ? now : undefined,
              approvedBy: status === "Approved" ? "Policy · no approval required" : undefined,
            }
            const total = round2(batch.lines.reduce((s, l) => s + l.amount, 0))
            log({ kind: "tips", text: `${who} ${input.submit ? "submitted" : "saved"} tips for ${input.eventName} · ${money(total, true)}`, venueId: input.venueId })
            if (status === "Pending approval") notify({ title: "Tip batch awaiting approval", body: `${input.eventName} · ${batch.lines.length} Pros · ${money(total, true)}`, href: "/tips", kind: "tips", personas: ["venue"], venueId: input.venueId })
            return { ...data, tipBatches: [batch, ...data.tipBatches] }
          })
          return newId
        },

        updateTipBatch: (id, lines, note) => {
          mutate(({ data }) => ({
            ...data,
            tipBatches: data.tipBatches.map((b) => (b.id === id ? { ...b, lines: lines.filter((l) => l.amount > 0), note: note ?? b.note } : b)),
          }))
        },

        submitTipBatch: (id) => {
          mutate(({ data, log, who }) => {
            const batch = data.tipBatches.find((b) => b.id === id)
            if (!batch) return
            log({ kind: "tips", text: `${who} submitted tips for ${batch.eventName}`, venueId: batch.venueId })
            const approvedNow = !data.policies.requireTipApproval
            return {
              ...data,
              tipBatches: data.tipBatches.map((b) =>
                b.id === id
                  ? { ...b, status: approvedNow ? "Approved" : "Pending approval", approvedAt: approvedNow ? nowLocal() : undefined, approvedBy: approvedNow ? "Policy · no approval required" : undefined }
                  : b
              ),
            }
          })
        },

        approveTipBatch: (id) => {
          mutate(({ data, log, notify, who }) => {
            const batch = data.tipBatches.find((b) => b.id === id)
            if (!batch) return
            const total = round2(batch.lines.reduce((s, l) => s + l.amount, 0))
            log({ kind: "tips", text: `${who} approved tips for ${batch.eventName} · ${money(total, true)}`, venueId: batch.venueId })
            notify({ title: "Tips approved", body: `${batch.eventName} · ${money(total, true)}, Pros are paid next business day.`, href: "/tips", kind: "tips", personas: ["supplier"], venueId: batch.venueId })
            return { ...data, tipBatches: data.tipBatches.map((b) => (b.id === id ? { ...b, status: "Approved", approvedAt: nowLocal(), approvedBy: who } : b)) }
          })
        },

        rejectTipBatch: (id, note) => {
          mutate(({ data, log, who }) => {
            const batch = data.tipBatches.find((b) => b.id === id)
            if (!batch) return
            log({ kind: "tips", text: `${who} returned tips for ${batch.eventName}: ${note}`, venueId: batch.venueId })
            return { ...data, tipBatches: data.tipBatches.map((b) => (b.id === id ? { ...b, status: "Rejected", note } : b)) }
          })
        },

        deleteTipBatch: (id) => {
          mutate(({ data }) => ({ ...data, tipBatches: data.tipBatches.filter((b) => b.id !== id || b.status !== "Draft") }))
        },

        approveInvoice: (id) => {
          mutate(({ data, id: nextId, log, notify, who }) => {
            const inv = data.invoices.find((i) => i.id === id)
            if (!inv || (inv.status !== "Pending approval" && inv.status !== "Disputed")) return
            if (inv.disputes.some((d) => d.status === "Open")) return
            const now = nowLocal()
            const payDate = toISODate(nextFriday(startOfDay(new Date())))
            const net = lineTotals(inv.lines, data.policies.msaFeePct).netToSupplier
            const existing = data.payments.find((p) => p.supplierId === inv.supplierId && p.date === payDate && p.status === "Scheduled")
            let payments: Payment[]
            if (existing) {
              payments = data.payments.map((p) => (p.id === existing.id ? { ...p, amount: round2(p.amount + net), invoiceIds: [...p.invoiceIds, inv.id] } : p))
            } else {
              payments = [
                { id: nextId("payment"), supplierId: inv.supplierId, amount: net, date: payDate, method: "ACH", reference: `ACH-${Math.floor(10000000 + Math.random() * 89999999)}`, invoiceIds: [inv.id], status: "Scheduled" },
                ...data.payments,
              ]
            }
            log({ kind: "invoice", text: `${who} approved invoice ${id} · payment scheduled ${payDate}`, invoiceId: id, venueId: inv.venueId })
            notify({ title: `Invoice ${id} approved`, body: `Payment of ${money(net, true)} scheduled for ${payDate}.`, href: `/invoices/${id}`, kind: "invoice", personas: ["supplier"] })
            return { ...data, payments, invoices: data.invoices.map((i) => (i.id === id ? { ...i, status: "Approved", approvedAt: now, approvedBy: who } : i)) }
          })
        },

        disputeInvoiceLine: (invoiceId, lineId, reason, note) => {
          mutate(({ data, log, notify, who }) => {
            const inv = data.invoices.find((i) => i.id === invoiceId)
            if (!inv) return
            log({ kind: "invoice", text: `${who} disputed a line on ${invoiceId}: ${reason}`, invoiceId, venueId: inv.venueId })
            notify({ title: `Invoice ${invoiceId} disputed`, body: reason, href: `/invoices/${invoiceId}`, kind: "invoice", personas: ["supplier", "program"] })
            return {
              ...data,
              invoices: data.invoices.map((i) =>
                i.id === invoiceId
                  ? { ...i, status: "Disputed", disputes: [...i.disputes, { id: `d${i.disputes.length + 1}`, lineId, reason, note: note.trim(), by: who, at: nowLocal(), status: "Open" }] }
                  : i
              ),
            }
          })
        },

        resolveInvoiceDispute: (invoiceId, disputeId, creditAmount, note) => {
          mutate(({ data, log, who }) => {
            const inv = data.invoices.find((i) => i.id === invoiceId)
            if (!inv) return
            const dispute = inv.disputes.find((d) => d.id === disputeId)
            if (!dispute) return
            const line = inv.lines.find((l) => l.id === dispute.lineId)
            const lines: InvoiceLine[] =
              creditAmount > 0
                ? [
                    ...inv.lines,
                    { id: `${inv.id}-c${inv.lines.length + 1}`, kind: "credit", description: `Credit · ${line?.description ?? "adjustment"}${note ? ` · ${note}` : ""}`, costCenterId: line?.costCenterId ?? "", date: line?.date, timeEntryIds: [], quantity: 1, rate: -creditAmount, amount: -round2(creditAmount) },
                  ]
                : inv.lines
            const disputes = inv.disputes.map((d) => (d.id === disputeId ? { ...d, status: "Resolved" as const } : d))
            const stillOpen = disputes.some((d) => d.status === "Open")
            log({ kind: "invoice", text: `${who} resolved a dispute on ${invoiceId}${creditAmount > 0 ? ` with a ${money(creditAmount, true)} credit` : ""}`, invoiceId, venueId: inv.venueId })
            return {
              ...data,
              invoices: data.invoices.map((i) => (i.id === invoiceId ? { ...i, lines, disputes, status: stillOpen ? "Disputed" : "Pending approval" } : i)),
            }
          })
        },

        runInvoiceCycle: () => {
          let created = 0
          mutate(({ data, id, log, notify, who }) => {
            const reqMap = new Map(data.requests.map((r) => [r.id, r]))
            const workerMap = new Map(data.workers.map((w) => [w.id, w]))
            const posMap = new Map(data.positions.map((p) => [p.id, p]))
            const now = new Date()
            const groups = new Map<string, TimeEntry[]>()
            for (const e of data.timeEntries) {
              if (e.status !== "Approved" && e.status !== "Auto-approved") continue
              const req = reqMap.get(e.requestId)
              const w = workerMap.get(e.workerId)
              if (!req || !w) continue
              const key = `${w.supplierId}|${req.venueId}`
              const g = groups.get(key)
              if (g) g.push(e)
              else groups.set(key, [e])
            }
            const tipBatches = data.tipBatches.filter((b) => b.status === "Approved" && !b.invoiceId)
            const tipKeys = new Set<string>()
            for (const b of tipBatches) {
              for (const l of b.lines) {
                const w = workerMap.get(l.workerId)
                if (w) tipKeys.add(`${w.supplierId}|${b.venueId}`)
              }
            }
            const allKeys = new Set([...groups.keys(), ...tipKeys])
            const invoices = [...data.invoices]
            const entryInvoice = new Map<string, string>()
            const tipInvoice = new Map<string, string>()
            for (const key of allKeys) {
              const [supplierId, venueId] = key.split("|")
              const entries = groups.get(key) ?? []
              const invId = id("invoice")
              const lines: InvoiceLine[] = []
              const byReqDate = new Map<string, TimeEntry[]>()
              for (const e of entries) {
                const k = `${e.requestId}|${e.date}`
                const g = byReqDate.get(k)
                if (g) g.push(e)
                else byReqDate.set(k, [e])
              }
              let n = 1
              for (const [k, group] of byReqDate) {
                const [requestId, date] = k.split("|")
                const req = reqMap.get(requestId)!
                const pos = posMap.get(req.positionId)
                const reg = round2(group.reduce((s, e) => s + e.regularHours, 0))
                const ot = round2(group.reduce((s, e) => s + e.overtimeHours, 0))
                const label = `${pos?.title ?? "Labor"} · ${req.eventName ?? "Dining service"} · ${date.slice(5).replace("-", "/")}`
                lines.push({ id: `${invId}-${n++}`, kind: "labor", description: label, requestId, positionId: req.positionId, costCenterId: req.costCenterId, date, timeEntryIds: group.map((e) => e.id), quantity: reg, rate: req.billRate, amount: round2(reg * req.billRate) })
                if (ot > 0) lines.push({ id: `${invId}-${n++}`, kind: "overtime", description: `${label} · overtime`, requestId, positionId: req.positionId, costCenterId: req.costCenterId, date, timeEntryIds: group.filter((e) => e.overtimeHours > 0).map((e) => e.id), quantity: ot, rate: round2(req.billRate * data.policies.overtimeMultiplier), amount: round2(ot * req.billRate * data.policies.overtimeMultiplier) })
                for (const e of group) entryInvoice.set(e.id, invId)
              }
              for (const b of tipBatches.filter((t) => t.venueId === venueId)) {
                const mine = b.lines.filter((l) => workerMap.get(l.workerId)?.supplierId === supplierId)
                if (mine.length === 0) continue
                lines.push({ id: `${invId}-${n++}`, kind: "tips", description: `Tips · ${b.eventName}`, costCenterId: b.costCenterId, date: b.date, timeEntryIds: [], tipBatchId: b.id, quantity: mine.length, rate: 0, amount: round2(mine.reduce((s, l) => s + l.amount, 0)) })
                if (!tipInvoice.has(b.id)) tipInvoice.set(b.id, invId)
              }
              if (lines.length === 0) continue
              const dates = lines.map((l) => l.date).filter(Boolean).sort() as string[]
              invoices.push({
                id: invId,
                supplierId,
                venueId,
                periodStart: dates[0] ?? todayISO(),
                periodEnd: dates[dates.length - 1] ?? todayISO(),
                lines,
                status: "Pending approval",
                issuedAt: toLocal(now),
                dueDate: toISODate(addDays(now, 30)),
                disputes: [],
                poNumber: `4500${Math.floor(100000 + Math.random() * 899999)}`,
              })
              created++
            }
            if (created === 0) return
            log({ kind: "invoice", text: `${who} ran the invoice cycle · ${created} invoices issued` })
            notify({ title: `${created} invoices issued`, body: "Consolidated from approved timesheets and tips.", href: "/invoices", kind: "invoice", personas: ["venue", "program", "supplier"] })
            return {
              ...data,
              invoices,
              timeEntries: data.timeEntries.map((e) => (entryInvoice.has(e.id) ? { ...e, status: "Invoiced" as const, invoiceId: entryInvoice.get(e.id) } : e)),
              tipBatches: data.tipBatches.map((b) => (tipInvoice.has(b.id) ? { ...b, invoiceId: tipInvoice.get(b.id) } : b)),
            }
          })
          return created
        },

        payInvoices: (ids) => {
          let paymentId: string | null = null
          mutate(({ data, id, log, notify, who }) => {
            const targets = data.invoices.filter((i) => ids.includes(i.id) && i.status === "Approved")
            if (targets.length === 0) return
            const bySupplier = new Map<string, typeof targets>()
            for (const inv of targets) {
              const g = bySupplier.get(inv.supplierId)
              if (g) g.push(inv)
              else bySupplier.set(inv.supplierId, [inv])
            }
            const now = new Date()
            const newPayments: Payment[] = []
            const paidMap = new Map<string, string>()
            for (const [supplierId, group] of bySupplier) {
              const pid = id("payment")
              paymentId = paymentId ?? pid
              const amount = round2(group.reduce((s, inv) => s + lineTotals(inv.lines, data.policies.msaFeePct).netToSupplier, 0))
              newPayments.push({ id: pid, supplierId, amount, date: toISODate(now), method: "ACH", reference: `ACH-${Math.floor(10000000 + Math.random() * 89999999)}`, invoiceIds: group.map((g) => g.id), status: "Settled" })
              for (const g of group) paidMap.set(g.id, pid)
            }
            const scheduledIds = new Set(ids)
            log({ kind: "payment", text: `${who} released ${newPayments.length} ${newPayments.length === 1 ? "payment" : "payments"} covering ${targets.length} invoices` })
            notify({ title: "Payment released", body: `${targets.length} invoices paid via ACH.`, href: "/invoices?tab=payments", kind: "payment", personas: ["supplier"] })
            return {
              ...data,
              invoices: data.invoices.map((i) => (paidMap.has(i.id) ? { ...i, status: "Paid", paidAt: toLocal(now), paymentId: paidMap.get(i.id) } : i)),
              payments: [
                ...newPayments,
                ...data.payments
                  .map((p) => (p.status === "Scheduled" ? { ...p, invoiceIds: p.invoiceIds.filter((x) => !scheduledIds.has(x)) } : p))
                  .filter((p) => p.invoiceIds.length > 0),
              ],
              tipBatches: data.tipBatches.map((b) => (b.invoiceId && paidMap.has(b.invoiceId) ? { ...b, status: "Paid" } : b)),
            }
          })
          return paymentId
        },

        toggleFavorite: (venueId, workerId) => {
          mutate(({ data, log, who }) => {
            const roster = data.rosters.find((r) => r.venueId === venueId)
            if (!roster) return
            const isFav = roster.favorites.includes(workerId)
            const worker = data.workers.find((w) => w.id === workerId)
            log({ kind: "roster", text: `${who} ${isFav ? "removed" : "added"} ${workerName(worker)} ${isFav ? "from" : "to"} favorites`, workerId, venueId })
            return {
              ...data,
              rosters: data.rosters.map((r) =>
                r.venueId === venueId
                  ? { ...r, favorites: isFav ? r.favorites.filter((f) => f !== workerId) : [...r.favorites, workerId] }
                  : r
              ),
            }
          })
        },

        blockWorker: (venueId, workerId, reason) => {
          mutate(({ data, log, notify, who }) => {
            const worker = data.workers.find((w) => w.id === workerId)
            const venueReqs = new Set(data.requests.filter((r) => r.venueId === venueId).map((r) => r.id))
            const today = todayISO()
            let released = 0
            const touched = new Set<string>()
            const shifts = data.shifts.map((s) => {
              if (s.workerId !== workerId || !venueReqs.has(s.requestId) || s.date <= today || s.status !== "Confirmed") return s
              released++
              touched.add(s.requestId)
              return { ...s, workerId: undefined, status: "Open" as const, assignedAt: undefined }
            })
            log({ kind: "roster", text: `${who} added ${workerName(worker)} to the do-not-return list${released ? ` · ${released} upcoming shifts reopened` : ""}`, workerId, venueId })
            if (released) notify({ title: "Shifts reopened after DNR", body: `${released} upcoming shifts for ${workerName(worker)} were released and are being refilled.`, href: "/requests", kind: "roster", personas: ["supplier"], venueId })
            return {
              ...data,
              shifts,
              requests: data.requests.map((r) => (touched.has(r.id) ? { ...r, liveFill: true } : r)),
              rosters: data.rosters.map((r) =>
                r.venueId === venueId
                  ? {
                      ...r,
                      favorites: r.favorites.filter((f) => f !== workerId),
                      blocked: [...r.blocked.filter((b) => b.workerId !== workerId), { workerId, reason, at: nowLocal(), by: who }],
                    }
                  : r
              ),
            }
          })
        },

        unblockWorker: (venueId, workerId) => {
          mutate(({ data, log, who }) => {
            const worker = data.workers.find((w) => w.id === workerId)
            log({ kind: "roster", text: `${who} removed ${workerName(worker)} from the do-not-return list`, workerId, venueId })
            return {
              ...data,
              rosters: data.rosters.map((r) => (r.venueId === venueId ? { ...r, blocked: r.blocked.filter((b) => b.workerId !== workerId) } : r)),
            }
          })
        },

        updateRateCard: (id, patch) => {
          let repriced = 0
          mutate(({ data, log, notify, who }) => {
            const card = data.rateCards.find((r) => r.id === id)
            if (!card) return
            const payRate = round2(patch.payRate ?? card.payRate)
            const markupPct = patch.markupPct ?? card.markupPct
            const billRate = billFromPay(payRate, markupPct)
            const today = todayISO()
            const venueMetro = new Map(data.venues.map((v) => [v.id, v.metro]))
            const requests = data.requests.map((r) => {
              if (r.positionId !== card.positionId || venueMetro.get(r.venueId) !== card.metro) return r
              if (r.state === "cancelled" || [...r.dates].sort()[0] < today) return r
              repriced++
              return { ...r, payRate, billRate }
            })
            const position = data.positions.find((p) => p.id === card.positionId)
            log({ kind: "rate", text: `${who} published ${position?.title ?? "rate"} (${card.metro}) v${card.version + 1}: pay $${payRate.toFixed(2)}, bill $${billRate.toFixed(2)} · ${repriced} upcoming requests repriced` })
            notify({ title: "Rate card updated", body: `${position?.title ?? "Position"} · ${card.metro} bill rate now $${billRate.toFixed(2)}/hr`, href: "/rates", kind: "rate", personas: ["venue", "supplier"] })
            return {
              ...data,
              requests,
              rateCards: data.rateCards.map((r) => (r.id === id ? { ...r, payRate, markupPct, billRate, version: r.version + 1, effectiveFrom: today, updatedBy: who } : r)),
            }
          })
          return repriced
        },

        updateCostCenter: (id, patch) => {
          mutate(({ data, log, who }) => {
            const cc = data.costCenters.find((c) => c.id === id)
            if (!cc) return
            log({ kind: "policy", text: `${who} updated cost center ${cc.code} · ${cc.name}`, venueId: cc.venueId })
            return { ...data, costCenters: data.costCenters.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
          })
        },

        updatePolicies: (patch) => {
          mutate(({ data, log, who }) => {
            log({ kind: "policy", text: `${who} updated program policies` })
            return { ...data, policies: { ...data.policies, ...patch } }
          })
        },

        setSupplierActive: (id, active) => {
          mutate(({ data, log, who }) => {
            const s = data.suppliers.find((x) => x.id === id)
            log({ kind: "policy", text: `${who} ${active ? "resumed" : "paused"} distribution to ${s?.name ?? id}` })
            return { ...data, suppliers: data.suppliers.map((x) => (x.id === id ? { ...x, active } : x)) }
          })
        },

        renewSupplierCoi: (id) => {
          mutate(({ data, log, who }) => {
            const s = data.suppliers.find((x) => x.id === id)
            log({ kind: "policy", text: `${who} verified a renewed certificate of insurance for ${s?.name ?? id}` })
            return {
              ...data,
              suppliers: data.suppliers.map((x) => (x.id === id ? { ...x, coiExpires: toISODate(addDays(new Date(), 365)), active: true } : x)),
            }
          })
        },

        addComment: (requestId, body) => {
          const persona = get().persona
          mutate(({ data, id, notify, who }) => {
            const text = body.trim()
            if (!text) return
            const req = data.requests.find((r) => r.id === requestId)
            const others = (["venue", "program", "supplier"] as PersonaId[]).filter((p) => p !== persona)
            notify({ title: `New message on ${requestId}`, body: `${who}: ${text.slice(0, 120)}`, href: `/requests/${requestId}?tab=activity`, kind: "message", personas: others, venueId: req?.venueId })
            return {
              ...data,
              comments: [...data.comments, { id: id("comment"), requestId, author: who, authorPersona: persona, at: nowLocal(), body: text }],
            }
          })
        },

        markNotificationRead: (id) => {
          const { data } = get()
          set({ data: { ...data, notifications: data.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) } })
        },

        markAllNotificationsRead: () => {
          const { data, persona } = get()
          set({
            data: {
              ...data,
              notifications: data.notifications.map((n) => (n.personas.includes(persona) ? { ...n, read: true } : n)),
            },
          })
        },
      }
    },
    {
      name: STORAGE_KEY,
      version: DATA_VERSION,
      storage,
      skipHydration: true,
      partialize: (state) => ({ data: state.data, persona: state.persona }),
      migrate: () => ({ data: emptyData(), persona: "venue" }) as Persisted,
      merge: (persisted, current) => {
        const p = persisted as Partial<Persisted> | undefined
        if (!p?.data || p.data.version !== DATA_VERSION) return { ...current, persona: p?.persona ?? current.persona }
        return { ...current, data: p.data, persona: p.persona ?? current.persona }
      },
    }
  )
)

export function useActions(): StoreActions {
  return useStore.getState()
}

export function getActions(): StoreActions {
  return useStore.getState()
}
