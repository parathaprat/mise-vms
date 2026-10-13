import type { PersonaId } from "@/lib/types"

/** Store actions that count as "the partner did the thing". */
export type TrackedAction =
  | "createRequest"
  | "submitDraft"
  | "approveRequest"
  | "decideChange"
  | "approveEntries"
  | "respondToDispute"
  | "createTipBatch"
  | "approveTipBatch"
  | "approveInvoice"
  | "toggleFavorite"
  | "assignWorker"
  | "updatePolicies"
  | "updateRateCard"

export interface GuideTask {
  id: string
  personas: PersonaId[]
  title: string
  answer: string
  href: string
  cta: string
  keywords: string
  /** Present when the task belongs on a role's setup checklist. */
  checklist?: {
    order: number
    short: string
    doneBy: { actions?: TrackedAction[]; route?: string; copilot?: boolean }
  }
}

const ALL: PersonaId[] = ["venue", "program", "supplier"]

export const GUIDE_TASKS: GuideTask[] = [
  // Venue -----------------------------------------------------------------
  {
    id: "request-staff",
    personas: ["venue", "program"],
    title: "Request staff for a shift or event",
    answer:
      "Click Request staff and describe what you need in a sentence, like “12 servers Saturday 4–11pm for the Bulls game”. Mise fills in the form, checks rates and budget, and starts filling the moment you post.",
    href: "/requests/new",
    cta: "Request staff",
    keywords: "new request post shifts job posting order book staff event headcount",
    checklist: { order: 1, short: "Request staff", doneBy: { actions: ["createRequest", "submitDraft"] } },
  },
  {
    id: "approve-time",
    personas: ["venue"],
    title: "Approve timesheets",
    answer:
      "Hours come in automatically from geofenced check-in. Clean timesheets can be approved together in one click; only flagged ones (late, long breaks, overtime) need a look.",
    href: "/timesheets",
    cta: "Open timesheets",
    keywords: "approve hours time clock tito timesheet adjust",
    checklist: { order: 2, short: "Approve time", doneBy: { actions: ["approveEntries"] } },
  },
  {
    id: "tips",
    personas: ["venue"],
    title: "Add tips for an event",
    answer:
      "Pick the event, enter the pool, and Mise splits it by hours worked. Pros are paid the next business day and tips are billed at cost with no program fee.",
    href: "/tips?new=1",
    cta: "Enter tips",
    keywords: "tips gratuity pool split event batch",
    checklist: { order: 3, short: "Enter tips", doneBy: { actions: ["createTipBatch", "approveTipBatch"] } },
  },
  {
    id: "favorite",
    personas: ["venue"],
    title: "Get the same great Pros back",
    answer:
      "Star a Pro on their profile or right after a shift. Favorites get first offer on your next requests, before anyone else sees them.",
    href: "/workforce",
    cta: "See your Pros",
    keywords: "favorite star preferred repeat rehire roster",
    checklist: { order: 4, short: "Star a favorite", doneBy: { actions: ["toggleFavorite"] } },
  },
  {
    id: "live",
    personas: ["venue", "program"],
    title: "See who's on site right now",
    answer: "The live board shows every check-in as it happens, who's late, and any open spots still filling.",
    href: "/schedule?view=live",
    cta: "Open live board",
    keywords: "live board check in on site late no-show arrivals today",
  },
  {
    id: "change-headcount",
    personas: ["venue", "program"],
    title: "Add or remove people from a request",
    answer: "Open the request and use Change headcount. Extra spots start filling right away; fewer spots release the latest confirmations first.",
    href: "/requests",
    cta: "Open requests",
    keywords: "headcount add more fewer cancel change request edit",
  },
  {
    id: "block",
    personas: ["venue", "program"],
    title: "Stop a Pro from coming back",
    answer: "On the Pro's profile, choose Block from this venue and add a reason. They won't be offered your shifts again.",
    href: "/workforce?tab=blocked",
    cta: "Blocked Pros",
    keywords: "block dnr do not return ban remove pro",
  },
  {
    id: "invoice-dispute",
    personas: ["venue", "program"],
    title: "Question a line on an invoice",
    answer: "Open the invoice, click the line, and choose Dispute. The supplier sees it immediately; the rest of the invoice can still be approved once it's resolved.",
    href: "/invoices",
    cta: "Open invoices",
    keywords: "invoice dispute wrong charge credit billing",
  },
  {
    id: "approve-invoice",
    personas: ["venue", "program"],
    title: "Approve this week's invoice",
    answer: "Invoices are built from approved timesheets and tips, so there's nothing to reconcile. Review the total and approve. Payment is scheduled automatically.",
    href: "/invoices",
    cta: "Open invoices",
    keywords: "invoice approve pay bill weekly payment",
  },
  {
    id: "spend",
    personas: ["venue", "program"],
    title: "Check spend against budget",
    answer: "Insights shows labor by week, venue and position against each cost center's budget, updated as time is captured.",
    href: "/insights",
    cta: "Open insights",
    keywords: "budget spend cost report analytics labor",
  },

  // Program -----------------------------------------------------------------
  {
    id: "approve-requests",
    personas: ["program"],
    title: "Approve requests and changes",
    answer:
      "Requests over policy limits and rate changes land in To do. Approve in one click and distribution to suppliers starts instantly.",
    href: "/inbox",
    cta: "Open To do",
    keywords: "approve request change rate revision headcount program office",
    checklist: { order: 1, short: "Approve a request", doneBy: { actions: ["approveRequest", "decideChange"] } },
  },
  {
    id: "policies",
    personas: ["program"],
    title: "Set the rules once",
    answer:
      "Policies decide what's auto-approved, when Tier 2 suppliers join, and how long before shifts go unfilled. Change a rule and it applies everywhere.",
    href: "/policies",
    cta: "Open policies",
    keywords: "policy rules auto approve threshold tier escalation settings",
    checklist: { order: 2, short: "Review policies", doneBy: { actions: ["updatePolicies"], route: "/policies" } },
  },
  {
    id: "rates",
    personas: ["program", "supplier"],
    title: "See or change rates",
    answer:
      "Each position has a pay rate per metro; the bill rate adds the supplier markup. Edit a rate and upcoming requests reprice automatically.",
    href: "/rates",
    cta: "Open rates",
    keywords: "rate card pay bill markup price wage",
    checklist: { order: 3, short: "Check rates", doneBy: { actions: ["updateRateCard"], route: "/rates" } },
  },
  {
    id: "suppliers",
    personas: ["program"],
    title: "Compare suppliers",
    answer: "Scorecards rank suppliers on real shift outcomes (fill rate, no-shows, ratings) and flag expiring insurance certificates.",
    href: "/suppliers",
    cta: "Open suppliers",
    keywords: "supplier scorecard tier coi compliance vendor agency",
    checklist: { order: 4, short: "Meet your suppliers", doneBy: { route: "/suppliers" } },
  },

  // Supplier ----------------------------------------------------------------
  {
    id: "fill",
    personas: ["supplier"],
    title: "Fill open shifts",
    answer:
      "Open orders lists every unfilled shift, soonest first. Use Auto-fill to confirm your best available Pros in one click. Work orders are created on confirmation.",
    href: "/requests?tab=open",
    cta: "Open orders",
    keywords: "fill shifts assign pros orders open staffing work order",
    checklist: { order: 1, short: "Fill a shift", doneBy: { actions: ["assignWorker"] } },
  },
  {
    id: "dispute-reply",
    personas: ["supplier"],
    title: "Respond to a disputed timesheet",
    answer: "When a venue questions hours, it shows up in To do. Reply with context; the venue can approve, adjust or reassign in one step.",
    href: "/timesheets?tab=disputed",
    cta: "Open disputes",
    keywords: "dispute respond timesheet hours venue question",
    checklist: { order: 2, short: "Answer a dispute", doneBy: { actions: ["respondToDispute"], route: "/timesheets" } },
  },
  {
    id: "get-paid",
    personas: ["supplier"],
    title: "See when you'll be paid",
    answer: "Invoices are generated weekly from approved time. You never build one. Payments show their date and are matched to invoices automatically.",
    href: "/invoices",
    cta: "Open invoices",
    keywords: "paid payment invoice receivable remittance cash",
    checklist: { order: 3, short: "See payments", doneBy: { route: "/invoices" } },
  },
  {
    id: "pros",
    personas: ["supplier"],
    title: "Keep your Pros compliant",
    answer: "Pros shows certifications and hours for everyone on your bench, and warns you before anything expires.",
    href: "/workforce",
    cta: "Open Pros",
    keywords: "pros workers compliance certification bench onboarding",
    checklist: { order: 4, short: "Review your Pros", doneBy: { route: "/workforce" } },
  },

  // Everyone ----------------------------------------------------------------
  {
    id: "ask",
    personas: ALL,
    title: "Ask Mise anything",
    answer:
      "Press ⌘K (or tap the search bar) and type a question in plain English, like “who's late tonight?” or “what did we spend at Soldier Field last week?” Mise answers with links to act.",
    href: "",
    cta: "Ask Mise",
    keywords: "ask ai copilot question help search assistant",
    checklist: { order: 5, short: "Ask Mise a question", doneBy: { copilot: true } },
  },
  {
    id: "switch-theme",
    personas: ALL,
    title: "Switch to dark mode",
    answer: "Use the sun/moon button in the header, or Settings → Appearance to follow your system.",
    href: "/settings",
    cta: "Open settings",
    keywords: "dark mode light theme appearance",
  },
]

export function tasksFor(persona: PersonaId): GuideTask[] {
  return GUIDE_TASKS.filter((t) => t.personas.includes(persona))
}

export function checklistFor(persona: PersonaId): GuideTask[] {
  return tasksFor(persona)
    .filter((t) => t.checklist)
    .sort((a, b) => a.checklist!.order - b.checklist!.order)
}

export interface GlossaryTerm {
  term: string
  plain: string
  /** What Fieldglass called it, when different. */
  formerly?: string
}

export const GLOSSARY: GlossaryTerm[] = [
  { term: "Request", plain: "What you need: a position, how many people, when and where.", formerly: "Job Posting" },
  { term: "Shift", plain: "One person, one day of a request. A request for 10 servers on 2 days is 20 shifts." },
  { term: "Pro", plain: "A person who works the shift, employed by one of the staffing suppliers.", formerly: "Worker / Contingent Worker" },
  { term: "Work order", plain: "The agreement for a Pro to work your shifts. Mise creates it the moment they confirm. Nobody uploads anything.", formerly: "Work Order (manual)" },
  { term: "Timesheet", plain: "Hours a Pro worked, captured automatically when they check in and out on site.", formerly: "Time Sheet / TITO upload" },
  { term: "Tips", plain: "Event gratuity you split across Pros. Paid next business day and billed at cost." },
  { term: "Invoice", plain: "The weekly bill from each supplier, built automatically from approved timesheets and tips." },
  { term: "Pay rate", plain: "What the Pro earns per hour." },
  { term: "Bill rate", plain: "What you pay per hour: the pay rate plus the supplier's markup." },
  { term: "Program fee", plain: "A 2% fee on labor that funds the program. Suppliers see invoices net of it.", formerly: "MSA fee" },
  { term: "Cost center", plain: "The budget a shift is charged to, usually a venue department." },
  { term: "Tier 1 / Tier 2", plain: "Preferred suppliers see your shifts first. If they can't cover in time, Tier 2 joins automatically." },
  { term: "Favorites", plain: "Pros you've starred. They get first offer on your future requests." },
  { term: "Blocked", plain: "Pros who won't be offered your shifts again.", formerly: "DNR (Do Not Return)" },
  { term: "COI", plain: "A supplier's certificate of insurance. Expired certificates pause distribution to that supplier." },
  { term: "Auto-approved", plain: "Handled by a policy you set, so nobody had to click anything." },
]

export function glossaryEntry(term: string): GlossaryTerm | undefined {
  const t = term.toLowerCase()
  return GLOSSARY.find((g) => g.term.toLowerCase() === t)
}
