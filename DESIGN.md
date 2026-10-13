# Mise

Mise is a local prototype of the operating layer between a venue partner and the staffing agencies that fill its shifts. It is built for Compass Group's FlexForce conversation: one place to ask for people, place only workers who are actually ready, compare agencies, approve the hours that happened, and pay an invoice you can trust.

It is a demo. Data lives in the browser. Nothing here is production authentication, payments, or a live agency integration.

## What the partner is trying to do

A venue manager, program lead, or finance reviewer should be able to finish the work without learning a vendor management system.

1. Say what the shift needs.
2. See which agency can actually fill it with ready workers, at what rate.
3. Place people who have cleared background checks and the required certifications.
4. Approve the hours that were worked on site.
5. Pay an invoice that names those workers, those hours, and that rate.

Agency choice stays with the partner. Mise recommends. It does not auto-award.

## Who uses it

Switch identity from the sidebar. Each person sees the same shifts, with a different job to do.

| Persona | Home base | Job in the demo |
| --- | --- | --- |
| Jordan Lee, venue manager | The Grand Hall | Ask for staff, place people, approve today's hours |
| Priya Shah, program office | All venues | Compare agencies, watch readiness, spend, and coverage |
| Dana Okonkwo, Northline Staffing | Supplier home | Accept a request and propose ready workers |
| Billing admin | Invoices | Open the same invoice the partner will pay and see the check |

Two suppliers exist on purpose. Northline Staffing is the default. Harbor Hospitality is the comparison, so "which agency" is a real choice rather than a single vendor screen.

## Product rules

**Safety gates placement.** A worker can be placed only when the background check is complete and unexpired, required certifications are valid, and the worker is active. The same check runs on manual place, supplier proposal, and bench fill. A blocked worker stays visible, with the reason, so the manager can see who is close.

**The partner picks the agency.** For each request, Mise ranks the agencies that can actually staff it. The rank uses ready workers, reliability, recent fill, and rate against the card. The top row is marked Best fit and includes a one-line reason. Awarding writes the agency, rate, and reason onto the request.

**The invoice has to match the work.** Each invoice opens with an Invoice check: named workers, geofenced on-site time, rate at or under the card, and approvals. Lines point at those time entries. Hours with no worker, off-site punches, rate mismatches, and unapproved time show up before anyone pays.

**A unit should see labor against the room.** Unit pulse compares temp labor spend with guest transactions against that unit's recent baseline. It is a signal for the partner and for finance, not a full P&L.

Copy stays short. Pages name the decision and show the data. There are no em dashes in product copy.

## Information architecture

Five sections in the sidebar.

| Section | What it holds |
| --- | --- |
| Home | What needs a decision right now |
| Schedule | Requests, the week, and the approval inbox |
| Spend | Timesheets, tips, invoices, insights |
| Team | Workers, suppliers, rate cards |
| Program | Locations, policies, settings |

Request detail is the operating record: award, roster, timesheets, work order, and activity.

## Demo data

Seeded venues are The Grand Hall, Riverside Bistro, Harborview Events, Skyline Catering, Metro Conference Center, and Lakeside Club. Roles include Banquet Server, Line Cook, Dishwasher, Bartender, Event Captain, and Housekeeping Attendant.

The clock starts on a fixed date so the same story is on screen every time:

- Open requests at The Grand Hall, including a Friday dinner that has not been awarded yet.
- Workers with a clear background check, workers still pending, and workers whose check has expired.
- Hours already worked, including a geofenced shift and one flagged punch.
- An invoice that fails the check, and an invoice that passes.
- Guest transactions loaded for The Grand Hall, Riverside Bistro, and Harborview Events so Unit pulse has a baseline.

Reset demo data in Settings returns the story to this seed. The demo clock advances inside the session from the top bar. Reset puts the date back.

## Nine minute demo

Open Home as Jordan Lee, venue manager, at The Grand Hall. Leave the live indicator on, and do not reset unless a previous click changed the story.

### 1. Home, about 30 seconds

Home is the day, not a dashboard tour. Needs you shows the open request and the hours waiting. The activity line is quiet on purpose.

### 2. Ask for people, about 90 seconds

Schedule, then Requests, then New request. The Friday dinner request is the one to open if you want the shorter path. In the composer, step through to Choose an agency.

Say this: "I describe the shift once. Mise only offers agencies that can put ready people on it, and it tells me which one fits. I still choose."

Point at Best fit, Safety ready, the ready-worker count, and the rate. Award Northline, or Harbor if you want to show the choice. Submit.

### 3. Safety is a gate, about 90 seconds

Open the new request, or the Friday dinner request. On the roster, try to place a worker whose background check is expired or whose certification is missing.

Say this: "Expired background check or missing cert. They cannot be placed. Same rule if the agency proposes them."

Then place a ready worker so the shift is actually staffed.

### 4. The agency accepts, about 45 seconds

Switch to Dana Okonkwo, Northline Staffing. Open the awarded request. Accept it and propose a worker. If you propose someone who is not ready, the proposal is blocked and the reason is on the row.

Switch back to Jordan Lee.

### 5. Hours, about 60 seconds

Spend, then Timesheets. Open the geofenced shift and show on-site punches. Open the flagged punch and show the anomaly. Approve the clean hours. Leave the flagged row unapproved.

### 6. The invoice, about 90 seconds

Spend, then Invoices. Open the invoice that fails the check first. Read the Invoice check: who worked, which hours, whether the rate matches the card, and what is still open.

Say this: "I am not paying a lump sum and hoping. The hours, the names, and the rate are on the bill."

Then open the invoice that passes. That is the one finance can pay.

### 7. Did the room justify the labor, about 45 seconds

Spend, then Insights. Unit pulse is spend per 100 guest transactions against the recent weeks at that unit. Switch the venue filter to The Grand Hall if the card is rolled up.

### 8. The program view, about 30 seconds

Switch to Priya Shah. Home is coverage, readiness, and spend across venues, not a second copy of the venue day.

Stop. Offer to reset, or to rerun the agency step with Harbor Hospitality.

## Three minute cut

Use this when the room is a leadership review and nobody wants a tour.

1. Home, as Jordan, for ten seconds. "This is the day at The Grand Hall."
2. Open the Friday dinner request. Choose an agency. Point at Best fit and Safety ready. Award it.
3. Show a blocked worker, then place a ready one.
4. Open the invoice that fails the check, then the one that passes.
5. Unit pulse. "Labor against the room, not just a pile of invoices."

## What each leadership question maps to

| Question from the FlexForce review | Where it shows up |
| --- | --- |
| Can a manager request without a ticketing maze | New request, five short steps, agency choice at the end |
| Do we know the worker is safe to put on the floor | Safety gate on every placement path |
| Can we compare Instawork and other agencies | Two suppliers, ranked offer, partner keeps the award |
| Are we paying for real hours | Invoice check tied to named workers and geofenced time |
| Can finance see if the unit earned the labor | Unit pulse against guest transactions |
| Can the agency work the same record | Dana's supplier home accepts and proposes on that request |

## What this prototype does not claim

- No live Instawork, Compass, or payroll connection.
- No real background-check vendor. Expiration is on the worker record so the gate can be demoed.
- No payment file leaves the browser.
- Tips, schedules, rate cards, and policies are in the product so the loop feels whole. They are not a second product pitch.
- Supplier scorecards are decision inputs, not a quarterly business review.

## How to run it

```bash
npm install
npm run dev
```

The dev server in this project is usually started with `npx next dev --port 4747 --hostname 0.0.0.0`. Open the home page, leave the persona on Jordan Lee, and follow the nine minute path above.

`npm run copy:check` fails if an em dash is introduced. `npm run typecheck` and `npm run test` cover the safety gate, agency ranking, and invoice checks.
