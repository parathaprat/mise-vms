import type {
  CertType,
  CostCenter,
  Persona,
  PersonaId,
  Policies,
  Position,
  Supplier,
  Venue,
} from "@/lib/types"

export const BRAND_NAME = "Mise"
export const PROGRAM_NAME = "FlexForce"

export interface Metro {
  id: string
  label: string
  state: string
  payMultiplier: number
  markupPct: number
}

export const METROS: Metro[] = [
  { id: "chicago", label: "Chicago", state: "IL", payMultiplier: 1, markupPct: 0.6 },
  { id: "phoenix", label: "Phoenix", state: "AZ", payMultiplier: 0.95, markupPct: 0.63 },
  { id: "louisville", label: "Louisville", state: "KY", payMultiplier: 0.9, markupPct: 0.63 },
  { id: "columbus", label: "Columbus", state: "OH", payMultiplier: 0.92, markupPct: 0.63 },
  { id: "detroit", label: "Detroit", state: "MI", payMultiplier: 0.95, markupPct: 0.63 },
  { id: "ann-arbor", label: "Ann Arbor", state: "MI", payMultiplier: 0.96, markupPct: 0.63 },
  { id: "nyc", label: "New York City", state: "NY", payMultiplier: 1.14, markupPct: 0.63 },
  { id: "westchester", label: "Westchester", state: "NY", payMultiplier: 1.08, markupPct: 0.63 },
  { id: "whitewater", label: "Southern Wisconsin", state: "WI", payMultiplier: 0.88, markupPct: 0.63 },
]

export const VENUES: Venue[] = [
  { id: "v-wrigley", name: "Wrigley Field", shortName: "Wrigley", brand: "Levy", type: "Ballpark", city: "Chicago", state: "IL", metro: "chicago", address: "1060 W Addison St, Chicago, IL 60613", hue: 222 },
  { id: "v-soldier", name: "Soldier Field", shortName: "Soldier Field", brand: "Levy", type: "Stadium", city: "Chicago", state: "IL", metro: "chicago", address: "1410 Special Olympics Dr, Chicago, IL 60605", hue: 30 },
  { id: "v-united", name: "United Center", shortName: "United Center", brand: "Levy", type: "Arena", city: "Chicago", state: "IL", metro: "chicago", address: "1901 W Madison St, Chicago, IL 60612", hue: 352 },
  { id: "v-lynn", name: "Lynn Family Stadium", shortName: "Lynn Family", brand: "Levy", type: "Stadium", city: "Louisville", state: "KY", metro: "louisville", address: "350 Adams St, Louisville, KY 40206", hue: 280 },
  { id: "v-phoenix", name: "Phoenix Raceway", shortName: "Phoenix Raceway", brand: "Levy", type: "Raceway", city: "Avondale", state: "AZ", metro: "phoenix", address: "7602 S Avondale Blvd, Avondale, AZ 85323", hue: 18 },
  { id: "v-lower", name: "Lower.com Field", shortName: "Lower.com", brand: "Levy", type: "Stadium", city: "Columbus", state: "OH", metro: "columbus", address: "96 Columbus Crew Way, Columbus, OH 43215", hue: 52 },
  { id: "v-sloan", name: "Sloan Park", shortName: "Sloan Park", brand: "Levy", type: "Ballpark", city: "Mesa", state: "AZ", metro: "phoenix", address: "2330 W Rio Salado Pkwy, Mesa, AZ 85201", hue: 200 },
  { id: "v-ford", name: "Ford Field", shortName: "Ford Field", brand: "Levy", type: "Stadium", city: "Detroit", state: "MI", metro: "detroit", address: "2000 Brush St, Detroit, MI 48226", hue: 210 },
  { id: "v-crisler", name: "Crisler Center", shortName: "Crisler", brand: "Levy", type: "Arena", city: "Ann Arbor", state: "MI", metro: "ann-arbor", address: "333 E Stadium Blvd, Ann Arbor, MI 48104", hue: 48 },
  { id: "v-nyu", name: "NYU Palladium Dining", shortName: "NYU Palladium", brand: "Chartwells", type: "Campus", city: "New York", state: "NY", metro: "nyc", address: "140 E 14th St, New York, NY 10003", hue: 268 },
  { id: "v-uww", name: "UW–Whitewater Dining", shortName: "UW–Whitewater", brand: "Chartwells", type: "Campus", city: "Whitewater", state: "WI", metro: "whitewater", address: "800 W Main St, Whitewater, WI 53190", hue: 290 },
  { id: "v-pace", name: "Pace University Pleasantville", shortName: "Pace Pleasantville", brand: "Chartwells", type: "Campus", city: "Pleasantville", state: "NY", metro: "westchester", address: "861 Bedford Rd, Pleasantville, NY 10570", hue: 160 },
]

const LEVY_ATTIRE =
  "Black non-slip shoes, black pants, black belt. Levy shirt and hat issued on site. Hair restrained, no visible jewelry beyond a plain band."
const PREMIUM_ATTIRE =
  "Black dress shoes (non-slip), black dress pants, black long-sleeve button-down. Vest and tie issued on site."
const CAMPUS_ATTIRE =
  "Non-slip shoes, black or khaki pants. Chartwells polo, apron and hat provided. Hair restrained."

export const COST_CENTERS: CostCenter[] = [
  { id: "cc-41820", code: "41820", venueId: "v-wrigley", name: "General Concessions", glCode: "6120-410", weeklyBudget: 32000, approverName: "Tasha Greene", checkIn: "Enter Gate K on Clark St. Check in at the Levy staffing desk beneath the right-field bleachers 45 minutes before gates open. Bring a government-issued photo ID.", parking: "None", parkingNotes: "No venue parking. CTA Red Line Addison stop is one block east.", attire: LEVY_ATTIRE, favoritesFirst: true, active: true },
  { id: "cc-41826", code: "41826", venueId: "v-wrigley", name: "Premium Clubs & Suites", glCode: "6120-415", weeklyBudget: 18000, approverName: "Jordan Ellis", checkIn: "Use the Executive Entrance on Waveland Ave. Premium team lead meets Pros at the Catalina Club host stand.", parking: "Validated", parkingNotes: "Validated parking at the Hotel Zachary garage, 3630 N Clark St.", attire: PREMIUM_ATTIRE, favoritesFirst: true, active: true },
  { id: "cc-52610", code: "52610", venueId: "v-soldier", name: "General Concessions", glCode: "6120-520", weeklyBudget: 30000, approverName: "Ray Mendoza", checkIn: "Enter Gate 0 on the south end. Staffing check-in is in the commissary off the south ramp. Doors open 2.5 hours before kickoff.", parking: "Free", parkingNotes: "Free staff parking in the Waldron Deck (Lot 18) with your Mise shift pass.", attire: LEVY_ATTIRE, favoritesFirst: true, active: true },
  { id: "cc-52614", code: "52614", venueId: "v-soldier", name: "United Club & Suites", glCode: "6120-525", weeklyBudget: 16000, approverName: "Jordan Ellis", checkIn: "Enter Gate 14 (United Club entrance). Check in with the suites captain on the 200 level.", parking: "Free", parkingNotes: "Free staff parking in the Waldron Deck (Lot 18).", attire: PREMIUM_ATTIRE, favoritesFirst: false, active: true },
  { id: "cc-38470", code: "38470", venueId: "v-united", name: "Concessions", glCode: "6120-380", weeklyBudget: 24000, approverName: "Alicia Park", checkIn: "Employee entrance at Gate 6 on Madison St. Badge pickup at the Levy office, lower concourse section 117.", parking: "Paid", parkingNotes: "Staff rate $10 in Lot K. Pink Line Damen stop is a 10-minute walk.", attire: LEVY_ATTIRE, favoritesFirst: true, active: true },
  { id: "cc-38476", code: "38476", venueId: "v-united", name: "Premium Dining", glCode: "6120-385", weeklyBudget: 15000, approverName: "Jordan Ellis", checkIn: "Atrium entrance, Gate 3. Check in with the Club Level manager at the Stadium Club host desk.", parking: "Paid", parkingNotes: "Staff rate $10 in Lot K.", attire: PREMIUM_ATTIRE, favoritesFirst: false, active: true },
  { id: "cc-60311", code: "60311", venueId: "v-lynn", name: "Stadium Operations", glCode: "6120-603", weeklyBudget: 12000, approverName: "Brent Coleman", checkIn: "Staff gate on Adams St. Check in at the Levy commissary next to section 105.", parking: "Free", parkingNotes: "Free staff parking in the River Road lot.", attire: LEVY_ATTIRE, favoritesFirst: false, active: true },
  { id: "cc-71204", code: "71204", venueId: "v-phoenix", name: "Hospitality & Suites", glCode: "6120-712", weeklyBudget: 18000, approverName: "Monica Salazar", checkIn: "Credential pickup at the Turn 1 hospitality village. Shuttles run from the infield every 15 minutes.", parking: "Free", parkingNotes: "Staff Lot 4 off Avondale Blvd. Bring your Mise shift pass.", attire: PREMIUM_ATTIRE, favoritesFirst: false, active: true },
  { id: "cc-71201", code: "71201", venueId: "v-phoenix", name: "Concessions", glCode: "6120-710", weeklyBudget: 22000, approverName: "Monica Salazar", checkIn: "Main concessions commissary behind the Bowl grandstand. Check in 60 minutes before gates.", parking: "Free", parkingNotes: "Staff Lot 4 off Avondale Blvd.", attire: LEVY_ATTIRE, favoritesFirst: false, active: true },
  { id: "cc-64420", code: "64420", venueId: "v-lower", name: "Concessions", glCode: "6120-644", weeklyBudget: 14000, approverName: "Derek Owusu", checkIn: "Staff entrance at the northeast corner on Columbus Crew Way. Badge pickup at the Levy office.", parking: "Paid", parkingNotes: "Staff rate $8 in the Arena District garage.", attire: LEVY_ATTIRE, favoritesFirst: true, active: true },
  { id: "cc-71950", code: "71950", venueId: "v-sloan", name: "Concessions", glCode: "6120-719", weeklyBudget: 8000, approverName: "Monica Salazar", checkIn: "Staff gate on Rio Salado Pkwy. Check in at the commissary under section 108.", parking: "Free", parkingNotes: "Free staff parking in Lot C.", attire: LEVY_ATTIRE, favoritesFirst: false, active: true },
  { id: "cc-47730", code: "47730", venueId: "v-ford", name: "General Concessions", glCode: "6120-477", weeklyBudget: 22000, approverName: "Keisha Brooks", checkIn: "Employee entrance on Brush St (Gate F). Levy check-in in the main commissary, lower level.", parking: "Paid", parkingNotes: "Staff rate $12 in the Ford Field garage. People Mover Greektown stop is nearby.", attire: LEVY_ATTIRE, favoritesFirst: false, active: true },
  { id: "cc-55102", code: "55102", venueId: "v-crisler", name: "Athletics Hospitality", glCode: "6120-551", weeklyBudget: 10000, approverName: "Evan Mitchell", checkIn: "Loading dock entrance on the east side. Check in with the hospitality lead in the Crisler Club.", parking: "Free", parkingNotes: "Free parking in the Blue Lot with your shift pass.", attire: PREMIUM_ATTIRE, favoritesFirst: true, active: true },
  { id: "cc-30218", code: "30218", venueId: "v-nyu", name: "Residential Dining", glCode: "6130-302", weeklyBudget: 15000, approverName: "Rachel Kim", checkIn: "Enter at 140 E 14th St. Show ID at the security desk and ask for the Chartwells dining office, lower level.", parking: "None", parkingNotes: "No parking. Union Square station (L, N, Q, R, W, 4, 5, 6) is two blocks away.", attire: CAMPUS_ATTIRE, favoritesFirst: true, active: true },
  { id: "cc-58840", code: "58840", venueId: "v-uww", name: "Catering & Events", glCode: "6130-588", weeklyBudget: 8000, approverName: "Tom Lindgren", checkIn: "University Center loading dock. Check in with the catering manager in room 134.", parking: "Free", parkingNotes: "Free parking in Lot 12 with a guest pass from the catering office.", attire: CAMPUS_ATTIRE, favoritesFirst: false, active: true },
  { id: "cc-30455", code: "30455", venueId: "v-pace", name: "Dining & Catering", glCode: "6130-304", weeklyBudget: 9000, approverName: "Anthony Russo", checkIn: "Kessel Student Center, back-of-house entrance. Check in with the Chartwells manager on duty.", parking: "Free", parkingNotes: "Free parking in the Kessel lot.", attire: CAMPUS_ATTIRE, favoritesFirst: false, active: true },
]

export const POSITIONS: Position[] = [
  { id: "p-concessions", title: "Concessions Worker", category: "Concessions", description: "Serve guests at concession stands, run POS transactions, restock product and keep stands clean and food-safe throughout the event.", requiredCerts: ["Food Handler"], aliases: ["concessions worker", "concessions workers", "concession worker", "concessions", "concession", "stand worker", "stand workers"] },
  { id: "p-cashier", title: "Cashier", category: "Concessions", description: "Run point-of-sale for concession and retail stands, handle cash and card payments, and keep lines moving during peak periods.", requiredCerts: [], aliases: ["cashier", "cashiers", "pos"] },
  { id: "p-cash-bartender", title: "Cash Bartender", category: "Bar", description: "Pour beer, wine and cocktails at portable and fixed bars. Check IDs, handle cash and card payments, and follow responsible alcohol service.", requiredCerts: [], aliases: ["cash bartender", "cash bartenders", "bartender", "bartenders", "bar staff"] },
  { id: "p-suite-bartender", title: "Suite Bartender", category: "Bar", description: "Provide premium bar service in suites and clubs. Prepare signature cocktails, manage par levels and deliver high-touch guest service.", requiredCerts: [], aliases: ["suite bartender", "suite bartenders", "premium bartender", "premium bartenders"] },
  { id: "p-barback", title: "Barback", category: "Bar", description: "Support bartenders by restocking ice, kegs, glassware and garnish. Keep bar areas clean and organized.", requiredCerts: [], aliases: ["barback", "barbacks", "bar back", "bar backs"] },
  { id: "p-banquet-server", title: "Banquet/Buffet Server", category: "Service", description: "Set, serve and break down buffet and plated service for clubs, suites and private events. Maintain presentation and food safety standards.", requiredCerts: ["Food Handler"], aliases: ["banquet/buffet server", "banquet server", "banquet servers", "buffet server", "buffet servers", "server", "servers", "banquet"] },
  { id: "p-suite-attendant", title: "Suite Attendant", category: "Service", description: "Own guest experience for assigned suites: set up, replenish food and beverage, take orders and coordinate with the suite kitchen.", requiredCerts: ["Food Handler"], aliases: ["suite attendant", "suite attendants", "suite runner", "suites"] },
  { id: "p-runner", title: "Runner", category: "Service", description: "Run product, food and supplies between kitchens, commissaries and stands. Help with setup and breakdown.", requiredCerts: [], aliases: ["runner", "runners", "food runner", "food runners"] },
  { id: "p-line-cook", title: "Line Cook", category: "Culinary", description: "Prepare menu items on the line to spec and on time. Maintain station cleanliness, labeling and temperature logs.", requiredCerts: ["Food Handler"], aliases: ["line cook", "line cooks", "cook", "cooks"] },
  { id: "p-grill-cook", title: "Grill Cook", category: "Culinary", description: "Operate flat-top and char grills for high-volume concessions menus. Follow recipes, portioning and food safety procedures.", requiredCerts: ["Food Handler"], aliases: ["grill cook", "grill cooks", "grill"] },
  { id: "p-prep-cook", title: "Prep Cook", category: "Culinary", description: "Prep ingredients ahead of service: cutting, portioning, batching sauces and labeling product per HACCP standards.", requiredCerts: ["Food Handler"], aliases: ["prep cook", "prep cooks", "prep"] },
  { id: "p-dishwasher", title: "Dishwasher", category: "Support", description: "Wash and sanitize dishes, pans and equipment. Keep the dish area and back of house clean and organized.", requiredCerts: [], aliases: ["dishwasher", "dishwashers", "utility", "dish"] },
  { id: "p-captain", title: "Banquet Captain", category: "Leadership", description: "Lead a team of servers and attendants through an event. Run pre-shift line-up, assign stations and be the point of contact for the client.", requiredCerts: ["Food Handler", "ServSafe Manager"], aliases: ["banquet captain", "banquet captains", "captain", "captains", "lead"] },
  { id: "p-fsw", title: "Food Service Worker", category: "Service", description: "Support campus dining service: serving lines, replenishing stations, light prep and cleaning in residential dining halls.", requiredCerts: ["Food Handler"], aliases: ["food service worker", "food service workers", "food service", "fsw", "dining attendant"] },
  { id: "p-warehouse", title: "Warehouse Associate", category: "Support", description: "Receive, stock and stage product in the commissary. Pull orders for stands and maintain FIFO rotation.", requiredCerts: [], aliases: ["warehouse associate", "warehouse associates", "warehouse", "stocker", "stockers", "commissary"] },
]

/** Base Pro pay rates for the Chicago metro; other metros scale by `payMultiplier`. */
export const BASE_PAY: Record<string, number> = {
  "p-concessions": 18.5,
  "p-cashier": 18.75,
  "p-cash-bartender": 20.5,
  "p-suite-bartender": 22.5,
  "p-barback": 18.25,
  "p-banquet-server": 22.95,
  "p-suite-attendant": 21.5,
  "p-runner": 18.25,
  "p-line-cook": 21,
  "p-grill-cook": 21.2,
  "p-prep-cook": 19.5,
  "p-dishwasher": 17.75,
  "p-captain": 26.5,
  "p-fsw": 18,
  "p-warehouse": 18.5,
}

export const SUPPLIERS: Supplier[] = [
  { id: "s-instawork", name: "Instawork", shortName: "Instawork", tier: 1, kind: "Marketplace", hq: "San Francisco, CA", contactName: "Marcus Lee", contactEmail: "enterprise@instawork.com", metros: METROS.map((m) => m.id), coiExpires: "", msaSigned: true, w2: true, hue: 145, active: true },
  { id: "s-lakeshore", name: "Lakeshore Event Staffing", shortName: "Lakeshore", tier: 2, kind: "Agency", hq: "Chicago, IL", contactName: "Dana Whitaker", contactEmail: "dispatch@lakeshore-events.example", metros: ["chicago"], coiExpires: "", msaSigned: true, w2: true, hue: 205, active: true },
  { id: "s-crescent", name: "Crescent Hospitality Staffing", shortName: "Crescent", tier: 2, kind: "Agency", hq: "Atlanta, GA", contactName: "Luis Ortega", contactEmail: "ops@crescent-hospitality.example", metros: ["phoenix", "columbus", "detroit", "louisville", "nyc", "westchester"], coiExpires: "", msaSigned: true, w2: true, hue: 32, active: true },
  { id: "s-summit", name: "Summit Workforce Solutions", shortName: "Summit", tier: 3, kind: "Agency", hq: "Milwaukee, WI", contactName: "Kara Lindqvist", contactEmail: "staffing@summit-workforce.example", metros: ["whitewater", "chicago", "ann-arbor", "detroit"], coiExpires: "", msaSigned: true, w2: true, hue: 330, active: true },
]

export const PERSONAS: Record<PersonaId, Persona> = {
  venue: { id: "venue", name: "Jordan Ellis", firstName: "Jordan", title: "Director of Operations", org: "Levy · Chicago", email: "jordan.ellis@levy.example", venueIds: ["v-wrigley", "v-soldier", "v-united"], hue: 222 },
  program: { id: "program", name: "Priya Raman", firstName: "Priya", title: "FlexForce Program Manager", org: "Compass Group USA", email: "priya.raman@compass.example", venueIds: "all", hue: 276 },
  supplier: { id: "supplier", name: "Marcus Lee", firstName: "Marcus", title: "Enterprise Operations Lead", org: "Instawork", email: "marcus.lee@instawork.example", venueIds: "all", supplierId: "s-instawork", hue: 145 },
}

export const DEFAULT_POLICIES: Policies = {
  autoApproveRequestsUnder: 15000,
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
}

export const ALCOHOL_CERT_BY_STATE: Record<string, CertType> = {
  IL: "BASSET",
}

export function alcoholCertFor(state: string): CertType {
  return ALCOHOL_CERT_BY_STATE[state] ?? "TIPS"
}

export function metroById(id: string): Metro | undefined {
  return METROS.find((m) => m.id === id)
}

export const FIRST_NAMES = [
  "Aaliyah", "Adrian", "Aisha", "Alejandro", "Alicia", "Amara", "Andre", "Angela", "Antonio", "Ariana",
  "Ashley", "Bianca", "Brandon", "Brianna", "Camila", "Carlos", "Cedric", "Chloe", "Christopher", "Daniela",
  "Darius", "Deja", "Diego", "Dominique", "Elena", "Elijah", "Emmanuel", "Esperanza", "Fatima", "Gabriel",
  "Giselle", "Grace", "Hector", "Imani", "Isaiah", "Jada", "Jamal", "Jasmine", "Javier", "Jerome",
  "Jessica", "Jonathan", "Josefina", "Kayla", "Keisha", "Kevin", "Latoya", "Lauren", "Leon", "Lucia",
  "Malik", "Marcus", "Maria", "Mariana", "Marisol", "Maya", "Michael", "Monique", "Nadia", "Natalie",
  "Nia", "Omar", "Priya", "Rafael", "Raymond", "Renee", "Ricardo", "Rosa", "Samantha", "Samuel",
  "Sasha", "Sofia", "Tanisha", "Terrence", "Tiana", "Tyrone", "Valeria", "Vanessa", "Victor", "Xavier",
  "Yasmin", "Yolanda", "Zion", "Kenji", "Mei", "Thanh", "Huy", "Sanjay", "Anjali", "Mohammed",
]

export const LAST_NAMES = [
  "Adams", "Alvarez", "Anderson", "Baker", "Banks", "Bell", "Brooks", "Brown", "Bryant", "Campbell",
  "Carter", "Castillo", "Chen", "Coleman", "Collins", "Cruz", "Davis", "Diaz", "Edwards", "Evans",
  "Flores", "Foster", "Garcia", "Gomez", "Gonzalez", "Graham", "Green", "Griffin", "Gutierrez", "Hall",
  "Harris", "Hayes", "Henderson", "Hernandez", "Hill", "Holmes", "Howard", "Hughes", "Jackson", "James",
  "Jenkins", "Johnson", "Jones", "Kim", "King", "Lee", "Lewis", "Lopez", "Martin", "Martinez",
  "Mendoza", "Mitchell", "Moore", "Morales", "Morgan", "Murphy", "Nguyen", "Okafor", "Ortiz", "Patel",
  "Perez", "Phillips", "Ramirez", "Reed", "Reyes", "Richardson", "Rivera", "Robinson", "Rodriguez", "Ross",
  "Russell", "Sanchez", "Sanders", "Scott", "Simmons", "Smith", "Stewart", "Taylor", "Thomas", "Thompson",
  "Torres", "Tran", "Turner", "Vasquez", "Walker", "Washington", "Watson", "White", "Williams", "Wilson",
  "Wright", "Young", "Abernathy", "Delgado", "Fitzgerald", "Kowalski", "Novak", "Oyelaran", "Sato", "Whitfield",
]

export const PREFERRED_NAMES: Record<string, string> = {
  Alejandro: "Alex",
  Christopher: "Chris",
  Jonathan: "Jon",
  Michael: "Mike",
  Samantha: "Sam",
  Samuel: "Sam",
  Josefina: "Josie",
  Raymond: "Ray",
  Mohammed: "Mo",
  Gabriel: "Gabe",
  Valeria: "Val",
  Daniela: "Dani",
}
