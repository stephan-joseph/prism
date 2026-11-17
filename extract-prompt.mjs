/* Shared by the page (claude.ai "sample" route and the copy-prompt route) and by
   netlify/functions/extract-inputs-background.mts, so every route asks Claude the
   same question and every answer is cleaned the same way before it reaches the tool. */

export const DOC_TYPES = {
  rfp: "RFP",
  incidents: "Incident dump",
  notes: "Meeting notes",
  other: "Other",
};

/* Skill-set ids the tool knows. Claude must pick from these only. */
export const SKILL_IDS = {
  sse: "Systems Support Engineer (L2/L3 support)",
  fs: "Full stack developer", be: "Backend API dev", fe: "Front end dev",
  mob: "Mobile dev (Native / Android / iOS)", infra: "Infra support engineer",
  sre: "Service Reliability Engineer", qa: "QA", l1: "L1 support engineer",
  dse: "Data Support Engineer", dba: "Database", data: "Data engineering",
  ai: "AI Engineer", prompt: "Prompt Engineer", mlops: "MLOps Engineer",
  llmops: "LLMOps / Agent Ops Engineer", aieval: "AI Evaluation & Guardrails Engineer",
  ds: "Data Scientist",
};

/* the most clauses one extraction may return; keeps the reply short on a gateway model */
export const MAX_CLAUSES = 25;
/* the most activities one extraction may return */
export const MAX_ACTIVITIES = 60;

/* The use case catalogue ids Claude may name. Keep ids and names in step with CATALOGUE in index.html (scripts/test-extract.mjs checks this). */
export const UC_CATALOGUE = {
  "UC-01": "Incident triage from observability data", "UC-02": "Incident summarisation", "UC-03": "Similar incident search",
  "UC-04": "Runbook lookup", "UC-05": "Post-incident review generation", "UC-06": "Incident executive summary",
  "UC-07": "Daily incident report", "UC-08": "Call notes analysis", "UC-09": "Free-form operations chat",
  "UC-10": "Incident analytics dashboard", "UC-11": "Monthly report slide generation", "UC-12": "Periodic PDF report export",
  "UC-13": "Ticket form AI assistant", "UC-14": "New incident notifications", "UC-15": "Knowledge base chat",
  "UC-16": "Incident investigation agent", "UC-17": "Critical alert auto-triage", "UC-18": "Alert optimisation",
  "UC-19": "Production error diagnosis", "UC-20": "Incident context extraction", "UC-21": "Diagnosis report generation",
  "UC-22": "Support evidence packet preparation", "UC-23": "Operational knowledge query", "UC-24": "Support knowledge ingestion",
  "UC-25": "Service risk scoping", "UC-26": "Focused observability gap review", "UC-27": "Observability implementation planning",
  "UC-28": "Service telemetry implementation", "UC-29": "Monitoring-as-code implementation",
};

/* Starter activity library for the bottom-up method. Every value is invented and proposed, not from the framework or any client: the architect edits them for the deal. A lever is only set where a use case sits behind it.
   Hours a month = quantity x hpu (hours per unit a month). driver names what the quantity is; a fixed activity has qty 1 and no driver. */
const A = (id, kind, name, layer, driver, hpu, lever, role1, share1, role2, ucs, skills, scaling, qty) =>
  ({ id, kind, name, layer, driver, hpu, lever, role1, share1, role2, ucs, skills, scaling: scaling || (driver ? "volume" : "fixed"), qty: driver ? null : (qty == null ? 1 : qty) });
export const ACTIVITY_LIBRARY = [
  A("AMS-01", "AMS", "Monitor and triage application alerts", "run", "Alerts a month", 0.25, 40, "L2 engineer", 70, "L3 engineer", ["UC-01"], ["sse"]),
  A("AMS-02", "AMS", "Resolve application incidents", "run", "Incidents a month", 1.5, 25, "L2 engineer", 60, "L3 engineer", ["UC-02", "UC-03", "UC-04"], ["sse"]),
  A("AMS-03", "AMS", "Fulfil application service requests", "run", "Service requests a month", 0.75, 30, "L2 engineer", 100, "", ["UC-04"], ["sse"]),
  A("AMS-04", "AMS", "Problem and change management for applications", "run", "Changes a month", 2, 15, "Technical lead", 50, "L3 engineer", ["UC-05"], ["sse"]),
  A("AMS-05", "AMS", "Releases and deployments", "run", "Releases a month", 6, 0, "Release engineer", 100, "", [], ["sse"]),
  A("IMS-01", "IMS", "Monitor infrastructure and cloud alerts", "run", "Alerts a month", 0.2, 45, "L1.5 engineer", 60, "SRE", ["UC-01", "UC-18"], ["infra"]),
  A("IMS-02", "IMS", "Resolve infrastructure incidents", "run", "Incidents a month", 1.25, 25, "L2 engineer", 60, "L3 engineer", ["UC-02", "UC-03", "UC-04"], ["infra"]),
  A("IMS-03", "IMS", "Platform administration and patching", "run", "Hosts", 0.5, 0, "Platform administrator", 100, "", [], ["infra"]),
  A("IMS-04", "IMS", "Backup and disaster recovery checks", "run", "Protected systems", 1, 0, "Platform administrator", 100, "", [], ["infra"]),
  A("IMS-05", "IMS", "Security and compliance operations", "run", "Findings a month", 1, 0, "Security analyst", 100, "", [], ["sre"]),
  A("DMS-01", "DMS", "Monitor data pipelines", "run", "Pipelines", 0.5, 40, "Data engineer", 100, "", ["UC-01"], ["data"]),
  A("DMS-02", "DMS", "Resolve data incidents and reruns", "run", "Incidents a month", 1.5, 20, "Data engineer", 70, "L3 engineer", ["UC-02"], ["dse"]),
  A("DMS-03", "DMS", "Data quality checks", "run", "Data products", 2, 0, "Data engineer", 100, "", [], ["data"]),
  A("DMS-04", "DMS", "Database administration", "run", "Databases", 4, 0, "Database administrator", 100, "", [], ["dba"]),
  A("AI-01", "AI", "Operate and monitor agents", "run", "Agents", 8, 20, "AI engineer", 100, "", ["UC-16"], ["llmops"]),
  A("AI-02", "AI", "Evaluate and tune prompts and guardrails", "aiRun", "Agents", 6, 0, "AI engineer", 100, "", [], ["aieval"]),
  A("AI-03", "AI", "Review the human approval queue", "aiRun", "Approvals a month", 0.2, 0, "L2 engineer", 100, "", [], ["llmops"]),
  A("GOV-01", "GOV", "Service delivery management", "gov", null, 140, 0, "Service delivery lead", 100, "", [], []),
  A("GOV-02", "GOV", "SLA and KPI reporting", "gov", null, 24, 30, "Service delivery lead", 100, "", ["UC-07", "UC-11"], []),
  A("GOV-03", "GOV", "Service reviews and governance meetings", "gov", null, 16, 0, "Service delivery lead", 100, "", [], []),
  A("GOV-04", "GOV", "Runbook and knowledge upkeep", "ci", null, 40, 30, "Knowledge analyst", 100, "", ["UC-24"], []),
  A("GOV-05", "GOV", "Minor enhancements within scope", "ci", null, 60, 0, "L3 engineer", 100, "", [], []),
];

const SCHEMA_EXAMPLE = {
  docSummary: "3-5 sentences in your own words: client, scope, service window, what is being asked for.",
  clientName: "Acme Bank",
  coverage: { daysPerWeek: 5, hoursPerDay: 24, outOfHours: "oncall", weekends: "none", p1PerMonth: 6,
    regions: [{ region: "eu", startLocal: 9, hoursPerDay: 8 }, { region: "apac", startLocal: 9, hoursPerDay: 8 }],
    evidence: "short quote", source: "RFP" },
  towers: [{
    kind: "AMS", name: "Retail banking apps",
    serviceLevels: "L2+L3", sla: { p1ResponseMin: 15, p1RestoreMin: 120, p2ResponseMin: 30, p2RestoreMin: 480, availabilityPct: 99.9 },
    priorityMix: { P1: 4, P2: 16, P3: 50, P4: 30 },
    volumetrics: { incidentsPerMonth: 120, serviceRequestsPerMonth: 40, changeRequestsPerMonth: 8 }, srComplexityMix: { low: 60, medium: 30, high: 10 }, crComplexityMix: { low: 50, medium: 35, high: 15 }, ticketLevel: "L1", enhancementHoursPerMonth: 80,
    structural: { apps: { S: 0, M: 3, L: 2, XL: 1, XXL: 0 } },
    mau: 50000, estate: "legacy", aiopsInScope: true, skills: ["be", "fe"],
    clauseRefs: ["2.1", "10"],
    evidence: "short quote", source: "Incident dump",
  }],
  clauses: [{ ref: "2.1", obligation: "Platform administration, patching and upgrades.", target: "99.9% availability", evidence: "short quote", source: "RFP" }],
  aiAdoption: { value: "low", evidence: "short quote", source: "Meeting notes" },
  complexity: { value: "high", evidence: "short quote", source: "RFP" },
  termYears: { value: 3, evidence: "short quote", source: "RFP" },
  existingTeam: { L2: 6, L3: 4, sreAutomation: 1, managers: 1, other: 0, evidence: "short quote", source: "RFP" },
  assumptions: [{ stage: 2, text: "Client keeps the L1 service desk.", source: "RFP" }],
  risks: [{ stage: 2, title: "Undocumented integrations", note: "Why it matters, one sentence.", source: "Meeting notes" }],
  openQuestions: ["What is the P1 restoration target outside business hours?"],
};

/* Only asked for when the page says the bottom-up method is on, so a tower extraction keeps the shorter prompt and reply. */
const BU_SCHEMA = {
  optionYears: { value: 2, evidence: "short quote", source: "RFP" },
  activities: [{ rfpRef: "4.2.1", name: "Monitor production alerts", towerKind: "AMS", libraryId: "AMS-01", driver: "Alerts a month", quantity: 1200, useCaseIds: ["UC-01"], evidence: "short quote", source: "RFP" }],
};

const RULES = `Rules:
- Return ONLY one JSON object, no prose and no code fences.
- Include a field only when the documents support it. Omit anything you would have to guess. Never invent numbers.
- "evidence" is a short quote (under 25 words) from the document; "source" is the document type it came from.
- coverage.daysPerWeek: 5, 6 or 7. coverage.hoursPerDay: 1-24 (business hours only = 8 or 9, "16x5" = 16, "24x7" = 24).
- coverage.outOfHours: "active" if people must be working outside business hours, "oncall" if only reachable for P1/critical incidents. Omit if coverage is business hours only.
- coverage.regions: only when the documents ask for support to different customer geographies, each with its own local hours (for example Europe, APAC and North America at 09:00 to 17:00 local). One entry per geography: region is "eu", "apac", "na" or "ime" (India and Middle East), startLocal is the local start hour (0 to 23.5, 9 = 09:00), hoursPerDay is the hours a day in that geography's local time. Give at most 4. Omit when there is a single geography or the hours are not stated per geography. The geographies to cover are not the same as where the customer is: a customer in one country can ask for support for several geographies. Do not list the customer's own country unless the documents ask for support hours there. Do not work out a combined window; the tool does that.
- coverage.weekends: "active", "oncall" or "none".
- coverage.p1PerMonth: P1 / critical incidents a month across all hours. Use the incident dump summary's priority counts divided by its months. Omit if unknown.
- towers[].serviceLevels: "L1+L2+L3", "L2+L3", "L2" or "L3": the support levels the client wants us to provide for that estate. Omit if not stated.
- towers[].sla: response and restore targets in minutes for P1 and P2, and availabilityPct (e.g. 99.9). Convert hours to minutes. Include only the targets the documents state.
- towers[].priorityMix: share of tickets by priority P1-P4 (counts or %), from the incident dump summary when given.
- towers[].volumetrics.changeRequestsPerMonth: change requests a month, kept separate from incidents and service requests. Omit if not stated.
- towers[].srComplexityMix / crComplexityMix: how complex the service requests / change requests are: low (simple, routine), medium, high (complex, urgent, multi-team), as counts or percentages, only when the documents give a breakdown. Never infer them from incident priorities.
- towers[].ticketLevel: where the volumetric counts are measured: "L1" (all tickets raised, e.g. a whole ITSM export), "L2" (tickets reaching L2 / an incumbent's L2 queue) or "L3". Omit if unclear.
- towers[].enhancementHoursPerMonth: hours a month of enhancements / minor change in the run scope, only if stated or derivable (convert yearly or per-release figures).
- towers[].kind: "AMS" (applications), "IMS" (infrastructure/cloud), "DMS" (data platforms), or "AI" (AI platforms / agentic solutions). One entry per distinct estate the documents describe.
- towers[].volumetrics: monthly averages. Use the incident dump summary when given; convert yearly or weekly counts to monthly. Omit if no ticket counts exist for that tower.
- towers[].structural, only when volumetrics are missing, by kind:
    AMS: {"apps": {"S","M","L","XL","XXL"}} counts. S = static/UI only; M = CRUD with 1-2 APIs; L = financial transactions or 3+ API orchestrations; XL = payments, regulatory reporting, complex ESB; XXL = ML pipelines, multi-level analytics.
    IMS: {"environments", "hostingPlatforms", "databases", "securityInScope": true|false}
    DMS: {"dataProducts", "pipelines", "integrations", "upstream", "downstream"}
    AI:  {"agents", "models", "toolIntegrations", "knowledgeSources", "highRisk": true|false}
- towers[].mau: monthly active users, only if stated.
- towers[].estate: "modern" (modern/SaaS; for AI: managed AI services) or "legacy" (complex legacy; for AI: self-hosted models/custom agents).
- towers[].sreInScope (IMS only): true if the client names site reliability engineering / SRE as a capability or objective (SLOs, error budgets, toil reduction); false if excluded. Omit if not mentioned.
- towers[].aiopsInScope: true if the client wants AIOps for that estate (intelligent alerting, automated RCA, ticket auto-classification, anomaly detection, self-healing); false if AIOps is explicitly excluded. Omit if not mentioned.
- towers[].skills: ids from this list only: ${Object.entries(SKILL_IDS).map(([k, v]) => `${k} = ${v}`).join("; ")}.
- clauses: the contract or RFP clauses that decide the size or scope of the run team: service scope, service levels and SLAs, support hours, security and compliance duties, transition and hypercare, volumes and exclusions. Skip commercial, legal and boilerplate clauses. At most 25. Keep "ref" exactly as written in the document (for example "2.1" or "Section 10"). Omit the list if the documents have no numbered or named clauses. Never invent a reference.
- clauses[].obligation: what the clause requires, in your own words, under 20 words. clauses[].target: the measurable target or SLA copied from the document, if there is one.
- towers[].clauseRefs: the "ref" of each clause in the clauses list that this tower serves. Use only references that appear in the clauses list. Omit if you are not sure.
- aiAdoption.value: "low" or "moderate" ("moderate" = AI in observability, automated runbooks or self-healing already in production).
- complexity.value: "low", "medium" or "high" for the engagement overall.
- termYears.value: 1-5.
- existingTeam: headcount of the team running the estate today, by role group.
- assumptions and risks: things a deal reviewer should see, each tagged with the workflow stage it belongs to:
    1 base team/coverage, 2 towers/demand, 3 skill coverage by shift, 4 transformation/AI, 5 governance, 6 seniority/contingency, 7 term/savings, 8 existing team.
- openQuestions: the most important gaps the deal team should close with the client (max 8).`;

const RULES_BU = `Rules for the bottom-up fields (optionYears and activities):
- optionYears.value: 0-5, the extension years after the core term, only if the documents state them.
- activities: the distinct operational activities the RFP asks the supplier to perform: monitoring, incident handling, service requests, problem and change, releases, platform administration, backup and recovery, security, reporting, governance, knowledge upkeep. At most ${MAX_ACTIVITIES}. One entry per activity. Keep "rfpRef" exactly as written in the document (the clause or section number). Omit the list if the documents do not describe activities.
- activities[].towerKind: "AMS", "IMS", "DMS", "AI", or "GOV" for service management and governance.
- activities[].libraryId: the id of the starter library entry that describes the same work, from this list only: ${ACTIVITY_LIBRARY.map((l) => `${l.id} = ${l.name}`).join("; ")}. Omit it unless the entry fits closely.
- activities[].driver: what the activity scales with, in a few words (for example "Alerts a month"). activities[].quantity: the Year 1 amount of that driver. Include both only when the documents state them. Never estimate hours.
- activities[].useCaseIds: only when the documents ask for an AI or automation capability for that activity. Ids from this list only: ${Object.entries(UC_CATALOGUE).map(([k, v]) => `${k} = ${v}`).join("; ")}. Omit if you are not sure.`;

/* docs: [{type: "rfp"|"incidents"|"notes"|"other", name, text}] */
export function buildExtractionPrompt(docs, opts = {}) {
  const bu = !!(opts && opts.activities);
  const body = docs.map((d, i) =>
    `<document index="${i + 1}" type="${DOC_TYPES[d.type] || "Other"}" name="${String(d.name || "").replace(/"/g, "'")}">\n${d.text}\n</document>`
  ).join("\n\n");
  return "You are helping a deal team size a DAMO managed-services engagement. Read the documents below and extract the inputs " +
    "for the estimation workflow as a JSON object in the shape shown.\n\n" +
    "Target shape (example values, not the answer):\n" + JSON.stringify(bu ? { ...SCHEMA_EXAMPLE, ...BU_SCHEMA } : SCHEMA_EXAMPLE, null, 2) + "\n\n" +
    RULES + (bu ? "\n" + RULES_BU : "") + "\n\n" + body;
}

/* ---- cleaning: drop anything outside the allowed sets, clamp numbers ---- */
const num = (v, lo, hi) => {
  const n = typeof v === "string" ? Number(v.replace(/[, ]/g, "")) : Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
};
const str = (v, max = 400) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const oneOf = (v, set) => (set.includes(v) ? v : undefined);
const prune = (o) => {
  if (!o || typeof o !== "object") return o;
  for (const k of Object.keys(o)) if (o[k] === undefined || (o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) && !Object.keys(o[k]).length)) delete o[k];
  return Object.keys(o).length ? o : undefined;
};
const ev = (o) => ({ evidence: str(o && o.evidence, 300), source: str(o && o.source, 60) });

const GEO_REGIONS = ["eu", "apac", "na", "ime"];
function cleanRegions(a) {
  if (!Array.isArray(a)) return undefined;
  const seen = new Set(), out = [];
  for (const e of a) {
    if (out.length >= 4) break;
    const region = e && oneOf(e.region, GEO_REGIONS), h = e && num(e.hoursPerDay, 1, 24);
    if (!region || h === undefined || seen.has(region)) continue;
    seen.add(region);
    const st = num(e.startLocal, 0, 23.5);
    out.push({ region, startLocal: st === undefined ? 9 : Math.round(st * 2) / 2, hoursPerDay: Math.round(h) });
  }
  return out.length ? out : undefined;
}

export function sanitizeExtraction(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const out = { docSummary: str(r.docSummary, 2000), clientName: str(r.clientName, 120) };
  if (r.coverage && typeof r.coverage === "object") {
    const c = r.coverage;
    out.coverage = prune({
      daysPerWeek: oneOf(num(c.daysPerWeek, 5, 7), [5, 6, 7]),
      hoursPerDay: num(c.hoursPerDay, 1, 24) !== undefined ? Math.round(num(c.hoursPerDay, 1, 24)) : undefined,
      outOfHours: oneOf(c.outOfHours, ["active", "oncall"]),
      weekends: oneOf(c.weekends, ["active", "oncall", "none"]),
      p1PerMonth: num(c.p1PerMonth, 0, 100000),
      regions: cleanRegions(c.regions),
      ...ev(c),
    });
  }
  /* clauses first, because a tower may only name clauses that exist in the list */
  const clauseKey = (v) => String(v).trim().toLowerCase().replace(/\s+/g, " ");
  const clauses = [], seenRef = new Set();
  if (Array.isArray(r.clauses)) {
    for (const c of r.clauses) {
      if (clauses.length >= MAX_CLAUSES) break;
      const ref = c && str(c.ref, 60), obligation = c && str(c.obligation, 300);
      if (!ref || !obligation || seenRef.has(clauseKey(ref))) continue;
      seenRef.add(clauseKey(ref));
      clauses.push({ ref, obligation, target: str(c.target, 200), ...ev(c) });
    }
  }
  if (clauses.length) out.clauses = clauses.map((c) => prune({ ...c }));
  const clauseByKey = new Map(clauses.map((c) => [clauseKey(c.ref), c.ref]));
  if (Array.isArray(r.towers)) {
    out.towers = r.towers.slice(0, 12).map((t) => {
      if (!t || typeof t !== "object") return undefined;
      const kind = oneOf(t.kind, ["AMS", "IMS", "DMS", "AI"]);
      if (!kind) return undefined;
      const v = t.volumetrics || {};
      const s = t.structural || {};
      let structural;
      if (kind === "AMS" && s.apps) structural = prune({ apps: prune(Object.fromEntries(["S", "M", "L", "XL", "XXL"].map((z) => [z, num(s.apps[z], 0, 10000)]))) });
      if (kind === "IMS") structural = prune({ environments: num(s.environments, 0, 10000), hostingPlatforms: num(s.hostingPlatforms, 0, 1000), databases: num(s.databases, 0, 10000), securityInScope: typeof s.securityInScope === "boolean" ? s.securityInScope : undefined });
      if (kind === "DMS") structural = prune({ dataProducts: num(s.dataProducts, 0, 10000), pipelines: num(s.pipelines, 0, 100000), integrations: num(s.integrations, 0, 10000), upstream: num(s.upstream, 0, 10000), downstream: num(s.downstream, 0, 10000) });
      if (kind === "AI") structural = prune({ agents: num(s.agents, 0, 10000), models: num(s.models, 0, 1000), toolIntegrations: num(s.toolIntegrations, 0, 100000), knowledgeSources: num(s.knowledgeSources, 0, 10000), highRisk: typeof s.highRisk === "boolean" ? s.highRisk : undefined });
      return prune({
        kind, name: str(t.name, 80),
        volumetrics: prune({ incidentsPerMonth: num(v.incidentsPerMonth, 0, 1e6), serviceRequestsPerMonth: num(v.serviceRequestsPerMonth, 0, 1e6), changeRequestsPerMonth: num(v.changeRequestsPerMonth, 0, 1e6) }),
        srComplexityMix: t.srComplexityMix && typeof t.srComplexityMix === "object" ? prune(Object.fromEntries(["low", "medium", "high"].map((k) => [k, num(t.srComplexityMix[k], 0, 1e6)]))) : undefined,
        crComplexityMix: t.crComplexityMix && typeof t.crComplexityMix === "object" ? prune(Object.fromEntries(["low", "medium", "high"].map((k) => [k, num(t.crComplexityMix[k], 0, 1e6)]))) : undefined,
        structural,
        mau: num(t.mau, 0, 1e9),
        estate: oneOf(t.estate, ["modern", "legacy"]),
        aiopsInScope: typeof t.aiopsInScope === "boolean" ? t.aiopsInScope : undefined,
        sreInScope: kind === "IMS" && typeof t.sreInScope === "boolean" ? t.sreInScope : undefined,
        serviceLevels: oneOf(t.serviceLevels, ["L1+L2+L3", "L2+L3", "L2", "L3"]),
        sla: t.sla && typeof t.sla === "object" ? prune({ p1ResponseMin: num(t.sla.p1ResponseMin, 0, 100000), p1RestoreMin: num(t.sla.p1RestoreMin, 0, 100000), p2ResponseMin: num(t.sla.p2ResponseMin, 0, 100000), p2RestoreMin: num(t.sla.p2RestoreMin, 0, 100000), availabilityPct: num(t.sla.availabilityPct, 50, 100) }) : undefined,
        priorityMix: t.priorityMix && typeof t.priorityMix === "object" ? prune(Object.fromEntries(["P1", "P2", "P3", "P4"].map((k) => [k, num(t.priorityMix[k], 0, 1e6)]))) : undefined,
        ticketLevel: oneOf(t.ticketLevel, ["L1", "L2", "L3"]),
        enhancementHoursPerMonth: num(t.enhancementHoursPerMonth, 0, 1e6),
        skills: Array.isArray(t.skills) ? [...new Set(t.skills.filter((k) => k in SKILL_IDS))] : undefined,
        clauseRefs: Array.isArray(t.clauseRefs) ? (() => {
          const refs = [...new Set(t.clauseRefs.filter((x) => typeof x === "string").map((x) => clauseByKey.get(clauseKey(x))).filter(Boolean))].slice(0, 8);
          return refs.length ? refs : undefined;
        })() : undefined,
        ...ev(t),
      });
    }).filter(Boolean);
    if (!out.towers.length) delete out.towers;
  }
  if (Array.isArray(r.activities)) {
    const acts = [], seen = new Set();
    for (const a of r.activities) {
      if (acts.length >= MAX_ACTIVITIES) break;
      const name = a && str(a.name, 120);
      if (!name) continue;
      const ref = str(a.rfpRef, 40), key = clauseKey((ref || "") + "|" + name);
      if (seen.has(key)) continue;
      seen.add(key);
      const lib = ACTIVITY_LIBRARY.find((l) => l.id === a.libraryId);
      const ids = Array.isArray(a.useCaseIds) ? [...new Set(a.useCaseIds.filter((x) => typeof x === "string" && Object.hasOwn(UC_CATALOGUE, x)))] : [];
      acts.push(prune({
        rfpRef: ref, name, towerKind: oneOf(a.towerKind, ["AMS", "IMS", "DMS", "AI", "GOV"]) || (lib && lib.kind),
        libraryId: lib ? lib.id : undefined, driver: str(a.driver, 60), quantity: num(a.quantity, 0, 1e9),
        useCaseIds: ids.length ? ids : undefined, ...ev(a),
      }));
    }
    if (acts.length) out.activities = acts;
  }
  if (r.optionYears && typeof r.optionYears === "object") {
    const y = num(r.optionYears.value, 0, 5);
    if (y !== undefined) out.optionYears = prune({ value: Math.round(y), ...ev(r.optionYears) });
  }
  const pick = (o, set) => (o && typeof o === "object" ? prune({ value: oneOf(o.value, set), ...ev(o) }) : undefined);
  out.aiAdoption = pick(r.aiAdoption, ["low", "moderate"]);
  if (out.aiAdoption && !out.aiAdoption.value) delete out.aiAdoption;
  out.complexity = pick(r.complexity, ["low", "medium", "high"]);
  if (out.complexity && !out.complexity.value) delete out.complexity;
  if (r.termYears && typeof r.termYears === "object") {
    const y = num(r.termYears.value, 1, 10);
    if (y !== undefined) out.termYears = prune({ value: Math.min(5, Math.max(1, Math.round(y))), ...ev(r.termYears) });
  }
  if (r.existingTeam && typeof r.existingTeam === "object") {
    const e = r.existingTeam;
    out.existingTeam = prune({ L2: num(e.L2, 0, 5000), L3: num(e.L3, 0, 5000), sreAutomation: num(e.sreAutomation, 0, 5000), managers: num(e.managers, 0, 5000), other: num(e.other, 0, 5000), ...ev(e) });
    if (out.existingTeam && !["L2", "L3", "sreAutomation", "managers", "other"].some((k) => k in out.existingTeam)) delete out.existingTeam;
  }
  const stage = (v) => oneOf(num(v, 1, 8), [1, 2, 3, 4, 5, 6, 7, 8]);
  if (Array.isArray(r.assumptions)) out.assumptions = r.assumptions.slice(0, 30).map((a) => a && str(a.text, 400) ? { stage: stage(a.stage) || 2, text: str(a.text, 400), source: str(a.source, 60) } : undefined).filter(Boolean);
  if (Array.isArray(r.risks)) out.risks = r.risks.slice(0, 20).map((a) => a && str(a.title, 120) ? { stage: stage(a.stage) || 2, title: str(a.title, 120), note: str(a.note, 400) || "", source: str(a.source, 60) } : undefined).filter(Boolean);
  if (Array.isArray(r.openQuestions)) out.openQuestions = r.openQuestions.map((q) => str(q, 300)).filter(Boolean).slice(0, 8);
  return prune(out) || {};
}

/* Replies are occasionally fenced despite the instruction; strip one fence before parsing. */
export function parseJsonReply(raw) {
  const t = String(raw || "").trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced ? fenced[1] : t;
  try { return JSON.parse(body); } catch { /* fall through */ }
  const a = body.indexOf("{"), b = body.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(body.slice(a, b + 1));
  throw new Error("Reply was not JSON");
}
