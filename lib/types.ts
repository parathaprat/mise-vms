export type ISODate = string
export type LocalDateTime = string

export type PersonaId = "venue" | "program" | "supplier"

export type Brand =
  | "Levy"
  | "Chartwells"
  | "Restaurant Associates"
  | "Bon Appétit"
  | "Eurest"

export type VenueType =
  | "Ballpark"
  | "Stadium"
  | "Arena"
  | "Raceway"
  | "Campus"
  | "Corporate"

export interface Venue {
  id: string
  name: string
  shortName: string
  brand: Brand
  type: VenueType
  city: string
  state: string
  metro: string
  address: string
  hue: number
}

export type ParkingKind = "Free" | "Paid" | "Validated" | "None"

export interface CostCenter {
  id: string
  code: string
  venueId: string
  name: string
  glCode: string
  weeklyBudget: number
  approverName: string
  checkIn: string
  parking: ParkingKind
  parkingNotes: string
  attire: string
  favoritesFirst: boolean
  active: boolean
}

export type PositionCategory =
  | "Culinary"
  | "Concessions"
  | "Bar"
  | "Service"
  | "Leadership"
  | "Support"

export type CertType =
  | "Food Handler"
  | "ServSafe Manager"
  | "BASSET"
  | "TIPS"
  | "Allergen Awareness"

export interface Position {
  id: string
  title: string
  category: PositionCategory
  description: string
  requiredCerts: CertType[]
  aliases: string[]
}

export interface RateCardEntry {
  id: string
  positionId: string
  metro: string
  payRate: number
  markupPct: number
  billRate: number
  effectiveFrom: ISODate
  version: number
  updatedBy: string
}

export interface Supplier {
  id: string
  name: string
  shortName: string
  tier: 1 | 2 | 3
  kind: "Marketplace" | "Agency"
  hq: string
  contactName: string
  contactEmail: string
  metros: string[]
  coiExpires: ISODate
  msaSigned: boolean
  w2: boolean
  hue: number
  active: boolean
}

export type WorkerStatus = "Active" | "Onboarding" | "Inactive"

export interface Certification {
  type: CertType
  expires: ISODate
  verified: boolean
}

export interface OnboardingItem {
  key: string
  label: string
  status: "Complete" | "Pending"
  completedAt?: ISODate
  expiresAt?: ISODate
}

export interface Worker {
  id: string
  firstName: string
  lastName: string
  preferredName?: string
  supplierId: string
  metro: string
  phone: string
  email: string
  positionIds: string[]
  rating: number
  reliability: number
  lifetimeShifts: number
  compassHours: number
  certs: Certification[]
  onboarding: OnboardingItem[]
  status: WorkerStatus
  joinedAt: ISODate
  hue: number
}

export interface BlockedWorker {
  workerId: string
  reason: string
  at: LocalDateTime
  by: string
}

export interface VenueRoster {
  venueId: string
  favorites: string[]
  blocked: BlockedWorker[]
}

export type HireType = "Quick Hire" | "Select Hire"

export type RequestReason =
  | "Event"
  | "Call-out coverage"
  | "Seasonal peak"
  | "Catering"
  | "Recurring service"

export type RequestState = "draft" | "pending" | "active" | "cancelled"

export type RequestStatus =
  | "Draft"
  | "Pending approval"
  | "Open"
  | "Filled"
  | "In progress"
  | "Completed"
  | "Cancelled"

export interface ApprovalStep {
  id: string
  label: string
  approverName: string
  status: "Approved" | "Auto-approved" | "Pending" | "Rejected"
  at?: LocalDateTime
  note?: string
}

export interface AgencyAward {
  supplierId: string
  offeredRate: number
  score: number
  reason: string
  awardedAt: LocalDateTime
}

export interface StaffingRequest {
  id: string
  venueId: string
  costCenterId: string
  positionId: string
  eventName?: string
  reason: RequestReason
  hireType: HireType
  dates: ISODate[]
  startTime: string
  endTime: string
  breakMinutes: number
  headcount: number
  payRate: number
  billRate: number
  duties: string
  attire: string
  checkIn: string
  parking: string
  notes?: string
  favoritesFirst: boolean
  supplierIds: string[]
  agencyAward?: AgencyAward
  requiredCerts: CertType[]
  state: RequestState
  createdBy: string
  createdAt: LocalDateTime
  approvals: ApprovalStep[]
  cancelledReason?: string
  liveFill?: boolean
  source: "Mise" | "Legacy import"
}

export type ShiftStatus =
  | "Open"
  | "Confirmed"
  | "Checked in"
  | "Completed"
  | "No-show"
  | "Cancelled"

export type ShiftFate =
  | "normal"
  | "late"
  | "no_show"
  | "early_leave"
  | "missing_clockout"
  | "short_tap"
  | "long_break"
  | "overtime"

export interface Shift {
  id: string
  requestId: string
  date: ISODate
  slot: number
  workerId?: string
  assignedAt?: LocalDateTime
  status: ShiftStatus
  checkInAt?: LocalDateTime
  checkOutAt?: LocalDateTime
  fate: ShiftFate
  jitter: number
  cancelledReason?: string
  backfillFor?: string
}

export type TimeEntryStatus =
  | "Pending"
  | "Approved"
  | "Auto-approved"
  | "Disputed"
  | "Invoiced"

export type AnomalyType =
  | "missing_clockout"
  | "short_shift"
  | "long_break"
  | "late_arrival"
  | "early_departure"
  | "over_schedule"

export type DisputeReason =
  | "Name not recognized"
  | "Worker swap"
  | "Hours don't match sign-in"
  | "Rate incorrect"
  | "Duplicate entry"
  | "Pro not on site"

export type AdjustmentReason =
  | "Forgot to clock out"
  | "Sent home early"
  | "Break correction"
  | "Late arrival"
  | "Uniform deduction"
  | "Worker swap"
  | "Other"

export interface TimeAdjustment {
  at: LocalDateTime
  by: string
  summary: string
  reason: AdjustmentReason
  note?: string
}

export interface TimeEntry {
  id: string
  shiftId: string
  requestId: string
  workerId: string
  date: ISODate
  clockIn: LocalDateTime
  clockOut?: LocalDateTime
  breakMinutes: number
  regularHours: number
  overtimeHours: number
  billRate: number
  amount: number
  status: TimeEntryStatus
  anomalies: AnomalyType[]
  source: "Geofenced app" | "Kiosk" | "Manual"
  approvedBy?: string
  approvedAt?: LocalDateTime
  dispute?: {
    reason: DisputeReason
    note: string
    by: string
    at: LocalDateTime
    response?: { note: string; by: string; at: LocalDateTime }
  }
  adjustments: TimeAdjustment[]
  invoiceId?: string
}

export type TipBatchStatus =
  | "Draft"
  | "Pending approval"
  | "Approved"
  | "Paid"
  | "Rejected"

export interface TipLine {
  workerId: string
  amount: number
  hours: number
}

export interface TipBatch {
  id: string
  venueId: string
  costCenterId: string
  eventName: string
  date: ISODate
  requestIds: string[]
  lines: TipLine[]
  status: TipBatchStatus
  method: "Split by hours" | "Manual" | "CSV upload"
  createdBy: string
  createdAt: LocalDateTime
  approvedBy?: string
  approvedAt?: LocalDateTime
  invoiceId?: string
  note?: string
}

export type InvoiceStatus =
  | "Accruing"
  | "Pending approval"
  | "Approved"
  | "Paid"
  | "Disputed"

export interface InvoiceLine {
  id: string
  kind: "labor" | "overtime" | "tips" | "credit"
  description: string
  requestId?: string
  positionId?: string
  costCenterId: string
  date?: ISODate
  timeEntryIds: string[]
  tipBatchId?: string
  quantity: number
  rate: number
  amount: number
}

export interface InvoiceDispute {
  id: string
  lineId: string
  reason: string
  note: string
  by: string
  at: LocalDateTime
  status: "Open" | "Resolved"
}

export interface Invoice {
  id: string
  supplierId: string
  venueId: string
  periodStart: ISODate
  periodEnd: ISODate
  lines: InvoiceLine[]
  status: InvoiceStatus
  issuedAt: LocalDateTime
  dueDate: ISODate
  approvedBy?: string
  approvedAt?: LocalDateTime
  paidAt?: LocalDateTime
  paymentId?: string
  disputes: InvoiceDispute[]
  poNumber: string
}

export interface Payment {
  id: string
  supplierId: string
  amount: number
  date: ISODate
  method: "ACH" | "Virtual card"
  reference: string
  invoiceIds: string[]
  status: "Settled" | "Processing" | "Scheduled"
}

export type ChangeType =
  | "Headcount increase"
  | "Rate revision"
  | "Time change"
  | "Date extension"
  | "Cancellation"

export type ChangeStatus = "Pending" | "Approved" | "Declined" | "Auto-approved"

export interface ChangeRequest {
  id: string
  type: ChangeType
  requestId?: string
  venueId?: string
  positionId?: string
  rateCardId?: string
  requestedBy: string
  requestedByPersona: PersonaId
  createdAt: LocalDateTime
  status: ChangeStatus
  summary: string
  detail: string
  delta?: number
  newRate?: number
  decidedBy?: string
  decidedAt?: LocalDateTime
}

export type ActivityKind =
  | "request"
  | "approval"
  | "fill"
  | "checkin"
  | "noshow"
  | "timesheet"
  | "tips"
  | "invoice"
  | "payment"
  | "rate"
  | "policy"
  | "roster"
  | "message"
  | "change"
  | "alert"

export interface Activity {
  id: string
  at: LocalDateTime
  actor: string
  kind: ActivityKind
  text: string
  requestId?: string
  workerId?: string
  invoiceId?: string
  venueId?: string
}

export interface Comment {
  id: string
  requestId: string
  author: string
  authorPersona: PersonaId
  at: LocalDateTime
  body: string
}

export interface AppNotification {
  id: string
  at: LocalDateTime
  title: string
  body: string
  href?: string
  read: boolean
  kind: ActivityKind
  personas: PersonaId[]
  venueId?: string
}

export interface Policies {
  autoApproveRequestsUnder: number
  autoApproveHeadcountPct: number
  timesheetAutoApproveHours: number
  rushLeadTimeHours: number
  tier1ExclusiveMinutes: number
  contractualHoursCap: number
  contractualHoursWarnPct: number
  msaFeePct: number
  overtimeMultiplier: number
  overtimeWeeklyThreshold: number
  requireTipApproval: boolean
  rateChangesRequireProgram: boolean
  autoBackfillNoShows: boolean
  blockOverCapWorkers: boolean
}

export interface Persona {
  id: PersonaId
  name: string
  firstName: string
  title: string
  org: string
  email: string
  venueIds: string[] | "all"
  supplierId?: string
  hue: number
}
