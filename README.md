# Mise: the simple way to run flexible staffing

**Mise** (as in _mise en place_, everything in its place) is a working prototype of the operating layer between Compass partners and their staffing agencies, including Instawork and others. A partner asks for people once. Mise compares safety-ready agencies, follows the workers through the shift, and produces an invoice that shows exactly who worked, when, at what rate, and who approved it.

It is a **local demo**: no backend, no credentials, no network calls. All data is generated on first load, relative to today's date, and stored in your browser.

## Run it

Requirements: Node.js 20.9+ (tested on 22).

```bash
npm install
npm run dev
```

Open <http://localhost:4747>. The first load takes about a second while Mise generates a fresh week of FlexForce activity.

Other scripts: `npm run build && npm start` (production build, same port), `npm run lint`, `npm run typecheck`, and `npm run copy:check` / `npm run copy:fix`, which keep em dashes out of product copy.

To see first-run onboarding again, choose **Help → Restart onboarding**, or clear the `mise-onboarding` key in localStorage.

## Three seats, one system

Switch personas from the workspace switcher (top-left), the user menu, Settings, or `⌘K → "View as…"`.

| Persona                      | Who                                                                                               | What they do in Mise                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Venue operator** (default) | Jordan Ellis, Director of Operations, Levy · Chicago, Wrigley Field, Soldier Field, United Center | Post requests, watch the live board, approve hours and tips, manage favorites / do-not-return, approve invoices                                 |
| **Program office**           | Priya Raman, FlexForce Program Manager, Compass Group USA                                         | Approve large requests and headcount / rate changes, own rate cards, cost centers, suppliers and policies, run invoice cycles, release payments |
| **Supplier**                 | Marcus Lee, Enterprise Operations, Instawork                                                      | Fill open shifts, respond to disputes, see receivables and pre-matched payments                                                                 |

## Built to be obvious

Mise is designed around the questions a partner actually has, not the modules in a procurement system:

- **Five places, named for the job.** Home, Staffing, Approvals, Spend and Team (Orders, Time, Get paid and Pros for suppliers). Each opens to a short row of tabs. Nothing is more than two clicks away.
- **One obvious next step.** "Request staff" (or "Fill shifts") is always in the header. Home leads with what needs you, with the decision button right on the row: approve timesheets, tips, invoices or requests without opening a page.
- **Search or ask, in one box.** `⌘K` finds any request, Pro or invoice, answers "how do I…" questions, and hands real questions ("who's late tonight?") to Mise.
- **Onboarding that takes a minute.** A role-specific welcome and a 60-second spotlight tour explain the whole product without a manual.
- **Help in plain English.** `?` opens task answers that link straight to the right screen, explains legacy program terms, and replays the tour.

## A five-minute demo

1. **Welcome and tour**: the first visit for each role opens a short welcome and a 60-second tour.
2. **Home**: what needs your call (with one-click decisions), today's events filling live, and the next 7 days in a spacious Now / Ahead / Trends briefing.
3. **Request staff in plain English**: `Request staff → "12 cash bartenders at Wrigley this Saturday 4–11pm for the Cubs game"`. The form fills itself. Mise compares insured agencies on safety-ready coverage, reliability and rate, then explains its recommendation. Post it and watch Pros confirm in real time.
4. **Approvals → Timesheets**: hours captured at clock-out with anomaly flags. Approve clean entries in one click, adjust with a reason code, or move hours to the Pro who actually worked.
5. **Approvals → Tips**: pick last night's event, split the pool by hours, submit once.
6. **Spend → Invoices**: the invoice check shows named workers, safety status, on-site time, awarded rates and approvals before the partner pays. Every line still expands to its source timesheets.
7. **Switch to the program office**: approve the pending headcount increase and rate revision from To do, publish a rate change and watch upcoming requests reprice, tune policies.
8. **Spend → Insights**: Unit pulse puts temp-labor spend beside the venue's guest activity and compares the unit with its own recent weeks.
9. Press **⌘K** anywhere to search or ask, or **?** for help.

## What it resolves for partners

| Partner question | Mise's answer |
| --- | --- |
| Who can safely work here? | Background checks, required certifications, agency insurance, hours caps and do-not-return rules are gates, not document reminders. |
| Which agency should get the work? | Agencies are compared on ready workers nearby, reliability, fill history and offered rate. The recommendation is visible and the partner keeps the choice. |
| Did these people really work? | Every labor charge starts with approved on-site time tied to a named worker. Suppliers cannot type in an unsupported labor line. |
| Can I trust this invoice? | A single invoice check shows worker safety, source of time, rate agreement and approvals, then opens every exception to its source. |
| Is this unit off track? | Unit pulse compares temp-labor spend with guest activity and with that unit's own recent baseline. |
| What happens when the first agency cannot fill? | Only the remaining shifts open to the next insured agency with safety-ready workers. |

## Feature coverage

- **Requests:** composer with natural-language fill, multi-date shifts, requested Pros, safety-gated agency comparison and a visible best-fit award, budget impact, approval routing, drafts, duplicate, cancel, headcount changes, briefing edits, a shared message thread and a full audit trail.
- **Live staffing:** roster per date, geofenced check-in/out, late and no-show detection, auto-backfill, release-and-refill, manual booking from eligible Pros (certifications, availability, cap and do-not-return are enforced).
- **Work orders:** one per Pro per request, created automatically.
- **Time:** anomaly detection, bulk approval, adjust with reason codes, disputes with supplier responses, worker-swap reassignment, weekly overtime.
- **Tips:** event batches, split by hours, paste-in, approval, invoicing.
- **Invoices and payments:** weekly consolidated invoices, an at-a-glance trust check for named workers, safety, on-site time, awarded rates and approvals, line-level traceability, disputes and credits, approval → scheduled payment, remittance with automatic matching.
- **Workforce:** directory, profiles, ratings, reliability, expiring background checks, certifications, onboarding, contractual hours, favorites, do-not-return.
- **Program office:** rate cards with versioning, revisions and repricing, cost centers and venue defaults, supplier scorecards and COI compliance, policies.
- **Everywhere:** onboarding (welcome, tour, checklist), help and glossary, unified to-do list, schedule (week view and live day timeline), insights, notifications, ⌘K command palette, the Ask Mise copilot, light/dark themes, responsive layouts.

## Design

Ink-and-paper neutrals with a single lime accent, warm dark-grey dark mode, a two-level top navigation (no sidebar), and calm, purposeful motion: spring-animated nav indicators, page transitions, staggered entrances, count-up KPIs, a quiet live activity line, Pros sliding into the roster as they confirm, and form sections pulsing as the AI fills them. Everything respects `prefers-reduced-motion`.

### HyperUI MCP

`tools/hyperui-mcp/` is a small local MCP server over the [HyperUI](https://github.com/markmead/hyperui) component library (MIT). Tools: `list_categories`, `list_components`, `search_components`, `get_component`. It is registered in `.cursor/mcp.json`:

```bash
cd tools/hyperui-mcp && npm install   # then reload MCP servers in Cursor
```

HyperUI's header, stats, steps and timeline patterns informed the top navigation, KPI bands, request pipeline and activity timelines; they were rebuilt with shadcn/ui tokens so light and dark themes stay consistent.

## How it's built

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript**, **Tailwind CSS v4**
- **shadcn/ui** (Radix primitives, "nova" style) for every primitive, plus **Magic UI** components (number ticker, blur fade, border beam) from the shadcn registry; layout patterns for stats, steps and timelines adapted from **HyperUI**
- **Zustand** store persisted to `localStorage` (debounced writes, versioned) with a deterministic seed generator (`lib/seed.ts`) and a live simulation engine (`lib/engine.ts`) that advances check-ins, no-shows, backfills, time capture, auto-approvals and live fills every few seconds
- **TanStack Table** for data tables, **Recharts** via shadcn charts, **date-fns**, **lucide** icons

```
app/(app)/          routes (home, inbox, requests, schedule, timesheets, tips, invoices,
                    workforce, suppliers, rates, locations, policies, insights, settings)
components/app/     shared building blocks (page header, stat cards, badges, data table…)
components/shell/   header, five-section nav + sub-tabs, search/ask palette, notifications
components/onboarding/ welcome, tour, help & glossary, self-completing setup checklist
components/<area>/  feature components per route
lib/                types, reference data, seed, simulation engine, rules, selectors, store,
                    guide.ts (help tasks, checklist, legacy terms)
scripts/            no-em-dash.mjs copy check
video/              the launch film (Remotion project, separate package)
```

## Launch film

`video/` is a self-contained [Remotion](https://www.remotion.dev) project that renders the 55-second partner launch film frame by frame, so motion is physically sprung and never drops frames. The score is synthesized from the same timeline (`video/src/timeline.json`), which keeps every cut, chord change and UI sound on the beat.

```bash
cd video
npm install
pip install --user numpy scipy pedalboard
npm run score    # writes public/score.wav
npm run studio   # live preview at http://localhost:4848
npm run render   # writes out/mise-launch.mp4 (1920×1080, 60 fps)
```

## Data and reset

Venue names are real, publicly known Compass/Levy/Chartwells venues. People, suppliers other than Instawork, cost-center codes, rates and every record are fictional and generated for the demo. Data regenerates automatically each day (so dates always look current) and can be reset any time from the user menu, Settings or `⌘K → Reset demo data`.

## What a production version needs

Single sign-on and roles, a real backend and database, integrations with staffing agencies, point-of-sale or attendance feeds, SAP S/4HANA or NetSuite for AP, Workday for conversions, Slack/email notifications, legacy history import, audit and data-retention controls, and load testing for program-wide scale.
