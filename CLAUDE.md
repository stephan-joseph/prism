# DAMO Prism

An in-house tool that sizes managed-services deals ("Estimation as a Service"). A solution architect describes the support window, towers, volumes, SLAs and AIOps scope. Prism builds the team, the year-by-year team by role, a confidence score and an audit trail. It is built on the DAMO Solution Estimation Framework and the DAMO team pricing sheet. It has two sizing methods: the **tower method** (the original) and a separate **bottom-up (activity based) method**. A companion app, **Prism Library** (separate repo `prism-library`), stores approved estimates for reuse.

Read `README.md` for the full method and `guide.html` for the user guide. This file is what a new maintainer needs first.

## Standing rules (from the owner)

- **Local only until told.** Build and test locally. Commit, push, deploy and republish only when the owner says so.
- **No real client names or data** in the tool, demos, samples, docs or commits. Examples use invented names (for example "Acme Retail").
- **No secrets in the repo.** API keys, passphrases and access keys live only in the hosting settings. Never paste them into chats or files.
- Verify the live site after every push (self-tests pass, the changed screen works).
- Write plainly. Short sentences, no marketing words, no em-dash asides in user-facing text.

## What is in this repo

| Path | What it is |
|---|---|
| `index.html` | The whole app: one self-contained file, no build step, about 6,000 lines. State is saved in the browser (`localStorage` key `damo-workflow-v2`). |
| `guide.html` | Interactive user guide with calculators that use the tool's formulas. |
| `usage.html` | Admin report of extraction runs and cost. Off until `USAGE_ADMIN_KEY` is set. |
| `extract-prompt.mjs` | The extraction prompt, schema and cleaning. Shared by the page and the Netlify function. |
| `netlify/functions/` | `extract-inputs-background.mts` (AI extraction, 15-minute background function), `extract-status.mts`, `extract-usage.mts`. |
| `lib/usage.mjs` | Prices, cost calculation and usage summary. |
| `docs/` | `example-acme-retail.damo.json` and `example-bottomup-acme.damo.json` (open them with File, Open file) and a sample summary. |
| `scripts/run-selftests.py` | Runs the built-in self-tests headlessly. |

## Run and test

Open `index.html` in a browser for the calculators. Extraction needs it served over http and the Netlify functions.

```bash
python3 -m http.server 8000
```

Self-tests (the engine's checks against the framework's worked examples, plus invariants and feature tests). Expect every test to pass; the count is 241 (188 after the bottom-up method, plus 53 for several customer locations, shift limits, the gap finder and the outputs).

```bash
python3 scripts/run-selftests.py
```

The same tests run in the app from the "Run checks" button in the final review step. Add a test whenever you change the engine.

The extraction cleaning in `extract-prompt.mjs` (clauses, activities, option years), the starter activity library and the use case list have their own Node checks (18): `node scripts/test-extract.mjs`. That script also reads `index.html` to confirm the prompt's use case list and the library match `CATALOGUE` and `SKILL_CATALOG`.

## Deploy

Netlify serves the repo root and the functions (`netlify.toml`). Pushing the linked branch redeploys. Environment variables, set in the Netlify project and never in the repo:

| Variable | Needed | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | The key the extraction function uses. Create one per environment with a spend limit. |
| `INTAKE_PASSPHRASE` | yes | A shared password users type to run extraction. It is not an API key. If unset, anyone can run extraction. |
| `USAGE_ADMIN_KEY` | optional | Turns on the usage report. |
| `PRICE_MULTIPLIER`, `HOSTING_MONTHLY_USD`, `USD_PER_FUNCTION_SECOND`, `USD_PER_THOUSAND_INVOCATIONS` | optional | Contract discount and hosting rates for the usage report. |

Extraction uses model `claude-opus-5-5` with high effort, up to 16,000 output tokens and 600,000 characters of input (`netlify/functions/extract-inputs-background.mts`). Job results and usage records are in Netlify Blobs stores `damo-workflow-extraction-jobs` and `damo-workflow-usage`.

The Library address is the constant `LIBRARY_URL` in `index.html`. Change it to the Library's address in this environment.

## How the engine works (orientation)

`compute()` builds everything from the state `S`; `runCompute()` is the same engine with no transformation POD and no AI engineers (the run team); `update()` recomputes and re-renders. The estimate has three stages and 14 steps: Stage 1 sizes the team (coverage, towers, current team), Stage 2 qualifies it (skills by shift, managers, contingency), Stage 3 adds transformation capacity and year-by-year savings. The team is the larger of the base team from the support window (Step 1, the coverage floor) and the team built from the towers (Step 2).

Key areas in `index.html`:
- **Coverage:** `autoLayout`, `bestFitLayout`, `coverageOf`. The "Support asked for" choice (`S.support`: active or passive) lays out windows. Passive puts hours outside 07:00 to 20:00 local on call for P1.
- **Customer location, geographies to cover, shift limits, gap finder:** two separate inputs. The customer location (`S.region/custLoc/tz`) sets only the clock. The geographies to cover are `S.geos` (`{id,region,loc,utc,s,h}`, local hours each, at least one, at most 5) and are the source of the required hours. A saved estimate has no `S.geos`: `geosOf(st)` reads its customer window (`S.start/S.hours`) plus `custExtra` as the geographies, so nothing moves; `ensureGeos()` holds them in `S.geos` on the first edit (`S.custExtra` is then empty) and `syncGeos()` keeps `S.start/S.hours` as the first geography on the customer clock. `holdGeos()` runs before the customer location changes, `followCustomer()` after, so a single geography at the customer's own place follows it and several do not. `simpleGeo(st)` is true for one geography on the customer's clock (the old single window; the layouts then use the non-mask paths). `toggleGeo`, `dlocOptions` (delivery options follow the geographies), `reqMaskOf/reqHoursOf` (all windows on the `S.tz` clock, 48 half-hour buckets). `S.shiftLimits={on,from,to}` (off by default) feeds `bestFitMask`, `inLimits`, `limitWarnings`. `suggestLocations` is a pure greedy cover over `LOC_CATALOG`; `addDeliveryLocation` is the Add button. `changeDelivery` adds or removes a delivery location: it lays out every window again unless the windows were edited by hand (`S.meta.winManual`, set by window edits and cleared by `autoLayout` or `bestFitLayout`), in which case only the changed location is touched (`gapWindowsFor`). Outputs: `custList/custText/custName/limitsText`, `coverageSheetRows`. Approximations: one daily pattern, one `days`, no DST. Extraction returns `coverage.regions` (region, `startLocal`, `hoursPerDay`; `cleanRegions` in `extract-prompt.mjs`); `applyProposals` writes `S.geos` when one or more are given (the customer location is not changed), otherwise the top-level coverage fields apply to the customer's own window. **Best coverage panel:** `layoutCandidates(st)` builds candidates on copies (`planClone`, limits forced on with `forcedLimits`): `costPlan` (India first through the `prefId` argument of `bestFitMask`, then up to 3 more locations, Ecuador first through `NEXT_PREFERRED`, then whichever closes the most gap), `localPlan` (the delivery location nearest each geography's UTC, India only for what is left), plus follow the sun, P1 on call (Active–passive) and the current setup, merged when identical (`winSig`). Scores from `coverageOf`, `offDayHours` (regular hours 09:00 to 18:00), `indiaShare`, `baseTeamOf(...).risked`, `limitWarnings`. Ranking: no night shift, gap, overlap, the strategy's plan, off-hours. `applyLayout` copies locations, limits and support from a row. `bestFitMask(st,nightsOnCall,prefId,cap,strict,maxH)`: `maxH` is the longest window a location works (`S.coverCap`, default 9; what is left over stays uncovered); `S.indiaShare` caps India's share. `S.coverStrategy` is `cost` (default) or `local`, left out of the approval fingerprint when `cost`.
- **Towers:** `mkTower`, the demand cascade in `compute()`. A tower with no demand adds 0 FTE; Step 2 warns about it (`emptyWarn`, `notes2`).
- **Team shape:** `shapeOf`, `shapeYears`, `GROLES`, `DEFAULT_ROLE`, special roles.
- **Savings and term:** `USECASES` (20: 14 assistive, 6 agentic with autonomy levels), `pfOf`, `pfYears`, and the **productivity commitment** `S.prod` (default 12% a year from Year 2, never below the floor). The year-by-year team follows the committed path; `years[n].mBase` is the modelled path and `years[n].gap` is the unsupported part.
- **Extraction:** `runExtraction`, `showProposals`, `applyProposals`. A pasted Prism Library reference sheet is read directly without the AI (`isLibRef`, `parseLibraryReference`). An extracted tower of a kind you already have offers update or add (`buildTowerFromProposal`).
- **Library hand-off:** `libraryBlock()` adds a `library` summary to saved files. File, Add to Prism Library opens the Library with the summary in the link fragment (`#import=`, base64url JSON; never sent to a server).
- **Contract clauses:** `S.clauses` and `clauseIds` on each tower. `clauseAlloc` groups the Year 1 roles by clause (it never changes a number). Screen 15 (`renderClauses`, between Documents and Step 1, not in `ORDER`), the Step 2 selector (`clauseServedHtml`), the Team shape table (`updateClauseTable`), and `clauseSheetRows` for the exports. Extraction returns `clauses` and `towers[].clauseRefs`; `applyProposals` links by reference and never on a guess.
- **Bottom-up method (own engine and steps):** `S.method` is `"tower"` (default) or `"bottomup"`; `S.bu` holds its inputs. The tower engine, `STAGES` and `USECASES` are not used by it. `BU_STAGES` are its steps (order 1, 20, 21, 22, 25, 23, 24; id 1 is the tower's Coverage screen, shared); `stepFor` sends any other tower step id to the first own step. `renderNav` and `renderBar` hand over to `renderNavBU` and a hidden bar in this mode. `computeBU()` is the engine (hours, released hours, scaling, lever from live use cases, hypercare, build effort, roles, floors, rounding, year-to-year reasons, 18 checks). Qualifiers read inputs it **shares** with the tower method (`S.days/hours/locations`, on-call, `util1`, `backfill`, `cplx`, `contPct`, `cont2`, `sdmRatio`, `sdmLoc`, `ex`, `exTol`, `conf`), so an edit in either method changes both: `baseTeamOf(st)` is the roster maths of `compute()` Step 1 as a pure function (a test checks it against `compute()`), then per year leave backfill, coverage floor top-up, SDM from a ratio (`sdmMode` auto, ratio or activities; auto skips the ratio when an activity already gives a lead), contingency from complexity, and grade mix via the tower's `gradeSplit` with `pyrShares()`. Role tiers (`S.bu.tiers`, `buTierGuess`) say which roles staff shifts. Five flags (`BU_FLAGS`) turn them on for a new estimate and off for one saved earlier with activities, so old numbers never move (an older estimate with no activities has nothing to preserve and defaults on). Fields typed into on the result screens are listed in `BU_SOFT`, so only their result tables are redrawn, never the inputs. `buR()` caches on `S.bu` plus `buShared()`; add any shared field the engine reads to `buShared()`. `buExCheck` and `buConfidence` give the existing-team check and the advisory confidence guide. `CATALOGUE` is the 29-use-case catalogue (effort, duration, tokens, prerequisites), read only. `cleanBU` and `cleanActivity` repair saved inputs. Screens are `renderBU20` to `renderBU24`; edits go through `buSet` (inputs update in place, selects and list changes rebuild). The starter library `ACTIVITY_LIBRARY` and the use case list `UC_CATALOGUE` live in `extract-prompt.mjs`. Extraction returns `activities[]` and `optionYears`; `buActivityFromProposal` builds an activity from a proposal, a library entry or both, and `applyProposals` adds activities only when bottom-up is on, and switching method re-offers the proposals. Drivers are per tower (the same name for another tower gets its own driver); a quantity the documents state that differs from its driver stays on the activity. The prompt asks for activities only when the page passes `{activities:true}` (bottom-up on), which the page sends in the extraction request body. Both extraction handlers read it: `server/handlers.mjs` (the EKS server in the Docker image) and `netlify/functions/extract-inputs-background.mts`. An older server that ignores the flag never asks for activities, so ship the page and the server image together. A tower estimate's approval fingerprint ignores `method` and `bu`. `libraryBlock()` returns null in this mode. Export is a CSV (text cells that start with = + - @ get an apostrophe); the tower summaries, Excel and Library hand-off are hidden in this mode.
- **State and migration:** `defaultsRaw`, `migrate`. Estimates saved before a feature keep their own method (see `st.prod`, `st.aiopsPf`).
- **Start fresh setting:** File menu, per browser. When on, opening the address starts a new estimate; reloading keeps the current one.

Values marked `proposed` in the tool are not from the framework. Do not present them as framework values.

## Decisions worth knowing

- Roles follow the DAMO roles guidance map. Each tower has one default role; everything else is a typed special role. SRE and Product Support Engineer are typed FTE per tower.
- AIOps savings default to the use-case method from Year 1. AI engineers are in the team through the last build year (the last year a switched-on use case starts), then leave it; run and tune is assumed to sit in the support team (`S.aiBuildOnly`, proposed). Estimates saved before the setting keep them for the whole term. Realisation split is 50% reduce, 30% redeploy, 20% commit.
- The productivity commitment is a commercial position, labelled proposed. 10 to 15% a year is the owner's intent; 12% is the default. Five years at 12% is a 40% cut, which the model's use cases do not fully support, and the tool shows that gap.
- Agentic autonomy factors (assist 0.5, act with approval 0.8, autonomous 1.0 of deflection; build effort 0.8, 1.0, 1.3) and 3% baseline productivity are proposed.
- The extraction function logs usage but never stores document text.

- Bottom-up values marked `proposed`: starter library hours, levers and roles (invented), realisation curves (base 30/55/75/85/90%, lean 15/30/45/55/60%), efficiency 90%, hypercare 10% of Year 1 run hours, 140 productive hours per FTE a month, 20 foundation build days, and catalogue effort at the range midpoint. Build effort lands in each use case's start year. A lever with no use case behind it releases nothing. Extraction never estimates hours.

## Open items at handoff

- The Prism Library link has not been checked live end to end through the hosting sign-in.
- Applying an extracted tower now offers update or add; keep an eye on edge cases with several towers of one kind.
- Extraction on real documents has not been run by the previous maintainer (it needs the passphrase and a key). Run one small, non-confidential document after deploy.
- Bottom-up has no Prism Library hand-off, no Stage 2 and 3 feed, no 24-month ramp, no risk registers and no skill cover by shift yet. The shared Step 1 screen still carries some tower wording (steps 2 and 4, the FTE bar). Extraction of activities has not been run on a real RFP.
- Estimator (separate older tool) has its own extraction function with no usage logging.
