import { addDays, addHours, addMinutes, differenceInHours, startOfDay } from "date-fns"

import { DATA_VERSION, makeIdFactory, type DemoData } from "@/lib/data"
import { formatClock, formatDate, parseLocal, shiftWindow, toISODate, toLocal, weekStartOf } from "@/lib/dates"
import { advance, fateFor, jitterFor, pickWorker } from "@/lib/engine"
import { round2, workerName } from "@/lib/format"
import { invoiceTotals } from "@/lib/invoice"
import { createRng } from "@/lib/random"
import {
  alcoholCertFor,
  BASE_PAY,
  COST_CENTERS,
  DEFAULT_POLICIES,
  FIRST_NAMES,
  LAST_NAMES,
  METROS,
  PERSONAS,
  POSITIONS,
  PREFERRED_NAMES,
  SUPPLIERS,
  VENUES,
} from "@/lib/reference"
import {
  billFromPay,
  defaultBreakMinutes,
  estimateRequestCost,
  recomputeEntries,
  requiredCertsFor,
} from "@/lib/rules"
import type {
  Activity,
  AppNotification,
  ApprovalStep,
  Certification,
  ChangeRequest,
  Comment,
  CostCenter,
  Invoice,
  InvoiceLine,
  ISODate,
  OnboardingItem,
  Payment,
  PersonaId,
  RateCardEntry,
  RequestReason,
  Shift,
  StaffingRequest,
  Supplier,
  TimeEntry,
  TipBatch,
  Venue,
  VenueRoster,
  Worker,
} from "@/lib/types"

interface MixItem {
  pos: string
  cc: string
  min: number
  max: number
}

interface RecurringItem {
  pos: string
  cc: string
  start: string
  end: string
  min: number
  max: number
}

interface Schedule {
  venueId: string
  weekdays: number[]
  perWeek: number
  names: string[]
  times: [string, string][]
  mix: MixItem[]
  pick: [number, number]
  scale: number
  reason?: RequestReason
  recurring?: RecurringItem[]
}

const SCHEDULES: Schedule[] = [
  {
    venueId: "v-wrigley",
    weekdays: [2, 3, 4, 5, 6],
    perWeek: 2,
    names: ["Cubs vs. Cardinals", "Cubs vs. Brewers", "Cubs vs. Reds", "Cubs vs. Pirates", "Wrigley Field Concert", "Gallagher Way Fall Fest"],
    times: [["15:30", "22:30"], ["15:30", "22:30"], ["10:00", "17:30"]],
    mix: [
      { pos: "p-concessions", cc: "cc-41820", min: 10, max: 22 },
      { pos: "p-cashier", cc: "cc-41820", min: 4, max: 10 },
      { pos: "p-cash-bartender", cc: "cc-41820", min: 6, max: 14 },
      { pos: "p-grill-cook", cc: "cc-41820", min: 3, max: 7 },
      { pos: "p-runner", cc: "cc-41820", min: 3, max: 6 },
      { pos: "p-barback", cc: "cc-41820", min: 2, max: 4 },
      { pos: "p-suite-attendant", cc: "cc-41826", min: 6, max: 12 },
      { pos: "p-suite-bartender", cc: "cc-41826", min: 2, max: 5 },
      { pos: "p-banquet-server", cc: "cc-41826", min: 6, max: 14 },
      { pos: "p-captain", cc: "cc-41826", min: 1, max: 2 },
    ],
    pick: [4, 6],
    scale: 0.75,
  },
  {
    venueId: "v-soldier",
    weekdays: [0],
    perWeek: 1,
    names: ["Bears vs. Packers", "Bears vs. Lions", "Bears vs. Vikings", "Bears vs. Commanders", "Bears vs. 49ers"],
    times: [["14:00", "23:00"], ["08:30", "17:30"]],
    mix: [
      { pos: "p-concessions", cc: "cc-52610", min: 14, max: 28 },
      { pos: "p-cashier", cc: "cc-52610", min: 6, max: 12 },
      { pos: "p-cash-bartender", cc: "cc-52610", min: 8, max: 16 },
      { pos: "p-grill-cook", cc: "cc-52610", min: 4, max: 8 },
      { pos: "p-line-cook", cc: "cc-52610", min: 2, max: 5 },
      { pos: "p-runner", cc: "cc-52610", min: 4, max: 8 },
      { pos: "p-banquet-server", cc: "cc-52614", min: 10, max: 22 },
      { pos: "p-suite-attendant", cc: "cc-52614", min: 8, max: 14 },
      { pos: "p-suite-bartender", cc: "cc-52614", min: 3, max: 6 },
      { pos: "p-captain", cc: "cc-52614", min: 1, max: 2 },
    ],
    pick: [5, 7],
    scale: 0.7,
  },
  {
    venueId: "v-united",
    weekdays: [2, 3, 5, 6],
    perWeek: 2,
    names: ["Bulls vs. Knicks", "Bulls vs. Celtics", "Bulls vs. Bucks", "Blackhawks vs. Blues", "Blackhawks vs. Red Wings", "Blackhawks vs. Wild", "United Center Concert"],
    times: [["16:30", "23:30"]],
    mix: [
      { pos: "p-concessions", cc: "cc-38470", min: 8, max: 18 },
      { pos: "p-cashier", cc: "cc-38470", min: 4, max: 9 },
      { pos: "p-cash-bartender", cc: "cc-38470", min: 6, max: 12 },
      { pos: "p-grill-cook", cc: "cc-38470", min: 2, max: 5 },
      { pos: "p-runner", cc: "cc-38470", min: 3, max: 6 },
      { pos: "p-banquet-server", cc: "cc-38476", min: 6, max: 12 },
      { pos: "p-suite-attendant", cc: "cc-38476", min: 6, max: 10 },
      { pos: "p-suite-bartender", cc: "cc-38476", min: 2, max: 4 },
      { pos: "p-dishwasher", cc: "cc-38476", min: 2, max: 3 },
    ],
    pick: [4, 6],
    scale: 0.7,
  },
  {
    venueId: "v-lynn",
    weekdays: [3, 6],
    perWeek: 1,
    names: ["Louisville City FC vs. Indy Eleven", "Louisville City FC vs. Tampa Bay", "Racing Louisville FC vs. NC Courage"],
    times: [["16:00", "22:30"]],
    mix: [
      { pos: "p-concessions", cc: "cc-60311", min: 6, max: 14 },
      { pos: "p-cashier", cc: "cc-60311", min: 3, max: 6 },
      { pos: "p-cash-bartender", cc: "cc-60311", min: 4, max: 8 },
      { pos: "p-grill-cook", cc: "cc-60311", min: 2, max: 4 },
    ],
    pick: [2, 4],
    scale: 0.6,
  },
  {
    venueId: "v-phoenix",
    weekdays: [5, 6, 0],
    perWeek: 1,
    names: ["NASCAR Cup Series Race Weekend", "NASCAR Xfinity Series Race", "Raceway Hospitality Village"],
    times: [["07:00", "17:00"]],
    mix: [
      { pos: "p-concessions", cc: "cc-71201", min: 10, max: 22 },
      { pos: "p-cashier", cc: "cc-71201", min: 4, max: 9 },
      { pos: "p-cash-bartender", cc: "cc-71201", min: 6, max: 12 },
      { pos: "p-banquet-server", cc: "cc-71204", min: 8, max: 16 },
      { pos: "p-suite-attendant", cc: "cc-71204", min: 4, max: 9 },
      { pos: "p-captain", cc: "cc-71204", min: 1, max: 2 },
    ],
    pick: [3, 5],
    scale: 0.55,
  },
  {
    venueId: "v-lower",
    weekdays: [3, 6],
    perWeek: 1,
    names: ["Columbus Crew vs. FC Cincinnati", "Columbus Crew vs. Chicago Fire FC", "Columbus Crew vs. Nashville SC"],
    times: [["17:00", "23:00"]],
    mix: [
      { pos: "p-concessions", cc: "cc-64420", min: 6, max: 14 },
      { pos: "p-cashier", cc: "cc-64420", min: 3, max: 6 },
      { pos: "p-cash-bartender", cc: "cc-64420", min: 4, max: 8 },
      { pos: "p-grill-cook", cc: "cc-64420", min: 2, max: 4 },
    ],
    pick: [2, 4],
    scale: 0.6,
  },
  {
    venueId: "v-sloan",
    weekdays: [2, 4, 6],
    perWeek: 1,
    names: ["Mesa Solar Sox · Arizona Fall League", "Arizona Fall League Doubleheader"],
    times: [["11:00", "17:00"]],
    mix: [
      { pos: "p-concessions", cc: "cc-71950", min: 4, max: 8 },
      { pos: "p-cashier", cc: "cc-71950", min: 2, max: 4 },
      { pos: "p-cash-bartender", cc: "cc-71950", min: 2, max: 4 },
    ],
    pick: [2, 3],
    scale: 0.7,
  },
  {
    venueId: "v-ford",
    weekdays: [0, 4],
    perWeek: 1,
    names: ["Lions vs. Bears", "Lions vs. Packers", "Lions vs. Vikings", "Ford Field Concert"],
    times: [["09:00", "18:00"], ["15:00", "23:30"]],
    mix: [
      { pos: "p-concessions", cc: "cc-47730", min: 10, max: 22 },
      { pos: "p-cashier", cc: "cc-47730", min: 4, max: 9 },
      { pos: "p-cash-bartender", cc: "cc-47730", min: 6, max: 12 },
      { pos: "p-grill-cook", cc: "cc-47730", min: 3, max: 6 },
      { pos: "p-line-cook", cc: "cc-47730", min: 2, max: 4 },
      { pos: "p-runner", cc: "cc-47730", min: 3, max: 6 },
    ],
    pick: [3, 5],
    scale: 0.55,
  },
  {
    venueId: "v-crisler",
    weekdays: [2, 4, 6],
    perWeek: 1,
    names: ["Michigan Basketball vs. Michigan State", "Michigan Basketball vs. Ohio State", "Michigan Volleyball", "Athletics Donor Reception"],
    times: [["16:00", "22:00"]],
    mix: [
      { pos: "p-banquet-server", cc: "cc-55102", min: 4, max: 10 },
      { pos: "p-suite-attendant", cc: "cc-55102", min: 2, max: 6 },
      { pos: "p-captain", cc: "cc-55102", min: 1, max: 1 },
      { pos: "p-cash-bartender", cc: "cc-55102", min: 2, max: 4 },
    ],
    pick: [2, 3],
    scale: 0.7,
  },
  {
    venueId: "v-nyu",
    weekdays: [],
    perWeek: 0,
    names: [],
    times: [],
    mix: [],
    pick: [0, 0],
    scale: 1,
    recurring: [
      { pos: "p-fsw", cc: "cc-30218", start: "06:30", end: "15:30", min: 3, max: 4 },
      { pos: "p-prep-cook", cc: "cc-30218", start: "06:00", end: "14:30", min: 2, max: 2 },
      { pos: "p-dishwasher", cc: "cc-30218", start: "11:00", end: "19:30", min: 1, max: 2 },
    ],
  },
  {
    venueId: "v-uww",
    weekdays: [4, 5, 6],
    perWeek: 1,
    names: ["Warhawks Football Tailgate", "Homecoming Catering", "Chancellor's Reception"],
    times: [["10:00", "16:00"]],
    mix: [
      { pos: "p-banquet-server", cc: "cc-58840", min: 4, max: 8 },
      { pos: "p-prep-cook", cc: "cc-58840", min: 2, max: 3 },
      { pos: "p-dishwasher", cc: "cc-58840", min: 1, max: 2 },
      { pos: "p-captain", cc: "cc-58840", min: 1, max: 1 },
    ],
    pick: [2, 4],
    scale: 0.8,
    reason: "Catering",
  },
  {
    venueId: "v-pace",
    weekdays: [3, 4],
    perWeek: 1,
    names: ["Catering · Admissions Open House", "Catering · Alumni Reception", "Catering · Athletics Banquet"],
    times: [["16:00", "21:00"]],
    mix: [
      { pos: "p-banquet-server", cc: "cc-30455", min: 3, max: 6 },
      { pos: "p-captain", cc: "cc-30455", min: 1, max: 1 },
      { pos: "p-dishwasher", cc: "cc-30455", min: 1, max: 2 },
    ],
    pick: [2, 3],
    scale: 1,
    reason: "Catering",
    recurring: [{ pos: "p-fsw", cc: "cc-30455", start: "10:30", end: "19:00", min: 2, max: 3 }],
  },
]

const PERSONA_VENUES = new Set(["v-wrigley", "v-soldier", "v-united"])

const METRO_COUNTS: Record<string, number> = {
  chicago: 124,
  phoenix: 24,
  louisville: 12,
  columbus: 14,
  detroit: 18,
  "ann-arbor": 10,
  nyc: 16,
  westchester: 9,
  whitewater: 10,
}

const SUPPLIER_MIX: Record<string, [string, number][]> = {
  chicago: [["s-instawork", 0.74], ["s-lakeshore", 0.19], ["s-summit", 0.07]],
  phoenix: [["s-instawork", 0.8], ["s-crescent", 0.2]],
  louisville: [["s-instawork", 0.75], ["s-crescent", 0.25]],
  columbus: [["s-instawork", 0.75], ["s-crescent", 0.25]],
  detroit: [["s-instawork", 0.7], ["s-crescent", 0.15], ["s-summit", 0.15]],
  "ann-arbor": [["s-instawork", 0.8], ["s-summit", 0.2]],
  nyc: [["s-instawork", 0.8], ["s-crescent", 0.2]],
  westchester: [["s-instawork", 0.85], ["s-crescent", 0.15]],
  whitewater: [["s-instawork", 0.65], ["s-summit", 0.35]],
}

const PROFILES: Record<string, { core: string[]; extra: string[] }> = {
  concessions: { core: ["p-concessions", "p-cashier"], extra: ["p-runner", "p-warehouse", "p-cash-bartender"] },
  bar: { core: ["p-cash-bartender", "p-barback"], extra: ["p-suite-bartender", "p-concessions", "p-cashier"] },
  service: { core: ["p-banquet-server", "p-suite-attendant"], extra: ["p-runner", "p-suite-bartender", "p-fsw"] },
  culinary: { core: ["p-line-cook", "p-grill-cook"], extra: ["p-prep-cook", "p-dishwasher"] },
  campus: { core: ["p-fsw", "p-prep-cook"], extra: ["p-dishwasher", "p-banquet-server", "p-cashier"] },
}

const CAMPUS_METROS = new Set(["nyc", "westchester", "whitewater"])

const ONBOARDING: [string, string][] = [
  ["background", "Background check"],
  ["i9", "I-9 & E-Verify"],
  ["conduct", "Compass Code of Conduct"],
  ["food-safety", "FlexForce food safety module"],
  ["harassment", "Harassment prevention training"],
]

const BLOCK_REASONS = [
  "Left assigned stand without notice during the 7th inning",
  "Repeated uniform violations after coaching",
  "Cash drawer variance on two consecutive events",
  "Guest complaint: unprofessional conduct",
  "No-call no-show twice in 30 days",
]

const AREA_CODES: Record<string, string> = {
  chicago: "312",
  phoenix: "602",
  louisville: "502",
  columbus: "614",
  detroit: "313",
  "ann-arbor": "734",
  nyc: "646",
  westchester: "914",
  whitewater: "262",
}

const TIP_POSITIONS = new Set([
  "p-cash-bartender",
  "p-suite-bartender",
  "p-concessions",
  "p-suite-attendant",
  "p-banquet-server",
  "p-barback",
])

function roundToNickel(value: number): number {
  return Math.round(value * 20) / 20
}

export function generateDemoData(nowInput: Date): DemoData {
  const now = new Date(nowInput)
  const today = startOfDay(now)
  const todayISO = toISODate(today)
  const rng = createRng(`mise:${todayISO}`)
  const thisWeek = weekStartOf(today)
  const cutover = addDays(thisWeek, -21)
  const cutoverISO = toISODate(cutover)
  const policies = { ...DEFAULT_POLICIES, autoApproveRequestsUnder: 12000 }
  const ids = makeIdFactory({
    request: 3712,
    shift: 1,
    timeEntry: 33018,
    tip: 1201,
    invoice: 10431,
    payment: 5521,
    change: 81,
    activity: 1,
    comment: 1,
    notification: 1,
  })

  const venueMap = new Map(VENUES.map((v) => [v.id, v]))
  const ccMap = new Map(COST_CENTERS.map((c) => [c.id, c]))
  const posMap = new Map(POSITIONS.map((p) => [p.id, p]))

  // Suppliers ---------------------------------------------------------------
  const coiDays: Record<string, number> = {
    "s-instawork": 240,
    "s-lakeshore": 18,
    "s-crescent": 160,
    "s-summit": -6,
  }
  const suppliers: Supplier[] = SUPPLIERS.map((s) => ({
    ...s,
    coiExpires: toISODate(addDays(today, coiDays[s.id] ?? 200)),
  }))
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]))

  // Rate cards --------------------------------------------------------------
  const rateCards: RateCardEntry[] = []
  for (const metro of METROS) {
    for (const pos of POSITIONS) {
      const pay = roundToNickel(BASE_PAY[pos.id] * metro.payMultiplier)
      rateCards.push({
        id: `rc-${pos.id.slice(2)}-${metro.id}`,
        positionId: pos.id,
        metro: metro.id,
        payRate: pay,
        markupPct: metro.markupPct,
        billRate: billFromPay(pay, metro.markupPct),
        effectiveFrom: toISODate(addDays(cutover, -rng.int(20, 200))),
        version: rng.int(1, 3),
        updatedBy: rng.pick(["Priya Raman", "Monument rate desk"]),
      })
    }
  }
  const rateFor = (positionId: string, metro: string) =>
    rateCards.find((r) => r.positionId === positionId && r.metro === metro)!

  // Workers -----------------------------------------------------------------
  const workers: Worker[] = []
  const usedNames = new Set<string>()
  let workerIndex = 0
  const expiry = (): ISODate => {
    const roll = rng.next()
    if (roll < 0.02) return toISODate(addDays(today, -rng.int(2, 40)))
    if (roll < 0.07) return toISODate(addDays(today, rng.int(3, 27)))
    return toISODate(addDays(today, rng.int(45, 900)))
  }
  for (const metro of METROS) {
    const count = METRO_COUNTS[metro.id] ?? 0
    for (let i = 0; i < count; i++) {
      let first = ""
      let last = ""
      for (let attempt = 0; attempt < 20; attempt++) {
        first = rng.pick(FIRST_NAMES)
        last = rng.pick(LAST_NAMES)
        if (!usedNames.has(`${first} ${last}`)) break
      }
      usedNames.add(`${first} ${last}`)
      const profileKey = rng.weighted<string>(
        CAMPUS_METROS.has(metro.id)
          ? [["campus", 0.45], ["service", 0.2], ["culinary", 0.2], ["concessions", 0.1], ["bar", 0.05]]
          : [["concessions", 0.3], ["bar", 0.2], ["service", 0.25], ["culinary", 0.2], ["campus", 0.05]]
      )
      const profile = PROFILES[profileKey]
      const positionIds = new Set(profile.core)
      for (const extra of profile.extra) if (rng.chance(0.35)) positionIds.add(extra)
      const isCaptain = profileKey === "service" && rng.chance(0.14)
      if (isCaptain) positionIds.add("p-captain")
      const certs: Certification[] = []
      const needsFood = [...positionIds].some((p) => posMap.get(p)?.requiredCerts.includes("Food Handler"))
      if (needsFood || rng.chance(0.5)) certs.push({ type: "Food Handler", expires: expiry(), verified: true })
      if ([...positionIds].some((p) => posMap.get(p)?.category === "Bar")) {
        certs.push({ type: alcoholCertFor(metro.state), expires: expiry(), verified: true })
      }
      if (isCaptain || (profileKey === "culinary" && rng.chance(0.25))) {
        certs.push({ type: "ServSafe Manager", expires: expiry(), verified: true })
      }
      if (rng.chance(0.3)) certs.push({ type: "Allergen Awareness", expires: expiry(), verified: true })
      const statusRoll = rng.next()
      const status = statusRoll < 0.04 ? "Onboarding" : statusRoll < 0.06 ? "Inactive" : "Active"
      const onboarding: OnboardingItem[] = ONBOARDING.map(([key, label], idx) => {
        const pending = status === "Onboarding" && idx >= ONBOARDING.length - rng.int(1, 2)
        return pending
          ? { key, label, status: "Pending" }
          : { key, label, status: "Complete", completedAt: toISODate(addDays(today, -rng.int(30, 700))) }
      })
      const hoursRoll = rng.next()
      const compassHours =
        hoursRoll < 0.05
          ? rng.int(336, 388)
          : hoursRoll < 0.065
            ? rng.int(390, 410)
            : Math.round(rng.float(4, 320) * (0.6 + rng.next() * 0.4))
      const supplierId = rng.weighted(SUPPLIER_MIX[metro.id])
      workers.push({
        id: `W-${10400 + workerIndex * 7 + rng.int(0, 6)}`,
        firstName: first,
        lastName: last,
        preferredName: PREFERRED_NAMES[first] && rng.chance(0.75) ? PREFERRED_NAMES[first] : undefined,
        supplierId,
        metro: metro.id,
        phone: `(${AREA_CODES[metro.id] ?? "312"}) 555-${String(rng.int(100, 9999)).padStart(4, "0")}`,
        email: `${first}.${last}${rng.int(1, 99)}`.toLowerCase().replace(/[^a-z0-9.]/g, "") + "@pros.example",
        positionIds: [...positionIds],
        rating: round2(Math.min(5, 4.25 + rng.next() ** 0.6 * 0.75)),
        reliability: round2(Math.min(1, 0.85 + rng.next() ** 0.5 * 0.15)),
        lifetimeShifts: rng.int(6, 420),
        compassHours,
        certs,
        onboarding,
        status,
        joinedAt: toISODate(addDays(today, -rng.int(120, 1500))),
        hue: rng.int(0, 359),
      })
      workerIndex++
    }
  }
  const workerMap = new Map(workers.map((w) => [w.id, w]))

  // Rosters -----------------------------------------------------------------
  const rosters: VenueRoster[] = VENUES.map((venue) => {
    const pool = workers
      .filter((w) => w.metro === venue.metro && w.status === "Active")
      .sort((a, b) => b.rating * b.reliability - a.rating * a.reliability)
    const favCount = PERSONA_VENUES.has(venue.id) ? 18 : 10
    const favorites = rng.sample(pool.slice(0, 40), favCount).map((w) => w.id)
    const rest = pool.filter((w) => !favorites.includes(w.id))
    const blockedCount = PERSONA_VENUES.has(venue.id) ? 2 : rng.int(0, 1)
    const cc = COST_CENTERS.find((c) => c.venueId === venue.id)
    const blocked = rng.sample(rest.slice(Math.floor(rest.length / 2)), blockedCount).map((w) => ({
      workerId: w.id,
      reason: rng.pick(BLOCK_REASONS),
      at: toLocal(addHours(addDays(today, -rng.int(8, 70)), rng.int(9, 18))),
      by: cc?.approverName ?? "Venue manager",
    }))
    return { venueId: venue.id, favorites, blocked }
  })

  // Requests & shifts ------------------------------------------------------
  const requests: StaffingRequest[] = []
  const shifts: Shift[] = []
  const eventKeys = new Set<string>()
  const pendingSeeds: { venueId: string; date: ISODate }[] = []

  const fillProbability = (date: ISODate) => {
    const diff = Math.round((parseLocal(date).getTime() - today.getTime()) / 86_400_000)
    if (diff < 0) return date < cutoverISO ? 0.93 : 0.975
    if (diff === 0) return 0.97
    if (diff <= 2) return 0.86
    if (diff <= 6) return 0.76
    if (diff <= 13) return 0.55
    return 0.32
  }

  const booked = new Map<ISODate, Set<string>>()
  const getBooked = (date: ISODate) => {
    let set = booked.get(date)
    if (!set) {
      set = new Set()
      booked.set(date, set)
    }
    return set
  }

  const suppliersFor = (venue: Venue, headcount: number, createdAt: Date): string[] => {
    const createdISO = toISODate(createdAt)
    const eligible = suppliers.filter(
      (s) => s.metros.includes(venue.metro) && (s.coiExpires >= createdISO || s.id === "s-instawork")
    )
    const out = ["s-instawork"]
    for (const s of eligible) {
      if (s.tier === 2 && (headcount >= 8 || rng.chance(0.35))) out.push(s.id)
      if (s.tier === 3 && rng.chance(0.2)) out.push(s.id)
    }
    return [...new Set(out)]
  }

  const createRequest = (args: {
    venue: Venue
    cc: CostCenter
    positionId: string
    dates: ISODate[]
    start: string
    end: string
    headcount: number
    eventName?: string
    reason: RequestReason
    forceState?: StaffingRequest["state"]
    createdBy?: string
    fillBias?: number
  }) => {
    const { venue, cc, positionId, dates, start, end, headcount } = args
    const position = posMap.get(positionId)!
    const rc = rateFor(positionId, venue.metro)
    const sortedDates = [...dates].sort()
    const firstStart = shiftWindow(sortedDates[0], start, end).start
    let createdAt = addHours(addDays(startOfDay(firstStart), -rng.int(2, 12)), rng.int(8, 18))
    if (createdAt >= now) createdAt = addMinutes(now, -rng.int(60, 60 * 30))
    if (createdAt >= firstStart) createdAt = addHours(firstStart, -rng.int(20, 60))
    const breakMinutes = defaultBreakMinutes(start, end)
    const draft = {
      dates: sortedDates,
      headcount,
      startTime: start,
      endTime: end,
      breakMinutes,
      billRate: rc.billRate,
    }
    const cost = estimateRequestCost(draft)
    const createdISO = toLocal(createdAt)
    const approvals: ApprovalStep[] = [
      {
        id: "budget",
        label: "Budget & policy check",
        approverName: "Mise policy engine",
        status: "Auto-approved",
        at: createdISO,
        note: `Within ${cc.code} weekly budget`,
      },
    ]
    const state: StaffingRequest["state"] = args.forceState ?? "active"
    if (cost > policies.autoApproveRequestsUnder) {
      if (state === "pending") {
        approvals.push({ id: "program", label: "Program approval", approverName: "Priya Raman", status: "Pending" })
      } else {
        approvals.push({
          id: "program",
          label: "Program approval",
          approverName: "Priya Raman",
          status: "Approved",
          at: toLocal(addMinutes(createdAt, rng.int(25, 240))),
        })
      }
    } else if (state === "pending") {
      approvals.push({ id: "program", label: "Program approval", approverName: "Priya Raman", status: "Pending" })
    }
    const req: StaffingRequest = {
      id: ids.id("request"),
      venueId: venue.id,
      costCenterId: cc.id,
      positionId,
      eventName: args.eventName,
      reason: args.reason,
      hireType: (positionId === "p-suite-bartender" || positionId === "p-captain") && rng.chance(0.4) ? "Select Hire" : "Quick Hire",
      dates: sortedDates,
      startTime: start,
      endTime: end,
      breakMinutes,
      headcount,
      payRate: rc.payRate,
      billRate: rc.billRate,
      duties: position.description,
      attire: cc.attire,
      checkIn: cc.checkIn,
      parking: cc.parkingNotes,
      favoritesFirst: cc.favoritesFirst,
      supplierIds: suppliersFor(venue, headcount, createdAt),
      requiredCerts: requiredCertsFor(position, venue),
      state,
      createdBy: args.createdBy ?? (PERSONA_VENUES.has(venue.id) && rng.chance(0.45) ? PERSONAS.venue.name : cc.approverName),
      createdAt: createdISO,
      approvals,
      source: sortedDates[0] < cutoverISO ? "Fieldglass import" : "Mise",
    }
    requests.push(req)

    // Shifts: multi-day postings keep the same Pro per slot (one work order per Pro).
    for (let slot = 1; slot <= headcount; slot++) {
      let assigned: Worker | undefined
      const slotShifts: Shift[] = sortedDates.map((date) => {
        const id = ids.id("shift")
        return { id, requestId: req.id, date, slot, status: state === "cancelled" ? "Cancelled" : "Open", fate: fateFor(id), jitter: jitterFor(id) }
      })
      if (state === "active") {
        const p = Math.min(0.995, fillProbability(sortedDates[0]) * (args.fillBias ?? 1))
        if (rng.chance(p)) {
          const unavailable = new Set<string>()
          for (const d of sortedDates) for (const w of getBooked(d)) unavailable.add(w)
          assigned = pickWorker({
            data: { workers, rosters, suppliers, policies },
            request: req,
            venue,
            position,
            booked: unavailable,
            today: toISODate(createdAt),
            rand: rng.next,
          })
        }
        if (assigned) {
          for (const s of slotShifts) {
            getBooked(s.date).add(assigned.id)
            const assignedAt = addMinutes(createdAt, rng.int(4, 60 * 30))
            const { start: shiftStart } = shiftWindow(s.date, start, end)
            const cap = shiftStart < now ? shiftStart : now
            s.workerId = assigned.id
            s.status = "Confirmed"
            s.assignedAt = toLocal(assignedAt < cap ? assignedAt : addMinutes(cap, -rng.int(30, 300)))
          }
        }
      }
      shifts.push(...slotShifts)
    }
    return req
  }

  const weekdayDate = (weekStart: Date, jsDay: number) => addDays(weekStart, (jsDay + 6) % 7)

  for (let w = -5; w <= 3; w++) {
    const weekStart = addDays(thisWeek, w * 7)
    for (const schedule of SCHEDULES) {
      const venue = venueMap.get(schedule.venueId)!
      if (schedule.perWeek > 0) {
        const days = rng.sample(schedule.weekdays, schedule.perWeek)
        for (const day of days) {
          const date = toISODate(weekdayDate(weekStart, day))
          const key = `${venue.id}|${date}`
          if (eventKeys.has(key)) continue
          eventKeys.add(key)
          const eventName = rng.pick(schedule.names)
          const [start, end] = rng.pick(schedule.times)
          const count = rng.int(schedule.pick[0], schedule.pick[1])
          for (const item of rng.sample(schedule.mix, count)) {
            createRequest({
              venue,
              cc: ccMap.get(item.cc)!,
              positionId: item.pos,
              dates: [date],
              start,
              end,
              headcount: Math.max(1, Math.round(rng.int(item.min, item.max) * schedule.scale)),
              eventName,
              reason: schedule.reason ?? "Event",
            })
          }
        }
      }
      for (const item of schedule.recurring ?? []) {
        const dates = [0, 1, 2, 3, 4].map((d) => toISODate(addDays(weekStart, d)))
        createRequest({
          venue,
          cc: ccMap.get(item.cc)!,
          positionId: item.pos,
          dates,
          start: item.start,
          end: item.end,
          headcount: rng.int(item.min, item.max),
          eventName: undefined,
          reason: "Recurring service",
        })
      }
    }
  }

  // Guaranteed live activity today at the venue persona's buildings.
  const forced: { venueId: string; name: string; start: string; end: string; mix: [string, string, number][] }[] = [
    {
      venueId: "v-wrigley",
      name: "Gallagher Way Fall Fest",
      start: "09:00",
      end: "16:30",
      mix: [["p-concessions", "cc-41820", 10], ["p-cash-bartender", "cc-41820", 6], ["p-grill-cook", "cc-41820", 3], ["p-cashier", "cc-41820", 4]],
    },
    {
      venueId: "v-united",
      name: "Bulls vs. Knicks",
      start: "16:30",
      end: "23:30",
      mix: [["p-concessions", "cc-38470", 12], ["p-cash-bartender", "cc-38470", 8], ["p-suite-attendant", "cc-38476", 8], ["p-banquet-server", "cc-38476", 6], ["p-grill-cook", "cc-38470", 3]],
    },
  ]
  for (const f of forced) {
    const key = `${f.venueId}|${todayISO}`
    if (eventKeys.has(key)) continue
    eventKeys.add(key)
    const venue = venueMap.get(f.venueId)!
    for (const [pos, cc, headcount] of f.mix) {
      createRequest({ venue, cc: ccMap.get(cc)!, positionId: pos, dates: [todayISO], start: f.start, end: f.end, headcount, eventName: f.name, reason: "Event" })
    }
  }

  // A thin, near-term United Center event that still needs Pros (drives "needs attention").
  const tomorrowISO = toISODate(addDays(today, 1))
  if (!eventKeys.has(`v-united|${tomorrowISO}`)) {
    eventKeys.add(`v-united|${tomorrowISO}`)
    const venue = venueMap.get("v-united")!
    for (const [pos, cc, headcount] of [
      ["p-concessions", "cc-38470", 14],
      ["p-cash-bartender", "cc-38470", 10],
      ["p-suite-attendant", "cc-38476", 8],
    ] as [string, string, number][]) {
      createRequest({ venue, cc: ccMap.get(cc)!, positionId: pos, dates: [tomorrowISO], start: "16:30", end: "23:30", headcount, eventName: "Blackhawks vs. Blues", reason: "Event", fillBias: 0.82 })
    }
  }

  // Requests waiting on program approval and a saved draft.
  const phoenix = venueMap.get("v-phoenix")!
  const raceDates = [5, 6, 7].map((d) => toISODate(addDays(thisWeek, 7 + d - 1)))
  createRequest({
    venue: phoenix,
    cc: ccMap.get("cc-71201")!,
    positionId: "p-concessions",
    dates: raceDates,
    start: "07:00",
    end: "17:00",
    headcount: 26,
    eventName: "NASCAR Cup Series Championship Weekend",
    reason: "Event",
    forceState: "pending",
    createdBy: "Monica Salazar",
  })
  const soldier = venueMap.get("v-soldier")!
  const concertDates = [5, 6].map((d) => toISODate(addDays(thisWeek, 14 + d - 1)))
  createRequest({
    venue: soldier,
    cc: ccMap.get("cc-52610")!,
    positionId: "p-concessions",
    dates: concertDates,
    start: "14:00",
    end: "23:30",
    headcount: 30,
    eventName: "Stadium Concert Weekend",
    reason: "Event",
    forceState: "pending",
    createdBy: PERSONAS.venue.name,
  })
  pendingSeeds.push({ venueId: "v-soldier", date: concertDates[0] })
  const wrigley = venueMap.get("v-wrigley")!
  createRequest({
    venue: wrigley,
    cc: ccMap.get("cc-41826")!,
    positionId: "p-suite-attendant",
    dates: [toISODate(addDays(thisWeek, 12))],
    start: "15:30",
    end: "22:30",
    headcount: 6,
    eventName: "Private Event · Catalina Club",
    reason: "Event",
    forceState: "draft",
    createdBy: PERSONAS.venue.name,
  })

  // Cancelled requests (with reasons) for realism.
  const cancellable = requests.filter((r) => r.state === "active" && r.dates[0] > todayISO && !PERSONA_VENUES.has(r.venueId))
  for (const r of rng.sample(cancellable, 2)) {
    r.state = "cancelled"
    r.cancelledReason = rng.pick(["Event postponed: weather", "Client reduced headcount", "Duplicate of an existing request"])
    for (const s of shifts) {
      if (s.requestId === r.id) {
        s.status = "Cancelled"
        s.workerId = undefined
        s.cancelledReason = r.cancelledReason
      }
    }
  }

  requests.sort((a, b) => a.id.localeCompare(b.id))

  let data: DemoData = {
    version: DATA_VERSION,
    seededFor: todayISO,
    cutoverDate: cutoverISO,
    venues: VENUES,
    costCenters: COST_CENTERS,
    positions: POSITIONS,
    rateCards,
    suppliers,
    workers,
    rosters,
    requests,
    shifts,
    timeEntries: [],
    tipBatches: [],
    invoices: [],
    payments: [],
    changeRequests: [],
    activities: [],
    comments: [],
    notifications: [],
    policies,
    counters: ids.counters,
  }

  // Replay the clock up to now: check-ins, check-outs, no-shows, captured time.
  data = advance(data, now, { seeding: true }).data
  const ids2 = makeIdFactory(data.counters)
  const reqMap = new Map(data.requests.map((r) => [r.id, r]))

  // Approvals history: slow pre-cutover (Fieldglass), fast after.
  const resolvedEntries: TimeEntry[] = data.timeEntries.map((entry) => {
    const req = reqMap.get(entry.requestId)!
    const cc = ccMap.get(req.costCenterId)!
    const { end: schedEnd } = shiftWindow(entry.date, req.startTime, req.endTime)
    const endRef = entry.clockOut ? parseLocal(entry.clockOut) : schedEnd
    const ageHours = differenceInHours(now, endRef)
    let e: TimeEntry = { ...entry }
    const resolve = (at: Date) => {
      if (e.anomalies.includes("missing_clockout")) {
        e = { ...e, clockOut: toLocal(schedEnd), adjustments: [...e.adjustments, { at: toLocal(at), by: cc.approverName, summary: `Clock-out set to ${formatClock(toLocal(schedEnd))} (scheduled end)`, reason: "Forgot to clock out" }] }
      }
      if (e.anomalies.includes("short_shift")) {
        e = { ...e, clockOut: e.clockIn, adjustments: [...e.adjustments, { at: toLocal(at), by: cc.approverName, summary: "Excluded: accidental clock-in tap", reason: "Other" }] }
      }
      if (e.anomalies.includes("long_break")) {
        e = { ...e, breakMinutes: req.breakMinutes, adjustments: [...e.adjustments, { at: toLocal(at), by: cc.approverName, summary: `Break corrected to ${req.breakMinutes} min`, reason: "Break correction" }] }
      }
      if (e.anomalies.includes("over_schedule") && e.clockOut) {
        e = { ...e, clockOut: toLocal(schedEnd), adjustments: [...e.adjustments, { at: toLocal(at), by: cc.approverName, summary: "Capped at scheduled end", reason: "Other" }] }
      }
      if (e.anomalies.includes("early_departure")) {
        e = { ...e, adjustments: [...e.adjustments, { at: toLocal(at), by: cc.approverName, summary: "Confirmed early release requested by venue", reason: "Sent home early" }] }
      }
      e = { ...e, anomalies: e.anomalies.filter((a) => a === "late_arrival" || a === "early_departure") }
    }
    if (entry.date < cutoverISO) {
      const at = addHours(endRef, rng.int(76, 190))
      if (at < now) {
        if (e.anomalies.length) resolve(addHours(at, -2))
        return { ...e, status: "Approved", approvedAt: toLocal(at), approvedBy: cc.approverName }
      }
      return e
    }
    if (ageHours > 72) {
      const at = addHours(endRef, rng.int(2, 20))
      if (e.anomalies.length) {
        resolve(at)
        return { ...e, status: "Approved", approvedAt: toLocal(at), approvedBy: cc.approverName }
      }
      return rng.chance(0.72)
        ? { ...e, status: "Approved", approvedAt: toLocal(at), approvedBy: cc.approverName }
        : { ...e, status: "Auto-approved", approvedAt: toLocal(addHours(endRef, policies.timesheetAutoApproveHours)), approvedBy: "Policy · 72h auto-approve" }
    }
    if (ageHours > 30 && e.anomalies.length === 0 && !PERSONA_VENUES.has(req.venueId) && rng.chance(0.6)) {
      const at = addHours(endRef, rng.int(2, 14))
      if (at < now) return { ...e, status: "Approved", approvedAt: toLocal(at), approvedBy: cc.approverName }
    }
    return { ...e, status: "Pending", approvedAt: undefined, approvedBy: undefined }
  })

  // A handful of open disputes on the venue persona's recent timesheets.
  const disputeCandidates = resolvedEntries.filter((e) => {
    const req = reqMap.get(e.requestId)!
    return PERSONA_VENUES.has(req.venueId) && e.status === "Pending" && e.anomalies.length === 0 && e.date < todayISO
  })
  const disputeReasons: { reason: NonNullable<TimeEntry["dispute"]>["reason"]; note: (e: TimeEntry) => string }[] = [
    {
      reason: "Name not recognized",
      note: (e) => {
        const w = workerMap.get(e.workerId)
        return `Sign-in sheet shows "${w?.preferredName ?? w?.firstName ?? ""} ${w?.lastName ?? ""}", please confirm this is the same Pro.`
      },
    },
    { reason: "Hours don't match sign-in", note: (e) => `Captain's sheet shows clock-out at ${formatClock(e.clockOut ? toLocal(addMinutes(parseLocal(e.clockOut), -45)) : undefined)}.` },
    { reason: "Worker swap", note: () => "A different Pro worked this stand per the stand lead. Please move the hours to the Pro who actually worked." },
  ]
  for (const [i, e] of rng.sample(disputeCandidates, 3).entries()) {
    const req = reqMap.get(e.requestId)!
    const cc = ccMap.get(req.costCenterId)!
    const idx = resolvedEntries.findIndex((x) => x.id === e.id)
    const d = disputeReasons[i % disputeReasons.length]
    resolvedEntries[idx] = {
      ...e,
      status: "Disputed",
      dispute: { reason: d.reason, note: d.note(e), by: cc.approverName, at: toLocal(addHours(parseLocal(e.clockOut ?? e.clockIn), rng.int(10, 20))) },
    }
  }

  let timeEntries = recomputeEntries(resolvedEntries, policies)

  // Tip batches --------------------------------------------------------------
  const tipBatches: TipBatch[] = []
  const eventDays = new Map<string, StaffingRequest[]>()
  for (const r of data.requests) {
    if (r.state !== "active" || !r.eventName || r.dates.length !== 1) continue
    const key = `${r.venueId}|${r.dates[0]}`
    const list = eventDays.get(key)
    if (list) list.push(r)
    else eventDays.set(key, [r])
  }
  const tipWindowStart = toISODate(addDays(thisWeek, -28))
  const recentPersonaEvents: string[] = []
  for (const [key, reqs] of [...eventDays.entries()].sort((a, b) => a[0].split("|")[1].localeCompare(b[0].split("|")[1]))) {
    const [venueId, date] = key.split("|")
    if (date < tipWindowStart || date >= todayISO) continue
    const tipsVenue = PERSONA_VENUES.has(venueId) || venueId === "v-phoenix" || venueId === "v-ford"
    if (!tipsVenue) continue
    const reqIds = new Set(reqs.map((r) => r.id))
    const lines = timeEntries
      .filter((e) => reqIds.has(e.requestId) && TIP_POSITIONS.has(reqMap.get(e.requestId)!.positionId) && e.regularHours + e.overtimeHours > 0)
      .filter(() => rng.chance(0.78))
      .map((e) => {
        const pos = reqMap.get(e.requestId)!.positionId
        const base = pos.includes("bartender") ? rng.float(45, 140) : pos === "p-suite-attendant" ? rng.float(30, 95) : rng.float(14, 60)
        return { workerId: e.workerId, amount: Math.round(base * 2) / 2, hours: round2(e.regularHours + e.overtimeHours) }
      })
    if (lines.length === 0) continue
    const venue = venueMap.get(venueId)!
    const cc = COST_CENTERS.find((c) => c.venueId === venueId)!
    const eventDate = parseLocal(date)
    tipBatches.push({
      id: ids2.id("tip"),
      venueId,
      costCenterId: cc.id,
      eventName: reqs[0].eventName ?? `${venue.shortName} event`,
      date,
      requestIds: [...reqIds],
      lines,
      status: "Approved",
      method: rng.pick(["Split by hours", "CSV upload", "Manual"] as const),
      createdBy: PERSONA_VENUES.has(venueId) ? PERSONAS.venue.name : cc.approverName,
      createdAt: toLocal(addHours(eventDate, 24 + rng.int(8, 12))),
      approvedBy: cc.approverName,
      approvedAt: toLocal(addHours(eventDate, 24 + rng.int(13, 30))),
    })
    if (PERSONA_VENUES.has(venueId) && date >= toISODate(addDays(thisWeek, -7))) recentPersonaEvents.push(tipBatches[tipBatches.length - 1].id)
  }
  // The most recent persona events: one draft (yesterday-ish) and the rest waiting for approval.
  recentPersonaEvents.forEach((id, i) => {
    const batch = tipBatches.find((b) => b.id === id)!
    const isLast = i === recentPersonaEvents.length - 1
    const daysAgo = Math.round((today.getTime() - parseLocal(batch.date).getTime()) / 86_400_000)
    if (isLast && daysAgo <= 2) {
      batch.status = "Draft"
      batch.createdAt = toLocal(addMinutes(today, 8 * 60 + 12))
      batch.approvedAt = undefined
      batch.approvedBy = undefined
    } else if (i % 2 === 1 || i === recentPersonaEvents.length - 2) {
      batch.status = "Pending approval"
      batch.approvedAt = undefined
      batch.approvedBy = undefined
    }
  })

  // Invoices & payments --------------------------------------------------------
  const invoices: Invoice[] = []
  const payments: Payment[] = []
  const invoicedEntry = new Map<string, string>()
  const tipInvoiced = new Map<string, string>()
  for (let w = -5; w <= -1; w++) {
    const periodStart = addDays(thisWeek, w * 7)
    const periodEnd = addDays(periodStart, 6)
    const issuedAt = addHours(addDays(periodStart, 7), 6)
    if (issuedAt > now) continue
    const periodEndISO = toISODate(periodEnd)
    for (const supplier of suppliers) {
      for (const venue of VENUES) {
        const entries = timeEntries.filter((e) => {
          if (invoicedEntry.has(e.id)) return false
          if (e.status !== "Approved" && e.status !== "Auto-approved") return false
          if (!e.approvedAt || parseLocal(e.approvedAt) > issuedAt) return false
          if (e.date > periodEndISO) return false
          const req = reqMap.get(e.requestId)!
          return req.venueId === venue.id && workerMap.get(e.workerId)?.supplierId === supplier.id
        })
        const tips = tipBatches.filter(
          (b) =>
            b.venueId === venue.id &&
            b.status === "Approved" &&
            !!b.approvedAt &&
            parseLocal(b.approvedAt) <= issuedAt &&
            !tipInvoiced.has(`${b.id}|${supplier.id}`) &&
            b.lines.some((l) => workerMap.get(l.workerId)?.supplierId === supplier.id)
        )
        if (entries.length === 0 && tips.length === 0) continue
        const id = ids2.id("invoice")
        const lines: InvoiceLine[] = []
        const groups = new Map<string, TimeEntry[]>()
        for (const e of entries) {
          const key = `${e.requestId}|${e.date}`
          const g = groups.get(key)
          if (g) g.push(e)
          else groups.set(key, [e])
        }
        let lineNo = 1
        for (const [key, group] of [...groups.entries()].sort((a, b) => a[0].split("|")[1].localeCompare(b[0].split("|")[1]))) {
          const [requestId, date] = key.split("|")
          const req = reqMap.get(requestId)!
          const pos = posMap.get(req.positionId)!
          const reg = round2(group.reduce((s, e) => s + e.regularHours, 0))
          const ot = round2(group.reduce((s, e) => s + e.overtimeHours, 0))
          const label = `${pos.title} · ${req.eventName ?? "Dining service"} · ${formatDate(date, "MMM d")}`
          if (reg > 0) {
            lines.push({ id: `${id}-${lineNo++}`, kind: "labor", description: label, requestId, positionId: pos.id, costCenterId: req.costCenterId, date, timeEntryIds: group.map((e) => e.id), quantity: reg, rate: req.billRate, amount: round2(reg * req.billRate) })
          }
          if (ot > 0) {
            lines.push({ id: `${id}-${lineNo++}`, kind: "overtime", description: `${label} · overtime`, requestId, positionId: pos.id, costCenterId: req.costCenterId, date, timeEntryIds: group.filter((e) => e.overtimeHours > 0).map((e) => e.id), quantity: ot, rate: round2(req.billRate * policies.overtimeMultiplier), amount: round2(ot * req.billRate * policies.overtimeMultiplier) })
          }
          if (reg === 0 && ot === 0) {
            lines.push({ id: `${id}-${lineNo++}`, kind: "labor", description: `${label} · zero-hour (excluded)`, requestId, positionId: pos.id, costCenterId: req.costCenterId, date, timeEntryIds: group.map((e) => e.id), quantity: 0, rate: req.billRate, amount: 0 })
          }
          for (const e of group) invoicedEntry.set(e.id, id)
        }
        for (const b of tips) {
          const mine = b.lines.filter((l) => workerMap.get(l.workerId)?.supplierId === supplier.id)
          const amount = round2(mine.reduce((s, l) => s + l.amount, 0))
          lines.push({ id: `${id}-${lineNo++}`, kind: "tips", description: `Tips · ${b.eventName} · ${formatDate(b.date, "MMM d")}`, costCenterId: b.costCenterId, date: b.date, timeEntryIds: [], tipBatchId: b.id, quantity: mine.length, rate: 0, amount })
          tipInvoiced.set(`${b.id}|${supplier.id}`, id)
          if (!b.invoiceId) b.invoiceId = id
        }
        const cc = COST_CENTERS.find((c) => c.venueId === venue.id)!
        const status: Invoice["status"] = w <= -3 ? "Paid" : w === -2 ? "Approved" : "Pending approval"
        invoices.push({
          id,
          supplierId: supplier.id,
          venueId: venue.id,
          periodStart: toISODate(periodStart),
          periodEnd: periodEndISO,
          lines,
          status,
          issuedAt: toLocal(issuedAt),
          dueDate: toISODate(addDays(issuedAt, 30)),
          approvedBy: status === "Pending approval" ? undefined : cc.approverName,
          approvedAt: status === "Pending approval" ? undefined : toLocal(addHours(issuedAt, rng.int(4, 40))),
          disputes: [],
          poNumber: `4500${rng.int(100000, 999999)}`,
        })
      }
    }
  }

  // One disputed invoice line for the persona to resolve.
  const disputeTarget =
    invoices.find((i) => i.status === "Approved" && i.venueId === "v-united" && i.supplierId === "s-lakeshore") ??
    invoices.find((i) => i.status === "Approved" && PERSONA_VENUES.has(i.venueId))
  if (disputeTarget) {
    const line = disputeTarget.lines.find((l) => l.kind === "labor" && l.quantity > 10)
    if (line) {
      disputeTarget.status = "Disputed"
      disputeTarget.disputes.push({
        id: "d1",
        lineId: line.id,
        reason: "Hours exceed scheduled headcount",
        note: "Billed hours look high for this stand, we scheduled fewer Pros than the hours imply. Please share the clock-in detail.",
        by: venueMap.get(disputeTarget.venueId)?.id === "v-united" ? "Alicia Park" : PERSONAS.venue.name,
        at: toLocal(addHours(parseLocal(disputeTarget.issuedAt), 30)),
        status: "Open",
      })
    }
  }

  // Payment runs every Friday after approval.
  const payGroups = new Map<string, Invoice[]>()
  for (const inv of invoices) {
    if (inv.status !== "Paid" && inv.status !== "Approved") continue
    const key = `${inv.supplierId}|${inv.periodStart}`
    const g = payGroups.get(key)
    if (g) g.push(inv)
    else payGroups.set(key, [inv])
  }
  for (const [key, group] of payGroups) {
    const [supplierId, periodStart] = key.split("|")
    const payDate = addDays(parseLocal(periodStart), 7 + 11)
    const payISO = toISODate(payDate)
    const amount = round2(group.reduce((s, inv) => s + invoiceTotals(inv, policies.msaFeePct).netToSupplier, 0))
    const isPaid = group[0].status === "Paid"
    const id = ids2.id("payment")
    payments.push({
      id,
      supplierId,
      amount,
      date: payISO,
      method: supplierId === "s-instawork" ? "ACH" : rng.pick(["ACH", "Virtual card"] as const),
      reference: `ACH-${rng.int(10000000, 99999999)}`,
      invoiceIds: group.map((i) => i.id),
      status: isPaid ? "Settled" : payISO <= todayISO ? "Processing" : "Scheduled",
    })
    if (isPaid) {
      for (const inv of group) {
        inv.paidAt = toLocal(addHours(payDate, 10))
        inv.paymentId = id
      }
    }
  }
  for (const b of tipBatches) {
    if (!b.invoiceId) continue
    const inv = invoices.find((i) => i.id === b.invoiceId)
    if (inv?.status === "Paid") b.status = "Paid"
  }

  timeEntries = timeEntries.map((e) => {
    const inv = invoicedEntry.get(e.id)
    return inv ? { ...e, status: "Invoiced", invoiceId: inv } : e
  })

  // Change requests -----------------------------------------------------------
  const changeRequests: ChangeRequest[] = []
  const futurePersona = data.requests
    .filter((r) => r.state === "active" && r.dates[0] > todayISO && PERSONA_VENUES.has(r.venueId))
    .sort((a, b) => a.dates[0].localeCompare(b.dates[0]))
  const bigServer =
    futurePersona.find((r) => r.venueId === "v-soldier" && r.positionId === "p-banquet-server") ??
    futurePersona.find((r) => r.positionId === "p-banquet-server") ??
    futurePersona[0]
  if (bigServer) {
    const delta = Math.max(6, Math.round(bigServer.headcount * 0.6))
    changeRequests.push({
      id: ids2.id("change"),
      type: "Headcount increase",
      requestId: bigServer.id,
      venueId: bigServer.venueId,
      positionId: bigServer.positionId,
      requestedBy: PERSONAS.venue.name,
      requestedByPersona: "venue",
      createdAt: toLocal(addMinutes(now, -95)),
      status: "Pending",
      delta,
      summary: `Add ${delta} ${posMap.get(bigServer.positionId)?.title ?? "Pros"} to ${bigServer.id}`,
      detail: "Club level sold out, opening two additional buffet lines on the 200 level. Exceeds the 25% auto-approve threshold.",
    })
  }
  const bartenderRate = rateFor("p-cash-bartender", "chicago")
  changeRequests.push({
    id: ids2.id("change"),
    type: "Rate revision",
    rateCardId: bartenderRate.id,
    positionId: "p-cash-bartender",
    requestedBy: PERSONAS.supplier.name,
    requestedByPersona: "supplier",
    createdAt: toLocal(addHours(now, -20)),
    status: "Pending",
    newRate: round2(bartenderRate.payRate + 1),
    summary: `Raise Cash Bartender (Chicago) pay to $${(bartenderRate.payRate + 1).toFixed(2)}/hr`,
    detail: "Chicago bartender market rate has moved above $21.50. Our 14-day fill rate for Cash Bartender slipped to 91% and Pros are choosing competing events.",
  })
  const grill = futurePersona.find((r) => r.positionId === "p-grill-cook")
  if (grill) {
    changeRequests.push({
      id: ids2.id("change"),
      type: "Headcount increase",
      requestId: grill.id,
      venueId: grill.venueId,
      positionId: grill.positionId,
      requestedBy: "Tasha Greene",
      requestedByPersona: "venue",
      createdAt: toLocal(addHours(now, -44)),
      status: "Auto-approved",
      delta: 1,
      summary: `Add 1 Grill Cook to ${grill.id}`,
      detail: "Second flat-top opening at the Bleacher Bar stand.",
      decidedBy: "Policy · ≤25% headcount increase",
      decidedAt: toLocal(addHours(now, -44)),
    })
  }
  const unitedTime = futurePersona.find((r) => r.venueId === "v-united")
  if (unitedTime) {
    changeRequests.push({
      id: ids2.id("change"),
      type: "Time change",
      requestId: unitedTime.id,
      venueId: unitedTime.venueId,
      positionId: unitedTime.positionId,
      requestedBy: "Alicia Park",
      requestedByPersona: "venue",
      createdAt: toLocal(addHours(now, -30)),
      status: "Auto-approved",
      summary: `Notify Pros: doors open 30 minutes early for ${unitedTime.id}`,
      detail: "Arena doors moved earlier for a pre-game ceremony. Pros were notified in-app; no change to paid hours.",
      decidedBy: "Policy · notification only",
      decidedAt: toLocal(addHours(now, -30)),
    })
  }
  const lakeshoreRate = rateFor("p-concessions", "chicago")
  changeRequests.push({
    id: ids2.id("change"),
    type: "Rate revision",
    rateCardId: lakeshoreRate.id,
    positionId: "p-concessions",
    requestedBy: "Dana Whitaker",
    requestedByPersona: "supplier",
    createdAt: toLocal(addDays(now, -6)),
    status: "Declined",
    newRate: round2(lakeshoreRate.payRate + 2.5),
    summary: `Raise Concessions Worker (Chicago) pay to $${(lakeshoreRate.payRate + 2.5).toFixed(2)}/hr`,
    detail: "Requested by Lakeshore Event Staffing for weekend events.",
    decidedBy: "Priya Raman",
    decidedAt: toLocal(addDays(now, -5)),
  })
  const nyu = data.requests.find((r) => r.venueId === "v-nyu" && r.dates[0] > todayISO)
  if (nyu) {
    changeRequests.push({
      id: ids2.id("change"),
      type: "Date extension",
      requestId: nyu.id,
      venueId: nyu.venueId,
      positionId: nyu.positionId,
      requestedBy: "Rachel Kim",
      requestedByPersona: "venue",
      createdAt: toLocal(addHours(now, -6)),
      status: "Pending",
      summary: `Extend ${nyu.id} by one week`,
      detail: "Midterm catering volume: keep the same Pros through the following week.",
    })
  }

  // Comments --------------------------------------------------------------
  const comments: Comment[] = []
  const commentTargets = futurePersona.slice(0, 6)
  const commentScript: { author: string; persona: PersonaId; body: string; offset: number }[][] = [
    [
      { author: PERSONAS.venue.name, persona: "venue", body: "Heads up: the staff entrance line gets long after 3. Please have Pros arrive 20 minutes before call time for line-up.", offset: -26 },
      { author: PERSONAS.supplier.name, persona: "supplier", body: "Got it. We added the arrival note to every Pro's shift briefing and most of this crew are returning Pros.", offset: -25 },
    ],
    [{ author: "Tasha Greene", persona: "venue", body: "Bartenders must carry their BASSET card, CPD compliance checks are happening this month.", offset: -18 }],
    [
      { author: PERSONAS.supplier.name, persona: "supplier", body: "Two Pros asked about parking, confirming staff use the validated garage?", offset: -12 },
      { author: PERSONAS.venue.name, persona: "venue", body: "Yes: validation at the host stand on the way out.", offset: -11 },
    ],
  ]
  commentTargets.slice(0, commentScript.length).forEach((req, i) => {
    for (const c of commentScript[i]) {
      comments.push({ id: ids2.id("comment"), requestId: req.id, author: c.author, authorPersona: c.persona, at: toLocal(addHours(now, c.offset)), body: c.body })
    }
  })

  // Activity history (recent) ----------------------------------------------------
  const activities: Activity[] = [...data.activities]
  const recentFrom = addDays(today, -4)
  const shiftsByReq = new Map<string, Shift[]>()
  for (const s of data.shifts) {
    const list = shiftsByReq.get(s.requestId)
    if (list) list.push(s)
    else shiftsByReq.set(s.requestId, [s])
  }
  for (const r of data.requests) {
    const pos = posMap.get(r.positionId)!
    const venue = venueMap.get(r.venueId)!
    const created = parseLocal(r.createdAt)
    if (created >= recentFrom) {
      activities.push({ id: ids2.id("activity"), at: r.createdAt, actor: r.createdBy, kind: "request", text: `${r.createdBy} posted ${r.id} · ${r.headcount} × ${pos.title} at ${venue.shortName}`, requestId: r.id, venueId: r.venueId })
      const program = r.approvals.find((a) => a.id === "program" && a.status === "Approved")
      if (program?.at) activities.push({ id: ids2.id("activity"), at: program.at, actor: "Priya Raman", kind: "approval", text: `Priya Raman approved ${r.id} (program review)`, requestId: r.id, venueId: r.venueId })
    }
    if (r.state !== "active") continue
    const mine = (shiftsByReq.get(r.id) ?? []).filter((s) => !s.backfillFor && s.status !== "Cancelled")
    if (mine.length === 0 || mine.some((s) => !s.workerId)) continue
    const lastAssigned = mine.map((s) => s.assignedAt ?? "").sort().pop()
    if (!lastAssigned || parseLocal(lastAssigned) < recentFrom || parseLocal(lastAssigned) > now) continue
    activities.push({ id: ids2.id("activity"), at: lastAssigned, actor: "Mise", kind: "fill", text: `${r.id} fully staffed · ${mine.length} ${pos.title} ${mine.length === 1 ? "Pro" : "Pros"} confirmed for ${r.eventName ?? venue.shortName}`, requestId: r.id, venueId: r.venueId })
  }
  const approvalGroups = new Map<string, { at: string; by: string; requestId: string; count: number }>()
  for (const e of timeEntries) {
    if (e.status === "Pending" || e.status === "Disputed" || !e.approvedAt || !e.approvedBy || e.approvedBy.startsWith("Policy")) continue
    if (parseLocal(e.approvedAt) < recentFrom) continue
    const key = `${e.approvedBy}|${e.requestId}`
    const g = approvalGroups.get(key)
    if (g) {
      g.count++
      if (e.approvedAt > g.at) g.at = e.approvedAt
    } else approvalGroups.set(key, { at: e.approvedAt, by: e.approvedBy, requestId: e.requestId, count: 1 })
  }
  for (const g of approvalGroups.values()) {
    const req = reqMap.get(g.requestId)!
    activities.push({ id: ids2.id("activity"), at: g.at, actor: g.by, kind: "timesheet", text: `${g.by} approved ${g.count} ${g.count === 1 ? "timesheet" : "timesheets"} · ${posMap.get(req.positionId)?.title} · ${req.eventName ?? venueMap.get(req.venueId)?.shortName}`, requestId: req.id, venueId: req.venueId })
  }
  for (const b of tipBatches) {
    if (!b.approvedAt || !b.approvedBy || parseLocal(b.approvedAt) < recentFrom) continue
    activities.push({ id: ids2.id("activity"), at: b.approvedAt, actor: b.approvedBy, kind: "tips", text: `${b.approvedBy} approved tips for ${b.eventName} · ${b.lines.length} Pros`, venueId: b.venueId })
  }
  for (const b of tipBatches.filter((t) => t.status === "Pending approval" || t.status === "Draft")) {
    activities.push({ id: ids2.id("activity"), at: b.createdAt, actor: b.createdBy, kind: "tips", text: `${b.createdBy} ${b.status === "Draft" ? "started" : "submitted"} tips for ${b.eventName}`, venueId: b.venueId })
  }
  for (const inv of invoices.filter((i) => i.status === "Pending approval")) {
    activities.push({ id: ids2.id("activity"), at: inv.issuedAt, actor: "Mise", kind: "invoice", text: `Weekly invoice ${inv.id} issued · ${supplierMap.get(inv.supplierId)?.shortName} · ${venueMap.get(inv.venueId)?.shortName}`, invoiceId: inv.id, venueId: inv.venueId })
  }
  for (const p of payments.filter((x) => x.status === "Settled")) {
    activities.push({ id: ids2.id("activity"), at: `${p.date}T10:00`, actor: "Compass AP", kind: "payment", text: `Payment ${p.id} settled to ${supplierMap.get(p.supplierId)?.shortName}` })
  }
  activities.push({ id: ids2.id("activity"), at: toLocal(addDays(now, -3)), actor: "Priya Raman", kind: "rate", text: "Priya Raman published rate card v3 for Banquet Captain (Chicago)" })
  activities.push({ id: ids2.id("activity"), at: toLocal(addDays(now, -9)), actor: "Priya Raman", kind: "policy", text: "Priya Raman set timesheet auto-approval to 72 hours" })
  activities.sort((a, b) => a.at.localeCompare(b.at))

  // Notifications ----------------------------------------------------------------
  const notifications: AppNotification[] = []
  const pendingPersona = timeEntries.filter((e) => e.status === "Pending" && PERSONA_VENUES.has(reqMap.get(e.requestId)!.venueId))
  const notify = (n: Omit<AppNotification, "id" | "read">, read = false) =>
    notifications.push({ id: ids2.id("notification"), read, ...n })
  const pendingInvoice = invoices.find((i) => i.status === "Pending approval" && PERSONA_VENUES.has(i.venueId))
  const draftTips = tipBatches.find((b) => b.status === "Draft")
  const pendingReq = data.requests.find((r) => r.state === "pending")
  const nearCap = workers.filter((w) => w.metro === "chicago" && w.compassHours >= 336 && w.compassHours < 390)[0]
  const thin = data.requests.find((r) => r.venueId === "v-united" && r.dates[0] === tomorrowISO)
  if (pendingPersona.length) notify({ at: toLocal(addMinutes(now, -42)), title: `${pendingPersona.length} timesheets ready for review`, body: "Hours from your recent events are captured and checked. Clean entries auto-approve in 72 hours.", href: "/timesheets", kind: "timesheet", personas: ["venue"] })
  if (thin) notify({ at: toLocal(addMinutes(now, -70)), title: `${thin.eventName} still has open shifts`, body: "Tomorrow's event is short a few Pros. Mise has widened distribution to Tier 2 suppliers.", href: `/requests/${thin.id}`, kind: "fill", personas: ["venue", "supplier"] })
  if (draftTips) notify({ at: draftTips.createdAt, title: "Tip batch saved as draft", body: `${draftTips.eventName} · ${draftTips.lines.length} Pros. Submit when your captain confirms the pool.`, href: "/tips", kind: "tips", personas: ["venue"] })
  if (pendingInvoice) notify({ at: pendingInvoice.issuedAt, title: `Invoice ${pendingInvoice.id} ready for review`, body: "Every line traces to an approved timesheet. Review and approve to schedule payment.", href: `/invoices/${pendingInvoice.id}`, kind: "invoice", personas: ["venue", "program"] })
  if (nearCap) notify({ at: toLocal(addHours(now, -5)), title: `${workerName(nearCap)} is nearing the contractual cap`, body: `${nearCap.compassHours} of ${policies.contractualHoursCap} hours. Consider a conversion conversation.`, href: `/workforce/${nearCap.id}`, kind: "roster", personas: ["venue", "program"] }, true)
  if (changeRequests[0]) notify({ at: changeRequests[0].createdAt, title: "Headcount increase needs approval", body: changeRequests[0].summary, href: "/inbox", kind: "change", personas: ["program"] })
  notify({ at: toLocal(addHours(now, -20)), title: "Rate revision requested by Instawork", body: "Cash Bartender · Chicago · +$1.00/hr pay", href: "/inbox", kind: "rate", personas: ["program"] })
  if (pendingReq) notify({ at: pendingReq.createdAt, title: `${pendingReq.id} needs program approval`, body: `${pendingReq.eventName ?? "Request"} exceeds the $${policies.autoApproveRequestsUnder.toLocaleString()} auto-approve limit.`, href: `/requests/${pendingReq.id}`, kind: "approval", personas: ["program"] })
  notify({ at: toLocal(addDays(now, -1)), title: "Summit Workforce Solutions paused", body: "Certificate of insurance expired. Summit is excluded from new distribution until a renewed COI is uploaded.", href: "/suppliers", kind: "alert", personas: ["program"] }, true)
  notify({ at: toLocal(addDays(now, -2)), title: "Lakeshore COI expires in 18 days", body: "Mise sent an automatic renewal reminder to Dana Whitaker.", href: "/suppliers", kind: "alert", personas: ["program"] }, true)
  const newest = [...data.requests].filter((r) => r.state === "active").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (newest) notify({ at: newest.createdAt, title: `New request ${newest.id}`, body: `${newest.headcount} × ${posMap.get(newest.positionId)?.title} · ${venueMap.get(newest.venueId)?.shortName} · ${formatDate(newest.dates[0])}`, href: `/requests/${newest.id}`, kind: "request", personas: ["supplier"] })
  const settled = payments.filter((p) => p.supplierId === "s-instawork" && p.status === "Settled").sort((a, b) => b.date.localeCompare(a.date))[0]
  if (settled) notify({ at: `${settled.date}T10:05`, title: `Payment ${settled.id} settled`, body: `$${settled.amount.toLocaleString()} via ACH covering ${settled.invoiceIds.length} invoices.`, href: "/invoices?tab=payments", kind: "payment", personas: ["supplier"] }, true)
  const disputed = timeEntries.find((e) => e.status === "Disputed")
  if (disputed) notify({ at: disputed.dispute!.at, title: `Timesheet ${disputed.id} disputed`, body: `${disputed.dispute!.reason}, ${workerName(workerMap.get(disputed.workerId))}`, href: "/timesheets?tab=disputed", kind: "timesheet", personas: ["supplier", "venue"] })
  notifications.sort((a, b) => b.at.localeCompare(a.at))

  return {
    ...data,
    timeEntries,
    tipBatches,
    invoices,
    payments,
    changeRequests,
    comments,
    activities: activities.slice(-900),
    notifications,
    counters: ids2.counters,
  }
}
