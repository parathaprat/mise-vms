import type {
  Activity,
  AppNotification,
  ChangeRequest,
  Comment,
  CostCenter,
  Invoice,
  ISODate,
  Payment,
  Policies,
  Position,
  RateCardEntry,
  Shift,
  StaffingRequest,
  Supplier,
  TimeEntry,
  TipBatch,
  Venue,
  VenueRoster,
  Worker,
} from "@/lib/types"

export const DATA_VERSION = 4

export type CounterKey =
  | "request"
  | "shift"
  | "timeEntry"
  | "tip"
  | "invoice"
  | "payment"
  | "change"
  | "activity"
  | "comment"
  | "notification"

export interface DemoData {
  version: number
  seededFor: ISODate
  cutoverDate: ISODate
  venues: Venue[]
  costCenters: CostCenter[]
  positions: Position[]
  rateCards: RateCardEntry[]
  suppliers: Supplier[]
  workers: Worker[]
  rosters: VenueRoster[]
  requests: StaffingRequest[]
  shifts: Shift[]
  timeEntries: TimeEntry[]
  tipBatches: TipBatch[]
  invoices: Invoice[]
  payments: Payment[]
  changeRequests: ChangeRequest[]
  activities: Activity[]
  comments: Comment[]
  notifications: AppNotification[]
  policies: Policies
  counters: Record<CounterKey, number>
}

export const ID_PREFIX: Record<CounterKey, string> = {
  request: "JP-",
  shift: "SH-",
  timeEntry: "TS-",
  tip: "TB-",
  invoice: "INV-",
  payment: "PMT-",
  change: "CR-",
  activity: "AC-",
  comment: "CM-",
  notification: "NT-",
}

/** Allocates sequential, human-readable IDs (JP-3912, TS-33410, …). */
export function makeIdFactory(counters: Record<CounterKey, number>) {
  const next = { ...counters }
  const id = (key: CounterKey) => {
    const value = next[key]
    next[key] = value + 1
    return `${ID_PREFIX[key]}${value}`
  }
  return { id, counters: next }
}
