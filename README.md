# DAMO Prism

*Estimation as a Service. Formerly the DAMO Estimation Workflow.*

A step-by-step version of the DAMO estimator for deal reviews. It shows management how the estimate is built, one step at a time, in three stages and a review: **Stage 1** sizes the team (coverage, volumetrics or thin slices, the current team as a reference range); **Stage 2** qualifies it (skill type, location, managerial capacity, complexity, seniority and contingency) to give the **run team**; **Stage 3** adds transformation capacity and productivity. Year 1 shows two lines: the run team and the transformation capacity. Each step adds inputs, shows its working with the deal's own numbers, and records assumptions and risks. The fixed FTE bar at the bottom shows how each stage changes the team.

It is a companion to [`stepri-qc/damo-estimator`](https://github.com/stepri-qc/damo-estimator) and uses the same two sources:

| Tag | Source |
|---|---|
| `[F]` | DAMO Solution Estimation Framework (PDF) |
| `[P]` | AI_Works DAMO Team Pricing Sheet (xlsx) |

Values not taken from either source are marked `proposed`.

- **Source:** `index.html`. It is one self-contained file with no build step. State is saved in the browser's localStorage.
- **User guide:** `guide.html` (https://damo-estimation-workflow.netlify.app/guide.html): an interactive walk-through of every stage with calculators that use the tool's formulas, short quizzes, a worked example (`docs/example-acme-retail.damo.json`, open it with Open file), FAQ and glossary. Progress is kept in the reader's browser. The tool's header links to it, and the guide's "Open Stage N" buttons deep-link into the tool with `index.html#stage=N`.
- **Deploy:** Netlify project `damo-estimation-workflow` (https://damo-estimation-workflow.netlify.app), linked to this repository: every push to `claude/estimation-workflow-tool-fpuoqu` redeploys it. Netlify serves the repo root and the extraction functions (`netlify.toml`); `ANTHROPIC_API_KEY` and `INTAKE_PASSPHRASE` are set as secrets on the project, so the site is open to view but Extract inputs needs the passphrase (ask the project owner). See [Documents and AI extraction](#stage-0-documents-and-ai-extraction).

**Step 2 warnings.** A tower that adds no FTE says why, on the tower card and in the working: no demand entered yet (answer ticket history, or the estate's structural size), we provide none of L1, L2 or L3, or its inputs add up to zero. When the base team from Step 1 is larger than the team the towers need, a note says that coverage sets the team and that towers change the total only once they pass it.

## Inputs start blank from step 2

Step 1 opens with a working base-team example (24×5 laid out over India and Romania) so the coverage maths is visible at once. From step 2 onward nothing is pre-filled. The deal team supplies every input:

- **Step 2:** no towers. A new tower has no name, unanswered questions, blank numbers and no special roles. Until a tower's questions are answered it adds nothing.
- **Step 5:** no live windows picked.
- **Step 10:** AI adoption not chosen (Low is used until it is).
- **Step 8:** complexity not chosen (no contingency until it is).
- **Step 11:** term not chosen (1 year is shown until it is).
- **Step 3:** the existing team is blank.
- **Steps 2 and 9:** the sizing basis (volumetrics or thin slices), life stage, client appetite and pathway clarity are unanswered, which leaves the numbers unchanged.
- **Suggested risks** for steps 2–9 are listed but switched off, so none changes FTE until turned on.
- **Kept as defaults:** the agreed conventions (on-call 15%, SDM 1:12, framework benchmarks).

The "Default example" paragraphs below use sample inputs to show the maths. They are not what the tool pre-fills.

## Base team vs work team

The tool builds the team twice, from two different questions, and keeps the larger:

| | Base team (step 1) | Work team (step 2) |
|---|---|---|
| Question | How many people does it take to keep someone on duty in every hour? | How many people does the work take? |
| Driven by | Support window, each location's working and on-call windows, people on duty | Tickets (or estate size / users), service levels, enhancements, skill sets |
| Ignores | Ticket volume | Whether every hour is covered |

Both get the same utilisation and leave backfill. At step 4 they are compared, not added:

- **Work team larger:** the work team is the delivery team. Its people staff the shifts as part of doing the work, so the base team adds nothing on top.
- **Base team larger:** the work doesn't need that many people, but the shifts do. The team is lifted to the base team; the spare time is available for enhancements or transformation.
- **AI engineers are the exception:** they build automation and don't staff shifts, so they are left out of the comparison and always kept on top.

So `delivery team = max(work team, base team)`, and `Stage 1 team = delivery team + SDM`. AI engineers (AIOps) belong to transformation capacity in Stage 3, not to the run team. Stage 2 then tests that team: specialist skill cover uses the spare capacity first and adds headcount only for the rest (step 5), the SDM is re-based on the final delivery team (step 7) and contingency is added (step 8). That is the **run team**. Stage 3 adds transformation capacity on top (step 10). The extra headcount each step adds is shown in the final build-up.

## Steps

| # | Stage | Step | Status |
|---|---|---|---|
| 0 | | Documents: upload RFP, incident dump, meeting notes, others; Claude proposes inputs | Built |
| 1 | 1 · Size the team | Coverage: support window, customer time zone, each location's working and on-call windows: the base team | Built |
| 2 | 1 | Service towers (AMS, IMS, DMS, AI platforms): volumetrics or thin slices per tower, L1.5, SRE and AIOps scope | Built |
| 3 | 1 | Current team: today's team as a reference range against ticket volume and the base team | Built |
| 4 | 1 | Required team size: work team vs base team (larger wins), SDM 1:12, binding dimension: the **Stage 1 team** | Built |
| 5 | 2 · Qualify the team | Skill type: is the Stage 1 team enough, or is headcount added? | Built |
| 6 | 2 | Location distribution of the team and the overlap between locations | Built |
| 7 | 2 | Managerial capacity: SDM ratio and location, tech lead | Built |
| 8 | 2 | Complexity, seniority pyramid, grade-mix check and contingency: the **run team** | Built |
| 9 | 2 | Team shape: Year 1: the run team and the Year 1 team by role (DAMO roles guidance map) | Built |
| 10 | 3 · Transformation and productivity | Transformation capacity: scenario, life stage, client appetite, POD share | Built |
| 11 | 3 | Capacity ramp: term, YoY savings (credited by pathway clarity), transition | Built |
| 12 | 3 | Team shape by year: the team by role for every year of the term | Built |
| 13 | Review | Final fact check against the existing team, assumptions register, approval | Built |
| 14 | Review | Commercial position: proposed final number, risks, commercial options | Built |

The step numbers are what you see on screen. Internally each section keeps its original id (for example risks and assumptions for skill coverage are stored under `s3`), so saved estimates and deep links (`index.html#stage=N`) keep working.

## Run team and transformation capacity

The engine runs twice. `runCompute()` runs it with no transformation POD and no AI engineers: that is the **run team**, shown by Stages 1 and 2 (their views render with that result). The normal run adds the POD, the AI engineers (AIOps), and the SDM and contingency that follow them. **Transformation capacity = Year 1 team − run team.** Year 1 is therefore two lines, run team plus transformation capacity, in the FTE bar, the final build-up, the summary, the report and the Excel Years sheet. The same two lines are shown for every year of the term (the transformation line is net of any AIOps savings, so it can fall below zero in later years).

## Thin slices (AMS and DMS)

AMS and DMS towers ask **Proceed with volumetrics or thin slices?** A thin slice is an application (AMS) or a data product (DMS), sized by criticality: Critical, Important, Standard. Each tier carries a fixed FTE per slice from Benchmarks and assumptions (proposed defaults: AMS 0.6 / 0.3 / 0.12, DMS 0.5 / 0.25 / 0.1, 35% of a slice is L3). The chosen basis drives the tower's FTE; if the other basis is filled in too, Step 2 shows a cross-check table and flags a difference over 25% (proposed). IMS and AI towers use volumetrics only. A tower sized from thin slices does not count towards "volumetrics available" for the transformation scenario. Thin slices are entered by hand; the extraction does not propose application lists yet.

## Life stage, appetite and pathway clarity

Three answers in Step 10, all proposed and editable in Benchmarks: **application life stage** (growth 125%, steady 100%, sunset 50%) and **client appetite** (low 50%, medium 100%, high 125%) scale the scenario's POD share (capped at 50%); **clarity of improvement pathways** (clear 100%, partial 75%, unclear 50%) sets how much of the Year 2+ savings target is credited (flat percentage, or the AIOps use-case deflections). Unanswered means 100%, so nothing moves until answered. A POD share or a savings percentage typed by hand overrides the multipliers.

## Current team as a reference range

Step 3 shows today's team as a range (today ± the tolerance, default 10%). It never drives the number; Step 4 states whether coverage or ticket volume is the **binding dimension** and whether our Stage 1 support team sits below, inside or above the range.

## Indicative team shape

The DAMO roles guidance map turns the team into an indicative shape, on its own screens: **Step 9, Year 1** (the run team beside the Year 1 team including transformation capacity; the screen a solution architect reviews) and **Step 12, by year** (Year 1 is the full team; later years scale every role with the year's team, except the AI engineers (AIOps), who stay).

The shape groups the same FTE, so no total moves. **Each tower has one default role** that takes its FTE: System Support Engineer (AMS), Infra Support Engineer (IMS), Data Ops Engineer (DMS) and AIOps Engineer (agentic, which also holds the AI engineers where AIOps is in scope). Everything else is a **special role** typed in Step 5: Developer (AMS), Infra Engineer (IMS), Data Engineer (DMS) and AI/ML Engineer (agentic) come out of the tower's own L3 effort, so the total does not change; Quality Analyst, Business Analyst, Solution Architect and Mobile Developer are added on top. Shift cover added to reach the base team is spread over the default and carved-out roles. **Roles appear only where they are in scope, sized by what you type:** each tower asks whether **L1.5** is in scope (then you type the Product Support Engineer FTE for that tower, carved out of its L2), whether **SRE** is in scope (then you type the SRE FTE, carved out of its L3) and whether **AIOps** is in scope (the AI engineers at the AIOps ratio). The Transformation POD's automation and CI/CD work shows as its own Transformation engineers row. Nothing is assumed: a Yes with no FTE typed shows no role. The Solution Architect is 10% of an FTE once per deal (0.8 hours of an 8-hour day), carved out of the default roles (capped at 60% of them). The SDM ratio default is 1 per 12 FTE, as in the map.

## Usage and cost logging

The extraction function writes one small record per run to a Netlify Blobs store (`damo-workflow-usage`): time, outcome, model, input and output tokens, cost, run time, and the number, type and size of the documents. It never stores document text or the answer. `usage.html` (on the same site) shows the report, and `/.netlify/functions/extract-usage` returns it as JSON or, with `&format=csv`, one row per run.

Two costs are reported separately:

- **AI extraction cost:** tokens times the list price of the model that answered (`lib/usage.mjs`, `PRICES`). Set `PRICE_MULTIPLIER` (for example `0.8`) for a contract discount.
- **Tool usage cost:** extraction requests, function run time and estimated status checks (the page polls every 2 seconds), priced from your own rates: `HOSTING_MONTHLY_USD` (a flat monthly platform fee, prorated to the period), `USD_PER_FUNCTION_SECOND` and `USD_PER_THOUSAND_INVOCATIONS`. With none set, usage is shown and no tool cost is calculated.

Site settings: `USAGE_ADMIN_KEY` turns the report on (it is off without it) and is the key `usage.html` asks for. A wrong passphrase is logged as a run with no tokens, so abuse shows up in the report.

## Step 0: documents and AI extraction

The tool opens on an optional **Documents** page. Add what you have for the deal, run **Extract inputs**, and Claude proposes inputs for every stage. You tick what to apply; nothing changes until you do. **Skip to step 1** ignores the page.

| Card | Accepts | What happens in the browser |
|---|---|---|
| RFP | PDF, DOCX, TXT, MD, pasted text | Text extracted (pdf.js, mammoth) |
| Incident dump | CSV, XLSX, XLS | Summarised locally: date range, tickets a month, incidents vs requests, priority mix, top 20 groups, first rows. Only this summary is sent to Claude, not the raw export. |
| Meeting notes | PDF, DOCX, TXT, MD, pasted text | Text extracted |
| Others | PDF, DOCX, XLSX, CSV, TXT, MD, JSON, pasted text | Text extracted (spreadsheets as CSV per sheet) |

When a proposed tower is the same kind as a tower you already have, the proposal shows a choice: **Update** that tower (only the fields the proposal lists are changed) or **Add as a new tower**. Updating is the default, so applying the same documents twice does not double the tower.

A pasted **Prism Library reference sheet** (it starts with `# Reference:` and `Source: Prism Library`) is read directly, without the AI: its tower, tickets a month, coverage, term and assumptions become proposals, and assumptions the reference deal found broken or at risk are left out. The sheet describes another deal, so every proposal is for you to check. Mixed with other documents, the AI reads those and the two sets of proposals are combined.

Documents stay in memory for the session and are not saved to localStorage.

**What Claude proposes**, each with a short quote and the document it came from: deal name, coverage window (hours, days, out-of-hours active or on-call, weekends), service towers (kind, name, volumetrics or structural counts or MAU, estate, skill sets), AI adoption, complexity, term, existing team, assumptions and risks by stage, and open questions for the client. Applied risks arrive switched off at 0%, and open questions are added to the step 1 assumptions. The prompt and the cleaning of Claude's reply (allowed values, numeric ranges, skill ids) live in `extract-prompt.mjs`, shared by every route.

**Three routes**, picked automatically:

1. **On Netlify:** the page posts the text to `netlify/functions/extract-inputs-background.mts`, which calls Claude (`claude-opus-5-5`, streaming, server-side fallback enabled) and writes the result to Netlify Blobs; the page polls `extract-status.mts`. Limit 600,000 characters.
2. **In the claude.ai artifact viewer:** runs on the viewer's own Claude account after they allow it. Limit about 250,000 characters.
3. **Anywhere else (or as a fallback):** **Copy prompt**, paste it into a Claude chat, paste the reply back, **Use this reply**.

### Netlify setup

Set these in Site configuration → Environment variables:

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key. It stays on the server; the page never sees it. |
| `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `EXTRACTION_MODEL` | Optional, EKS server only (`server/`) | Use an Anthropic-compatible gateway. The token is sent as a Bearer token and wins over `ANTHROPIC_API_KEY`. `EXTRACTION_MODEL` sets the model (default `claude-opus-5-5`). With a base URL set, the plain request is used (no beta flag, fallbacks or effort); set `EXTRACTION_SIMPLE_REQUEST=0` to send them. Not used by the Netlify functions. |
| `INTAKE_PASSPHRASE` | Recommended | If set, the page must send this passphrase (users type it once; it is remembered in their browser). Stops anyone with the URL spending your API credit. |

Netlify installs `package.json` dependencies (`@anthropic-ai/sdk`, `@netlify/blobs`, `@netlify/functions`) at build time. There is no build command.

## Stage 1 · Step 1: coverage and base team

Inputs:
- **Where the opportunity is from:** the region (Europe, APAC, North America, India and Middle East), the customer location and the customer's **time zone** as a UTC offset (filled from the location, editable). The region decides which delivery locations are offered and selects its defaults.
- **Support window:** days a week and hours a day, with presets from 8×5 to 24×7, and the time it **starts**. The window is on the customer's clock.
- **Contracted hours per FTE a week:** 40 by default.
- **Utilisation per resource:** 85% by default ([F] G6). Each person is productive 85% of contracted hours.
- **Minimum L2 and L3 people on duty in every staffed hour.**
- **Delivery locations:** ticked from the region's list (Europe: EU onshore, Romania nearshore, India offshore; APAC: Singapore, Australia, China, India offshore; North America: LATAM, Ecuador, Brazil nearshore, India offshore; IME: India only). Each has its own UTC offset, leave days and public holidays. Changing the selection re-lays out the windows.
- **Support asked for:** at the top of the support window, choose **Active–active** (every hour staffed, in each location's working hours) or **Active–passive** (each location staffed in its own daytime, the hours outside 07:00–20:00 local on call for P1). The choice lays out the windows for you and is kept when the region, delivery locations or coverage preset change. Any window can still be edited by hand.
- **Working windows by location:** each location has one or more windows in its own local time. A window is **Active** (fully staffed, real FTE) or **On-call (P1)**, where people are reachable for P1 incidents only. **Best fit to local daytime** hands each half hour of the support window to the selected location where it is closest to 13:00 local (a window that follows the sun); **Best fit, nights on call** also makes hours outside 07:00–20:00 local P1 on call; each location has Day, Late and Night preset buttons; **Lay out evenly** cuts the support window into slices of at most 8 hours and hands them to the locations in order. For 6- or 7-day coverage, weekends can be Active (as per the windows) or On-call all day.

A compact **live coverage strip** is pinned (sticky, below the step navigation) at the top of the step 1 inputs and redraws on every change, so a gap or overlap shows up while you edit a window, without scrolling to the full timeline below. The **coverage timeline** puts the customer's clock across the top and one row per location below, each cell showing that location's local time. Green is active, orange is on call, red is uncovered. It reports how many support-window hours have someone active, how many are covered on call only, any hours nobody covers (with the time ranges), the overlap hours where two locations are active at once, and any hours worked outside the support window. Uncovered hours raise a warning on the step.

Calculation (framework p.3 coverage modifier, worked in hours and split by location):

```
a  = support window hours a day × days a week                 window hours to cover each week
a′ = active window hours a week + on-call window hours a week × on-call %    staffed hours (a′ = a when every hour is active and nothing overlaps)
b  = contracted hours per FTE a week                          hours one FTE works
c  = L2 on duty + L3 on duty                                  people on duty
roster(loc, tier) = staffed hours at loc × people on duty(tier) ÷ b
                                                              Σ roster = (a′ × c) ÷ b
utilised(loc)     = roster ÷ 85% utilisation
backfill(loc)     = utilised ÷ availability                   availability = (260 − leave − holidays) ÷ 260
risk              = backfill × (1 + Σ active risk %)
people            = rounded up per location and tier (or per location, total, or not at all)
```

With equal 8-hour windows this is exactly the framework's `(shifts × days × people) ÷ (shifts one FTE covers)`: 24×5 with 2 people on duty is (120 × 2) ÷ 40 = 6.0 FTE. **Overlap is paid for:** hours where two locations are both active are staffed twice and counted, as are hours worked outside the support window. The framework check shows the window-only figure and how on-call, overlap or extra hours move the roster.

Example (the Minneapolis customer, UTC−5, 24×5): Ecuador works 09:00–19:00 local; India works 09:30–19:30 and is on call 05:30–09:30 local. On the customer's clock India is active 23:00–09:00 and on call 19:00–23:00: 20 hours active, 4 on call only, no gap and no overlap.

The default example is 24×5 laid out evenly over India and Romania: India works two 8-hour windows, Romania one. The roster is 6.0 FTE, 7.06 after 85% utilisation, 8.0 after leave backfill, and 8.65 after an 8% risk modifier.

Utilisation covers productive time (training, meetings, admin). Leave and holidays are a separate step, so the two don't overlap.

This base team is the **floor**. Step 2 builds a second team from the ticket volume, and step 4 compares the two: the larger one is used.

Rounding to whole people is applied once, to the final team, after all steps.

Estimates saved with the old shift map open as windows: each shift becomes one window for the location that covered it, and a skill set's live shifts become live windows. The roster is unchanged.

### On-call allowance from P1 volume

The on-call allowance can be a flat % (default 15%) or **From P1 volume** (`proposed`):

```
busy share      = P1s a month (all hours) × hours per P1 call-out ÷ 728 hours a month
on-call allowance = standby % (default 10%) + busy share
```

P1s arrive around the clock, so the busy share doesn't depend on how many shifts are on call. The incident dump summary on the Documents page shows the P1 count and months, and extraction proposes P1s a month; applying it switches the mode to From P1 volume.

### Assumptions and risks
- Auto assumptions (A1–A7) are generated from the inputs and cite their source. Assumptions added during the review (U1…) can be edited.
- Each risk has a title, an impact/mitigation note, an on/off toggle and an **FTE modifier %**. Active modifiers are added up and applied to the stage's post-backfill FTE. A 0% risk is recorded but adds no FTE.

## Stage 1 · Step 2: service towers and complexity

Towers are **AMS**, **IMS**, **DMS** ([F] 1.3 service functions) or **AI platforms** (AI platforms and agentic solutions). Each tower's demand comes from up to three questions, asked in order:

1. **Do you have volumetric data?** If yes, enter incidents + service requests a month.
2. **If not, do you know the estate's structural complexity?** If yes:
   - AMS: T-shirt size the apps S–XXL at 4 / 10 / 17.5 / 30 / 50 tickets per app a month ([F] Sc.1 Step 1 midpoints).
   - IMS: complexity points = environments × 1 + hosting platforms × 1.5 + databases × 1 + security in scope 3, × 4.5 tickets per point.
   - DMS: complexity points = data products × 1 + pipelines × 0.5 + integrations × 1 + upstream × 0.75 + downstream × 0.75, × 3.4 tickets per point.
   - AI platforms: complexity points = AI agents / agentic workflows × 2 + models served × 1.5 + tool/system integrations × 0.5 + knowledge sources (RAG / vector stores) × 0.75 + regulated or high-risk use cases 4, × 3.5 tickets per point (`proposed`). The estate choice is Managed AI services (APIs) at the modern non-ticketing rate, or Self-hosted models / custom agents at the complex rate.
3. **If neither is known:** tickets = monthly active users × incident rate (0.5–2%, default 1%, [F] Sc.1 Step 2). The card also shows the **implied complexity**: equivalent medium (M) apps, and an estate band (small < 25 tickets a month, medium < 75, large < 200, very large above; `proposed`).

A path marker on each card shows which route is in use. Assumption B4 lists each tower's route, and the MAU route is called out as the least certain.

IMS/DMS weights and tickets per point come from the `damo-estimator` structural-complexity model (pipelines weight is new); the AI platform weights are new. All are `proposed` and editable in the stage's Benchmarks panel.

**With ticket history, a tower captures three volumes, the same as the damo-estimator:** incidents, service requests and change requests a month. Incidents carry a **severity mix** (P1 to P4, counts or %) and run through the L1/L2/L3 cascade below. Service requests carry a **complexity mix** (Low / Medium / High, counts or %; blank uses 60 / 30 / 10) and are costed at the **SR ARE by complexity** (Low 0.25 h, Medium 0.5 h, High 1.5 h): Low goes to L1, Medium to L2, High to L3, and a level that is not ours passes its SRs to the next level we own. Change requests carry their own complexity mix (blank 50 / 35 / 15) and the **CR ARE by complexity** (Low 4 h, Medium 8 h, High 16 h), as planned engineering work on L3 when we own L3, else L2, and none if we own neither. SRs and CRs count in the tickets a month but never enter the incident cascade or the severity mix. The three AREs (incidents by level, SRs by complexity, CRs by complexity) are in the stage's Benchmarks panel and are listed under Deviations when changed. The extraction (`extract-prompt.mjs`) now also reads change requests a month and the SR and CR complexity mixes. The enhancement pool (hours a month) is separate from change requests.

Every route ends in tickets a month, which then follow the framework effort chain ([F] 1.1, 1.4, 1.5, p.3), for incidents:

```
L2 tickets = tickets × 70%            L1 is the client's service desk
L3 tickets = L2 tickets × 20%
A          = (incidents: L2 × 3h + L3 × 10h, plus SR and CR hours by complexity) ÷ 85% utilisation
B          = A × 25% (modern) or 35% (complex legacy)
tower FTE  = (A + B) ÷ 160 hours a month, keeping the L2/L3 split from the effort
```

**Special roles** form the bottom layer, entered in **step 5 (Skill type)** per tower. Every tower has one default role that takes its FTE and that the base team has on every shift (System Support Engineer for AMS, Infra Support Engineer for IMS, Data Ops Engineer for DMS, AIOps Engineer for agentic). A special role has a typed FTE: Developer (AMS), Infra Engineer (IMS), Data Engineer (DMS) and AI/ML Engineer (agentic) are carved out of the tower's L3 (capped at what is there after any SRE), and Quality Analyst, Business Analyst, Solution Architect and Mobile Developer are added on top as L3 specialist effort. Skill sets with shares no longer exist: an estimate saved with them opens with them removed (a note says how many) and each tower's default role takes its whole FTE.

The tower team is built from the work alone. It does **not** sit on top of the base team:

```
backfill factor    = Σ over locations (roster share ÷ availability)   when leave backfill is on, else 1
support FTE        = tower FTE × backfill factor × (1 + Σ active stage 2 risk %)
```

Leave and holiday backfill is applied to the tower team the same way as to the base team, weighted by where the tower FTE sits, so the two teams are compared like for like at step 4. Step 5 compares each specialist's floor with its backfilled FTE for the same reason.

Tower FTE is spread across locations in the same proportion as the step 1 roster.

**SRE.** Every tower asks whether SRE (reliability engineering) is in scope. If yes, you type the SRE FTE for that tower; it is carved out of the tower's L3 (capped at the L3 FTE) and the tower's other skill sets share the rest. It changes the role mix, not the headcount. Extraction proposes it when the documents name SRE, SLOs or error budgets.

**Governance.** The Service Delivery Manager is sized in step 4 at 1 per 12 delivery FTE and appears in the team by role under Governance.

**AIOps per tower** ([F] Part 3, Sc.4 Step 3). Each tower asks *Is AIOps in scope for this tower?* If yes, AI engineers are embedded at the framework ratio: one per N support FTE of that tower, to build intelligent alerting, RCA automation, ticket auto-classification and self-healing.

```
support FTE(tower) = tower FTE × backfill factor × (1 + Σ active stage 2 risk %)
N                  = 4 for Low client AI adoption, 8 for Moderate (Scenarios 1/3 vs 2/4)
                     8 flexes to 6 when the AIOps towers carry over 20 support FTE; overridable
AI engineers       = Σ support FTE(towers with AIOps in scope) ÷ N
stage 2 tower team = support FTE + AI engineers
```

The ratio panel appears once a tower has AIOps in scope. It sets client AI adoption, the same input step 10 uses for the scenario. AI engineers count as L3 engineering, are spread across locations like the step 1 roster, get no shift cover in step 5, and are kept on top of the base team at reconciliation (they build automation; they do not staff shifts). The Documents page proposes AIOps scope per tower when the documents mention it.

Default example: AMS "Customer apps" (2 S, 3 M, 1 L apps), IMS "Cloud platform" (4 environments, 2 hosting platforms, 4 databases, security) and DMS "Analytics platform" (4 data products, 10 pipelines, 3 integrations, 3 upstream, 2 downstream). That is 172 tickets a month and 5.53 tower FTE, or 6.36 after 15% risk.

### Who provides each level, SLA, and where counts are measured

**Ownership.** Each tower sets who provides L1, L2 and L3: us, the client, another supplier or a product team. Presets: *Client L1 · us L2 + L3* (used until you choose), *Us L1–L3*, *Us L2 only*, *Us L3 only*. Only the levels we provide are sized. L1 effort is the tickets resolved at L1 (30% of inflow) at 0.25 h each ([F] p.3), counted in the support tier with L2.

**Coordination uplift** (`proposed`, from damo-estimator): every adjacent pair of levels with different owners is an interface, and each adds 4% to our ticketing effort. Client L1 with us on L2 + L3 is one interface (+4%); us on L2 only between client L1 and a supplier's L3 is two (+8%).

**SLA** (optional, per tower): P1 and P2 response and restore targets in minutes, an availability class (A 95% to E 99.95%), and Gold / Silver / Bronze presets. Stringent targets add effort on L2/L3 ([F] Sc.3 Step 2: "+20–30%"), graduated as in damo-estimator:

| Condition | Uplift |
|---|---|
| P1 response ≤ 15 min | +25% on L2 and L3 |
| P1 response ≤ 30 min | +12% on L2 and L3 |
| Availability ≥ 99.9% | +10% on L2 and L3 |
| P1 restore ≤ 2 h | +10% on L3 |
| Cap | 40% |

Blank targets mean "not stated" and add nothing.

**Priority mix** (optional, P1–P4 counts or %): with counts at L1, each priority enters L1 / L2 / L3 by a routing matrix (`proposed`, from damo-estimator: P1 0/40/60, P2 10/60/30, P3 55/40/5, P4 85/15/0), then the L1 stream cascades as usual.

**Where the counts are measured** (ticket history only):

| Counts measured at | L1 tickets | L2 tickets | L3 tickets |
|---|---|---|---|
| All tickets (service desk, L1) | inflow × 30% | inflow × 70% | L2 × 20% |
| Tickets reaching L2 | unknown | tickets | tickets × 20% |
| Tickets reaching L3 | unknown | unknown | tickets |

Unknown volumes at a level we provide raise a warning. Proxy routes (T-shirt sizing, MAU) are L1-inflow benchmarks. If no tower has us on L3 (or L2) while the base team still puts L3 (or L2) on every shift, Stages 1 and 2 warn.

**Enhancements and minor change** (optional, hours a month per tower, only when we provide L2 or L3) become effort C = hours ÷ 85% utilisation, added as L3 work (L2 when we don't provide L3): `tower FTE = (A + B + C) ÷ 160`.

## Stage 1 · Step 4: required team size (reconcile and SDM)

**Reconciliation.** The team from the work is compared with the base team from coverage:

```
work team     = step 2 (towers, with leave backfill and risk), without AI engineers
base team     = step 1 (coverage, with utilisation, leave and risk)
delivery team = max(work team, base team) + AI engineers
lift          = max(0, base team − work team)     spread over the base team's locations and tiers
```

- **Work team larger:** it is kept, and the shifts are staffed from within it.
- **Work team smaller:** it is lifted to the base team size. The page shows the spare share of time, which is available for enhancements or transformation.

The comparison is shown as bars and a table (base team, team from the work, delivery team used) with a generated sentence saying which one sets the team and by how much.

**SDM only**, at the DAMO convention of one Service Delivery Manager per 12 delivery FTE (the DAMO roles guidance map; editable):

```
SDM     = delivery team ÷ 12
stage 5 = SDM × (1 + Σ active stage 5 risk %)
```

The SDM is a separate governance tier (not L2/L3) and is based in one step 1 location: onshore by default, then nearshore, then the first location. With whole-person rounding, SDMs round to the nearest person (at least one), not up.

Default example: the work team is 9.70 and the base team is 8.65, so the work sets the team (+12%) and 9.70 is kept. The SDM is 9.70 ÷ 12 = 0.81. If the work team were smaller, for example 2.59 with only one small tower, it would be lifted by +6.05 to 8.65.

**The Stage 1 team** is `delivery team + SDM`. It is shown on its own here, at the triangulation step, and as the first anchor of the final build-up. Stage 2 then tests it: skill cover is absorbed by any spare capacity or adds headcount (step 5), transformation is added after spare capacity (step 10), the SDM is **re-based** on the final delivery team, and contingency is added (step 8). The final build-up table lists every one of these as a row, so the Year 1 number can be walked back to the Stage 1 team.

## Stage 1 · Step 3: current team as a reference range

This step **does not change the estimate**. It puts three independent views of the same team side by side:

| View | Where it comes from |
|---|---|
| Ticket volume | Step 2: the tower effort with leave backfill and risk, without AI engineers |
| Base team | Step 1: the support window's floor |
| Existing team | What the client runs today: L2, L3 and SRE / automation (entered here) |

The Stage 1 number is still the larger of the first two, plus the SDM. The existing team is entered here: L2, L3, SRE / automation, managers and other roles, where the numbers came from (org chart, RFP / handover pack, or verbal estimate) and a tolerance (default ±10%). Bars show the three views next to our Stage 1 support team; a table compares each tier (L2, L3 incl. SRE / automation and AI engineers, SDM, other) with Stage 1.

The generated verdict says **which view sets the number** (the support window or the ticket volume), whether the existing team agrees within the tolerance (above, below or consistent, with what to check in each case), and how far apart the three views are. If the existing team is blank it says the triangulation is incomplete. Verbal estimates are flagged as directional. The same existing-team numbers feed the final fact check at step 13.

## Stage 2 · Step 5: skill type, is the Stage 1 team enough?

Each tower's default role is on every shift through the step 1 roster, so it adds nothing here. For each **special role** a **shift matrix** asks what is required on each shift: one row per working window from step 1, one column per special role, and the number of people who must be **live** in that cell (blank = on call; "All live" and "Clear" fill a column). A special role with no entry in any window is not tested for cover. In the remaining windows a role that is in use is **on call**, counted as 15% of a staffed shift (`proposed`, editable). Estimates saved before the matrix keep their live windows and head count.

```
floor(skill, loc) = (live window hours at loc × people + other window hours at loc × on-call %) × days ÷ b ÷ 85% utilisation
                    ÷ availability(loc) when leave backfill is on
floor(skill)      = Σ floor(skill, loc)
have(skill)       = step 2 FTE after absorption and risk
top-up            = Σ max(0, floor − have)
stage 3           = top-up × (1 + Σ active stage 3 risk %)
```

Specialists sit in the locations covering their windows. Top-up keeps the skill's L2/L3 effort split.

**Is the Stage 1 team enough?** A verdict card compares the skill cover with the **spare capacity** in the Stage 1 team (the base team above the work team, `lift` at step 4):

```
added headcount = max(0, skill cover − spare capacity)
```

If the base team already has spare time, skill cover is absorbed by it and nothing is added; otherwise the missing FTE is added and shown as a bridge row ("the Stage 1 team is not enough: +X FTE").

Default example: Database (IMS) and Data engineering (DMS) are live on shift 1 (India) and on call on shifts 2–3. Each has a floor of 1.72 FTE. Database has 0.47 FTE of effort, so it adds 1.25. Data engineering already has 1.98, so it adds nothing. With a 5% risk, step 5 adds 1.32. The run team from the work is 6.36 + 1.32 = 7.68 FTE.

## Stage 3 · Step 10: transformation capacity

The framework scenario ([F] Part 2–3) is worked out, not picked:

- **AI adoption** is an input: Low or Moderate.
- **Volumetrics available** is derived from step 2. It counts as available when towers sized from ticket history carry at least 50% of the tower FTE.

| | Volumetrics unavailable | Volumetrics available |
|---|---|---|
| **Low AI** | Scenario 1: POD 10–15% (12.5), AIOps 1:4 | Scenario 3: POD 10–15% (12.5, `proposed`), AIOps 1:4 |
| **Moderate AI** | Scenario 2: POD 15–20% (17.5), AIOps 1:8 | Scenario 4: POD 20%+ (20), AIOps 1:8 |

```
support team = steps 2 and 5 without the AI engineers
POD          = support team × transformation %     (scenario midpoint, overridable)
AI engineers = added in step 2 for towers with AIOps in scope
added        = max(0, POD − AI engineers)          AI engineers sit inside the Transformation POD
stage 4      = added × (1 + Σ active stage 4 risk %)
```

With no tower in AIOps scope the whole POD is added. With AIOps in scope, the POD adds only what the AI engineers don't already cover, so AIOps is never counted twice.

Transformation FTE is counted as L3 and spread across locations like the step 1 roster. The stage also shows the scenario's guidance from the comparison matrix (confidence, Y1 contingency, team shape, AIOps timeline, commercial model, volume band clause, YoY savings target) for the deal review.

Default example: no tower has ticket history and AI adoption is Low, so this is Scenario 1. The support team is 7.68 and the POD is 0.96. If AIOps is in scope for all three towers, step 2 already added 6.36 ÷ 4 = 1.59 AI engineers, which exceed the POD, so step 10 adds nothing. Without AIOps, step 10 adds the POD: 0.96, or 1.01 with a 5% risk. (Examples from step 4 on were worked before AIOps moved into the towers; they show the method, not these exact numbers.)

## Stage 2 · Step 8: complexity, seniority and contingency

**Engagement complexity** is a deal-team input. It sets both the grade pyramid and the contingency:

| Complexity | Lead : Senior : Consultant | Contingency |
|---|---|---|
| Low: modern estate, standard CRUD apps, few integrations | 1 : 2 : 4 | 5% |
| Medium: mixed estate, several integrations, some regulated flows | 1 : 2 : 3 | 7.5% |
| High: legacy or regulated core, heavy integrations, data/ML pipelines | 1 : 2 : 2 | 10% |

1 : 2 : 4 is the DAMO manual-estimation pyramid. The Medium and High ratios are `proposed`. The pyramid and the contingency % can both be overridden.

```
delivery    = delivery team + SDM (step 4, re-based on the final delivery team)
contingency = delivery × contingency %                  (5–10%, [F] 1.6)
stage 6     = contingency × (1 + Σ active stage 6 risk %)
```

- **Contingency** is added as FTE and spread across L2/L3 in each location, in proportion to each cell.
- **The pyramid sets the grade mix only.** It splits the team into Lead / Senior / Consultant without changing headcount (`gradeSplit()`). Only the SDMs and a tech lead on L3 are Lead: L2 has Seniors and Consultants only, and L3 takes the pyramid's Lead share as the tech lead. Lead is never above Senior overall: the tech lead gives way first, and if the SDMs alone still outnumber the Seniors, Consultants are lifted to Senior. Whole people per grade (`gradePeople()`) are allocated by largest remainder with the same cap. If a tower has no skill set, its FTE is not in the grade and location tables and Step 8 says so.

**Does the grade mix fit the windows?** A check card asks for a minimum number of Lead or Senior people on duty in every staffed hour (default 1) and compares it with the Lead + Senior FTE the pyramid gives: `needed = minimum × staffed hours a week ÷ contracted hours ÷ utilisation × backfill`. It only reports: seniority never changes headcount. If it is short, move the pyramid up, name seniors as on-call cover, or lower the requirement. Low complexity leans on juniors (1:2:4), high complexity on seniors (1:2:2).

Default example (Medium): 10.91 × 7.5% = +0.82, so the team is 11.7 FTE, rostered as 13 people (6 L2, 6 L3, 1 SDM). By grade: 3 Lead (including the SDM), 4 Senior, 6 Consultant.

### Estimate confidence ([F] Annexure 1)

Step 8 scores the framework's nine confidence drivers from 1 to 5, with the Annexure's rubric shown for the chosen score:

| Driver | Weight |
|---|---|
| Ticket volumetrics and cross-functional demand | 22 |
| SLA/SLO tier | 15 |
| Coverage model | 13 |
| Portfolio complexity index | 12 |
| Transition and incumbent handoff risk | 10 |
| Domain criticality | 10 |
| Change intensity and enhancement load | 8 |
| Tech stack and tooling | 6 |
| AIOps maturity | 4 |

`score = Σ weight × score ÷ 5` (out of 100). Bands: 0–39 Low, 40–59 Medium, 60–79 High, 80–100 Highest, with the Annexure's Year 1 contingency guidance (about 10%, 8–9%, about 8%, 5–6%); the page flags when the contingency used is outside it. Scores are suggested from earlier stages (e.g. share of tower FTE from ticket history, whether enhancements or transition are entered, AI adoption) and can be overridden. Drivers scored 1–2 are listed as due diligence items (Annexure Step 4).

**Range** (`proposed`): the engine is re-run with demand (tickets and enhancement hours) moved ±25% (Low), ±15% (Medium), ±10% (High) or ±5% (Highest). The coverage floor doesn't move, so the range narrows where the base team sets the size. Confidence and range replace the scenario tile in the Overall estimate.

## Stage 3 · Step 11: capacity ramp, term and YoY savings

This stage is **FTE only**. No cost or rate factors are used anywhere in the tool.

```
floor      = step 1 base team (kept whole every year; can be switched off)
base(Yn)   = floor + (delivery team + SDM − floor) × (1 − savings %)^(n−1)
FTE(Yn)    = base(Yn) × (1 + contingency(Yn)) × (1 + Σ active stage 7 risk %, from Y2)
             contingency(Y1) = step 8 %, contingency(Y2+) = min(step 8 %, 6%)
```

- **Savings % per year from Y2** defaults to the scenario's YoY savings target midpoint ([F] Part 3): Sc1 13.5%, Sc2 11%, Sc3 13.5%, Sc4 17.5%. It can be edited. Nothing is committed in Y1.
- **Contingency tapers** after Y1, following the framework's Y1 8–10% → Y2+ 5–7% ([F] 1.6).
- **Term comparison:** a table shows 1- to 5-year terms with FTE by year, FTE-years, average FTE a year and the reduction against a 1-year contract. A generated sentence explains why a 3-year or longer term is better.

Default example (3-year term): 11.7 → 11.2 → 11.0, averaging 11.31 FTE a year. That is 4% below a 1-year contract; 5 years averages 11.03 (−6%). The savings are small here because the 8.65 FTE coverage floor is most of the team. Switch the floor off, or use a larger estate, to see the full effect.

### Year 2+ savings from AIOps use cases

Step 11 offers two ways to work out Year 2+ savings: the **scenario YoY %** or the **AIOps use-case portfolio**. **The portfolio is the default for a new estimate, and it applies once a tower has AIOps in scope**; with no AIOps in scope the scenario percentage is used and a note says so. An estimate saved before this default keeps its own method. The portfolio is the damo-estimator catalogue (14 use cases, each with build person-weeks, deflection %, level and prerequisites; the seven core L2 ones on by default). **All use cases go live from Year 1 by default**; a selector changes the start year for all of them (or sets the scenario's own AIOps timeline: Year 1 for Scenarios 2 and 4, Year 2 for 1 and 3), and each use case can override it. The panel shows **when each use case takes effect** (a use-case by year grid of the deflection in that year's team) and a **chart of the combined L2 and L3 deflection** against the automation ceiling. A year's team uses the deflection reached by the end of the year before, so a use case live from Year 1 first shows in Year 2.

```
tier FTE        = L2 (or L3) FTE of towers with AIOps in scope, after backfill and step 2 risk
deflection(tier)= 1 − Π (1 − use-case deflection × adoption), capped at the automation ceiling
                  (AMS 60%, IMS 70%, DMS 50% from damo-estimator; AI platforms 50% proposed)
FTE freed(year n) = Σ tier FTE × deflection reached by the end of year n − 1
team(year n)    = max(floor, step 4 team − freed × (reduce % + commit %))
```

Freed capacity splits into reduce / redeploy / commit (default 50 / 30 / 20; redeployed people stay on the team). The panel compares the result with the scenario YoY target, nets it against the AI engineers who build it, and flags when the build effort starting in a year exceeds the AI engineers' capacity (44 person-weeks each a year, `proposed`) or a prerequisite is missing. Token and inference cost is not modelled (FTE only).


### Productivity commitment and agentic use cases

New estimates start with a **productivity commitment**: a year-on-year reduction the estimate commits to the client, 12% from Year 2 by default (the framework's YoY targets are 10 to 20%; the figure is proposed and editable, with the start year). The year-by-year team follows the committed path, compounding on the Year 1 base and never going below the Step 1 coverage floor.

The use cases are the evidence for it. Step 7 shows the **modelled** team (use cases plus a proposed 3% a year of baseline productivity outside them; with the scenario percentage method, that percentage already includes it) beside the **committed** team, the **gap** in FTE and how much of the committed reduction is **supported**. A positive gap is delivery risk the estimate carries, and the verdict says how many FTE-years of it fall in the term and how to close it. The commitment can be switched off, in which case the team follows the model as before. Estimates saved before this change keep their own method: no commitment and no agentic use cases.

The catalogue now includes six **agentic** use cases (ticket triage and resolution, root-cause analysis with action proposals, remediation with approval, runbook and change execution, data-quality exception handling, knowledge curation). Each has an **autonomy level**: assist (counts half the deflection, less build), act with approval (the default, 80%) or autonomous (all of it, 30% more build). They come in waves after the assistive use cases (one or two years after the "all use cases go live from" year) unless you set a start year on the use case. Catalogue, deflection, autonomy factors and baseline productivity are proposed values.

### Transition (optional)

A one-off panel in step 11, not part of the Year 1 team (`proposed` method):

```
knowledge transfer = KT weeks × team present during KT (default 50%) × Year 1 team
parallel run       = parallel-run weeks × Year 1 team
management         = transition management FTE (default 1) × transition months
transition effort  = sum, in FTE-months (weeks × 12 ÷ 52), with average and peak team
```

It appears in the Overall estimate, both summaries and the customer summary's Transition section.

## Review · Step 13: final fact check against the existing team

This step **does not change the estimate**, and neither does anything after it: the optional proposed final number lives in Step 14. The team running the estate today (client or incumbent), the source and the tolerance are entered once, at step 3, and reused here, so the fact check happens in two places: step 3 checks the Stage 1 team, and this step checks the **final** Year 1 team and the term.

| Existing | Compared with |
|---|---|
| L2 support | Our L2 |
| L3 engineering + SRE/automation | Our L3 (includes transformation capacity) |
| Service/delivery managers | Our SDMs |
| Other roles | Not in our model: flagged "not in our scope" |

Each tier and the total is marked consistent, above or below. Bars compare today's team with our Year 1, our term average and our final year. A generated sentence explains the result:

- **Consistent:** Year 1 is within tolerance.
- **Above:** it shows how much is transformation capacity and contingency the existing team may not carry, and what we would be without them.
- **Below:** it points to out-of-scope roles and base-team absorption, then frames the gap as the productivity case.

It always ends with where the team lands by the end of the term against today, and it flags verbal estimates as directional. Risks in this stage are tracked only.

Default example: the existing team is 13 FTE (6 L2, 4 L3, 1 SRE, 1 manager, 1 other). Our Year 1 is 11.7 (−10%, consistent), and Year 3 is 11.0 (−15% against today).

## Review · Step 14: commercial position, an editable final number and commercial options

Optional, and its own step (stage 10, Part 3) so it is never mixed with the final fact check: Step 13 and the Overall estimate always show the modelled numbers, with a pointer to Step 14 when a proposed number is applied. `compute()` returns `R.fin`: the modelled Year 1 team and years, or the proposed ones once `S.adj` is on with a reason and a change (`S.adj.mode` is `fte` (a proposed Year 1 FTE; every later year moves by the same proportion), `pct` or `year`; `S.adj.fte`, `S.adj.pct`, `S.adj.y[]`). Steps 1 to 8 are never changed. The cut comes out of contingency first, then the delivery team with the SDM (capped at the team); the Year 1 location cells, roles and rounded people are rebuilt from it so they add up to the proposed total, and each year keeps `adj` (modelled total, cut, from contingency, from delivery). The client summary and the Excel workbook read `R.fin` (the client summary shows the proposed number only); the fact check, the final panel and the summary document keep the modelled steps and add Step 14. The risks (`adjRisks()`: implied utilisation amber 90% and red 100%, below the Step 1 base team, contingency used up, below the existing team, faster AI savings, scope unchanged, capped, above the model) and the mitigation library (`ADJ_MITS`, tickable, rewordable, with your own additions in `S.adj.extra`) go into the summary document and Excel.

`commercialOptions()` rates fixed fee, outcome-based terms (an add-on), T&M with a cap and an assessment-led start from the framework's scenario recommendation (`SCENARIOS[n].comm`) plus proposed rules on months of ticket history, a measurable baseline, the confidence band, complexity or a legacy estate, a takeover, term, AIOps in scope, a Year 1 budget ceiling, an applied cut above 15% and price pressure (`S.cm`). Model level only: no price. Internal: in the summary document, Excel and copy summary, never in the client summary.

## Assumptions by category

Assumptions are grouped by category wherever they are shown: coverage and locations, demand and volumes, service scope and ownership, SLA and service levels, effort benchmarks, skills and specialists, transformation and AIOps, governance and SDM, seniority and contingency, term and savings, triangulation and fact check, client responsibilities, other. Each built-in assumption (A1–A7, B1…, C1…) has a fixed category; each assumption added by the deal team (U1…) has a category picker, defaulting to the step's own. Every step lists its assumptions under category headings, and the **Assumptions register** at step 13 gathers all of them, across steps, in one grouped list. The register is also in the downloaded summary, the copied summary and the Excel workbook (an "Assumptions register" sheet), and the customer summary groups the deal team's assumptions by category.

## Header and navigation

- **Header actions** are grouped in two menus. **File:** Open file, Save file, Add to Prism Library, Start fresh on every visit, Reset estimate (asks for a second click). **Export** (primary): Download summary, Customer summary, Excel workbook, Copy summary. **Guide** opens the user guide.
- **Two-tier navigation**, sticky at the top while you scroll. The tabs are *Documents*, *Stage 1 · The Year 1 number* (showing the Stage 1 team in FTE) and *Stage 2 · Validate and finalise* (showing the Year 1 team). Under them are the steps of the part you are in, with Previous and Next arrows. A step's dot shows what it needs: green ready, amber needs a choice (hover for what: add a tower, choose AI adoption, complexity or term; or a warning such as an uncovered hour), blue skill cover adds headcount, hollow optional (the existing team). Stage 2 says which Stage 1 team it starts from.
- On small screens the tabs shrink to the part and its figure, and the step chips scroll sideways.

## The FTE bar and stage results

The bar at the bottom builds up **one stage at a time**. It shows the team as it stands at the end of the stage you are on, not the final estimate:

| On stage | Bar shows |
|---|---|
| 1 | Base team from coverage |
| 2–4 | Larger of the base team and the team from the work so far |
| 5 | + SDM |
| 6 | + contingency (the Year 1 team) |
| 7–8 | Final team, plus the term average or the fact check |

Rounding to whole people is applied to whatever the bar shows. If the work team is smaller than the base team, the base team itself (its locations and tiers) is the delivery team.

Each stage ends with a **"Team after Stage N"** strip: FTE, people, the change from the previous stage, and one line on why.

## Overall estimate: deal desk views

The Overall estimate panel at step 13 adds three views for approval:

- **Year 1 team by role.** Every FTE traced to the skill set and tower that asked for it, plus AI engineers, transformation, shift cover (when the base team is larger) and SDM. Contingency is spread over the delivery roles. The rows add up to the Year 1 team.
- **Allowances in the Year 1 team.** Productive need, then the productive-time allowance (utilisation), leave backfill, contingency and risk, each measured by switching it off in turn and re-running the engine, so they add up even though reconciliation keeps the larger of two teams. The headline is the buffer above productive capacity (leave + contingency + risk) in FTE and %, plus rounding.
- **Deviations from the framework.** Every benchmark, ratio or allowance changed from its framework or agreed value, with both values and the source. Empty when nothing was changed.

### Where the inputs came from

Inputs applied from the Documents page keep their source and quote: shown under the coverage window, on each tower card, and in a table in the Overall estimate and both internal summaries. If an imported input is changed later it is marked **edited since** / **Edited after import**.

### Version and approval

The panel also holds version, prepared by, status (Draft / Submitted for approval / Approved), approver and approval date. Approving stores a fingerprint of every input. If any input changes afterwards, the header badge, the panel and both summaries say **Changed since approval** until it is approved again or set back to Draft.

**Save file** writes every input and the approval block to `<deal>-v<version>.damo.json`. **Open file** loads one back (it replaces the estimate on screen), so an estimate can be shared, archived with the deal and reopened exactly as approved. Browser storage is still used between visits.

**Start fresh on every visit** is a per-browser switch, off by default. When it is on, opening Prism from its address (typing it, a link, a new tab) starts a new estimate on the Documents page instead of the last one. Reloading the page keeps the estimate on screen, so a refresh never loses work. Saved scenarios are not cleared. Use **Save file** to keep work.

**Add to Prism Library** opens the Prism Library in a new tab with a short summary of the estimate (scale, team by role, years, AIOps use cases and the assumptions) in the link, after the `#`, so it is not sent to any server. The Library's Add a deal form opens filled in; the user adds industry, region, SLA tier and an anonymised description and submits it for review. The customer name travels in the same link only so the Library can refuse it in free text, and is not saved. The saved file also carries the same summary under `library`. The Library address is `LIBRARY_URL` in `index.html`.

## Scenarios

Step 13 can save the estimate on screen as a named scenario, then compare up to four scenarios side by side with it: Year 1 team and people, coverage, towers, tickets, base and work team, AI engineers, SDM, contingency, framework scenario, term and savings, final-year and average team, confidence and range, transition. **Load** replaces the estimate on screen. Scenarios are kept in the browser and travel inside saved estimate files.

## Excel export

**Export Excel** writes a workbook with sheets for Summary, Build, Towers, Team by role, Team by location, Years (with AIOps savings when used), Allowances, Deviations, Confidence, Sources, Assumptions & risks, Scenarios (when compared) and Checks. Numbers are plain values for the pricing sheet.

## Verify against the framework

**Run checks** in step 13 runs the engine on the framework's worked examples and checks the estimate on screen adds up: the p.3 coverage roster (6 FTE for 24×5 at 2 per shift), the 100-ticket cascade (30 / 70 / 14, 420.6 h, 3.29 FTE), the SLA uplift range and cap, coordination uplift, AIOps ratios (1:4, 1:8, 1:6 over 20 FTE), the scenario matrix, contingency by complexity, the Annexure 1 illustration (64.8, High), SDM 1:12, and invariants (roles, locations and allowances each add up to the Year 1 team; Year 1 of the term and the step 8 bar equal it). The result is included in the summary and the Excel workbook.

## Customer summary

**Customer summary** (in the Overall estimate panel) downloads a client-facing page:

- Year 1 team, support window and the year-by-year team over the term
- How they are covered, shift by shift, in plain words (working vs on call for P1)
- What is in scope, how each service was sized, and whether AIOps is included
- The Year 1 team by role (merged across towers) and by location
- What we need from the client (L1 service desk, access, knowledge transfer, contacts; AI costs when relevant)
- The deal team's own assumptions, and what would change the team size

It leaves out contingency, risk modifiers, rounding lines, framework references and the stage working.

## Summary document

Step 13 ends with an **Overall estimate** panel: headline figures (Year 1 team, rostered people, term average, scenario) and a table of how each stage built the team. **Download summary** (in that panel and in the header) produces a self-contained HTML document containing:

- the headline figures and the stage-by-stage build table, with rounding and the final Year 1 team
- the final team by location and tier
- for every stage: its result line, the full working, its tables, assumptions and risks

Open it in any browser and print to PDF if needed. In the claude.ai viewer the file is offered through the page's download prompt; on Netlify it downloads directly. A sample built from the Acme Retail worked example (`docs/example-acme-retail.damo.json`) is in [`docs/sample-estimate-summary.html`](docs/sample-estimate-summary.html).

### Copy summary
**Copy summary** puts each stage's working, the location table, the assumptions and the risks on the clipboard as Markdown, ready for the deal-review deck or notes.
