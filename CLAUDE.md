# DAMO Prism

An in-house tool that sizes managed-services deals ("Estimation as a Service"). A solution architect describes the support window, towers, volumes, SLAs and AIOps scope. Prism builds the team, the year-by-year team by role, a confidence score and an audit trail. It is built on the DAMO Solution Estimation Framework and the DAMO team pricing sheet. A companion app, **Prism Library** (separate repo `prism-library`), stores approved estimates for reuse.

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
| `index.html` | The whole app: one self-contained file, no build step, about 5,000 lines. State is saved in the browser (`localStorage` key `damo-workflow-v2`). |
| `guide.html` | Interactive user guide with calculators that use the tool's formulas. |
| `usage.html` | Admin report of extraction runs and cost. Off until `USAGE_ADMIN_KEY` is set. |
| `extract-prompt.mjs` | The extraction prompt, schema and cleaning. Shared by the page and the Netlify function. |
| `netlify/functions/` | `extract-inputs-background.mts` (AI extraction, 15-minute background function), `extract-status.mts`, `extract-usage.mts`. |
| `lib/usage.mjs` | Prices, cost calculation and usage summary. |
| `docs/` | `example-acme-retail.damo.json` (open it with File, Open file) and a sample summary. |
| `scripts/run-selftests.py` | Runs the built-in self-tests headlessly. |

## Run and test

Open `index.html` in a browser for the calculators. Extraction needs it served over http and the Netlify functions.

```bash
python3 -m http.server 8000
```

Self-tests (the engine's checks against the framework's worked examples, plus invariants and feature tests). Expect every test to pass; the count was 116 after the build-only change.

```bash
python3 scripts/run-selftests.py
```

The same tests run in the app from the "Run checks" button in the final review step. Add a test whenever you change the engine.

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
- **Towers:** `mkTower`, the demand cascade in `compute()`. A tower with no demand adds 0 FTE; Step 2 warns about it (`emptyWarn`, `notes2`).
- **Team shape:** `shapeOf`, `shapeYears`, `GROLES`, `DEFAULT_ROLE`, special roles.
- **Savings and term:** `USECASES` (20: 14 assistive, 6 agentic with autonomy levels), `pfOf`, `pfYears`, and the **productivity commitment** `S.prod` (default 12% a year from Year 2, never below the floor). The year-by-year team follows the committed path; `years[n].mBase` is the modelled path and `years[n].gap` is the unsupported part.
- **Extraction:** `runExtraction`, `showProposals`, `applyProposals`. A pasted Prism Library reference sheet is read directly without the AI (`isLibRef`, `parseLibraryReference`). An extracted tower of a kind you already have offers update or add (`buildTowerFromProposal`).
- **Library hand-off:** `libraryBlock()` adds a `library` summary to saved files. File, Add to Prism Library opens the Library with the summary in the link fragment (`#import=`, base64url JSON; never sent to a server).
- **State and migration:** `defaultsRaw`, `migrate`. Estimates saved before a feature keep their own method (see `st.prod`, `st.aiopsPf`).
- **Start fresh setting:** File menu, per browser. When on, opening the address starts a new estimate; reloading keeps the current one.

Values marked `proposed` in the tool are not from the framework. Do not present them as framework values.

## Decisions worth knowing

- Roles follow the DAMO roles guidance map. Each tower has one default role; everything else is a typed special role. SRE and Product Support Engineer are typed FTE per tower.
- AIOps savings default to the use-case method from Year 1. AI engineers are in the team through the last build year (the last year a switched-on use case starts), then leave it; run and tune is assumed to sit in the support team (`S.aiBuildOnly`, proposed). Estimates saved before the setting keep them for the whole term. Realisation split is 50% reduce, 30% redeploy, 20% commit.
- The productivity commitment is a commercial position, labelled proposed. 10 to 15% a year is the owner's intent; 12% is the default. Five years at 12% is a 40% cut, which the model's use cases do not fully support, and the tool shows that gap.
- Agentic autonomy factors (assist 0.5, act with approval 0.8, autonomous 1.0 of deflection; build effort 0.8, 1.0, 1.3) and 3% baseline productivity are proposed.
- The extraction function logs usage but never stores document text.

## Open items at handoff

- The Prism Library link has not been checked live end to end through the hosting sign-in.
- Applying an extracted tower now offers update or add; keep an eye on edge cases with several towers of one kind.
- Extraction on real documents has not been run by the previous maintainer (it needs the passphrase and a key). Run one small, non-confidential document after deploy.
- Estimator (separate older tool) has its own extraction function with no usage logging.
