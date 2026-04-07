/**
 * Banking Reasoning Engine — v3
 *
 * Architecture (ALL turns follow this path):
 *   extractFacts() → classifyIntent() → IntentDataContract
 *   → resolver.fetch() → resolver.format() → LLM generates answer
 *
 * IntentCategory: 8 domain-typed categories (not operation verbs)
 * IntentDataContract: { intent, questions, entities, time_range, confidence }
 * Resolver interface: matches() + dataRequirements() + fetch() + format()
 *
 * To add a new banking domain:
 *   1. Add Resolver object
 *   2. Push to RESOLVER_REGISTRY
 *   — zero changes to engine core.
 */
// ═════════════════════════════════════════════════════════════════════════════
// Shared helpers (pure, no side-effects)
// ═════════════════════════════════════════════════════════════════════════════
function homeCurrency(kf) {
    return String(kf.profileCurrency ?? kf.currency ?? "GBP");
}
function goalCurrency(kf) {
    return String(kf.targetCurrency ?? homeCurrency(kf));
}
function numFact(kf, ...keys) {
    for (const k of keys)
        if (typeof kf[k] === "number")
            return kf[k];
    return null;
}
async function safeVectorFetch(vq, userId, query) {
    try {
        return await vq.getContext(userId, query, { topK: 8 });
    }
    catch {
        return "";
    }
}
// ═════════════════════════════════════════════════════════════════════════════
// RESOLVERS — one per domain, fully self-contained
// ═════════════════════════════════════════════════════════════════════════════
const AccountInsightResolver = {
    name: "AccountInsightResolver",
    matches: (c) => c.intent === "ACCOUNT_INSIGHT",
    dataRequirements: () => [
        { key: "balance", source: "knownFacts" },
        { key: "dbContext", source: "vectorDB", query: "account balance limits currency profile" },
    ],
    fetch: async (userId, contract, kf, vq) => {
        const dbContext = await safeVectorFetch(vq, userId, `account balance limits ${contract.entities.join(" ")} ${contract.time_range}`);
        return { facts: kf, dbContext };
    },
    format: (payload, contract) => {
        const hc = homeCurrency(payload.facts);
        const bal = numFact(payload.facts, "availableSavings", "currentBalance", "spendable_savings");
        const lines = [`Account insight — ${contract.entities.join(", ")} (${contract.time_range}):`];
        if (bal != null)
            lines.push(`  Spendable balance: ${hc}${bal.toFixed(2)}`);
        if (payload.dbContext)
            lines.push(`\nDB:\n${payload.dbContext.slice(0, 800)}`);
        return lines.join("\n");
    },
};
const TransactionAnalysisResolver = {
    name: "TransactionAnalysisResolver",
    matches: (c) => c.intent === "TRANSACTION_ANALYSIS",
    dataRequirements: () => [
        { key: "surplus", source: "knownFacts" },
        { key: "dbContext", source: "vectorDB", query: "transactions cashflow income expenses monthly" },
    ],
    fetch: async (userId, contract, kf, vq) => {
        const dbContext = await safeVectorFetch(vq, userId, `transactions cashflow income expenses ${contract.time_range} ${contract.questions.join(" ")}`);
        return { facts: kf, dbContext };
    },
    format: (payload, contract) => {
        const hc = homeCurrency(payload.facts);
        const surplus = numFact(payload.facts, "netMonthlySavings", "netMonthlySurplus");
        const lines = [`Transaction analysis — ${contract.questions.join(", ")} (${contract.time_range}):`];
        if (surplus != null)
            lines.push(`  Monthly net surplus: ${hc}${surplus.toFixed(0)}`);
        if (payload.dbContext)
            lines.push(`\nDB:\n${payload.dbContext.slice(0, 1000)}`);
        return lines.join("\n");
    },
};
const InvestmentInsightResolver = {
    name: "InvestmentInsightResolver",
    matches: (c) => c.intent === "INVESTMENT_INSIGHT",
    dataRequirements: () => [
        { key: "dbContext", source: "vectorDB", query: "investment portfolio ISA funds performance valuation holdings" },
    ],
    fetch: async (userId, contract, kf, vq) => {
        const dbContext = await safeVectorFetch(vq, userId, `investment portfolio ${contract.entities.join(" ")} performance ${contract.questions.join(" ")} ${contract.time_range}`);
        return { facts: kf, dbContext };
    },
    format: (payload, contract) => `Investment insight — ${contract.entities.join(", ")} | ${contract.questions.join(", ")} (${contract.time_range}):\n` +
        (payload.dbContext.slice(0, 1200) || "No investment data found in DB."),
};
const LoanPlanningResolver = {
    name: "LoanPlanningResolver",
    matches: (c) => c.intent === "LOAN_PLANNING",
    dataRequirements: () => [
        { key: "targetAmount", source: "knownFacts" },
        { key: "surplus", source: "knownFacts" },
        { key: "savings", source: "knownFacts" },
    ],
    fetch: async (_userId, _contract, kf) => ({ facts: kf, dbContext: "" }),
    format: (payload, _contract) => {
        const hc = homeCurrency(payload.facts);
        const gc = goalCurrency(payload.facts);
        const amt = numFact(payload.facts, "targetAmount");
        const surplus = numFact(payload.facts, "netMonthlySavings", "netMonthlySurplus");
        const savings = numFact(payload.facts, "availableSavings", "spendable_savings", "currentBalance");
        if (amt == null)
            return "Target loan/purchase amount not in session — ask user for the amount.";
        const periods = [3, 6, 12, 24];
        const lines = [`Loan/instalment schedule for ${gc}${amt.toFixed(0)}:`];
        for (const p of periods) {
            lines.push(`  ${String(p).padStart(2)} months:  ${gc}${(amt / p).toFixed(0)}/month`);
        }
        if (surplus != null) {
            const fits = periods.filter(p => amt / p <= surplus);
            lines.push(fits.length
                ? `Fundable from surplus (${hc}${surplus.toFixed(0)}/mo): ${fits.map(p => `${p}m`).join(", ")}`
                : `Requires savings draw — no period fits within ${hc}${surplus.toFixed(0)} surplus`);
        }
        if (savings != null)
            lines.push(`Savings after lump sum: ${hc}${(savings - amt).toFixed(0)}`);
        return lines.join("\n");
    },
};
const GoalPlanningResolver = {
    name: "GoalPlanningResolver",
    matches: (c) => c.intent === "GOAL_PLANNING",
    dataRequirements: () => [
        { key: "surplus", source: "knownFacts" },
        { key: "savings", source: "knownFacts" },
        { key: "dbContext", source: "vectorDB", query: "savings goals targets milestones timeline" },
    ],
    fetch: async (userId, contract, kf, vq) => {
        const dbContext = await safeVectorFetch(vq, userId, `savings goals ${contract.entities.join(" ")} timeline ${contract.time_range}`);
        return { facts: kf, dbContext };
    },
    format: (payload, contract) => {
        const hc = homeCurrency(payload.facts);
        const surplus = numFact(payload.facts, "netMonthlySavings", "netMonthlySurplus");
        const savings = numFact(payload.facts, "availableSavings", "spendable_savings", "currentBalance");
        const amt = numFact(payload.facts, "targetAmount");
        const lines = [`Goal planning — ${contract.entities.join(", ")}:`];
        if (savings != null)
            lines.push(`  Current savings: ${hc}${savings.toFixed(0)}`);
        if (surplus != null)
            lines.push(`  Monthly surplus: ${hc}${surplus.toFixed(0)}`);
        if (amt != null && surplus != null && surplus > 0) {
            lines.push(`  Months to reach ${hc}${amt.toFixed(0)}: ${Math.ceil(amt / surplus)}`);
        }
        if (payload.dbContext)
            lines.push(`\nDB:\n${payload.dbContext.slice(0, 1000)}`);
        return lines.join("\n");
    },
};
const AssetEvaluationResolver = {
    name: "AssetEvaluationResolver",
    matches: (c) => c.intent === "ASSET_EVALUATION",
    dataRequirements: () => [
        { key: "targetAmount", source: "knownFacts" },
        { key: "surplus", source: "knownFacts" },
        { key: "savings", source: "knownFacts" },
        { key: "dbContext", source: "vectorDB", query: "savings balance emergency buffer affordability" },
    ],
    fetch: async (userId, contract, kf, vq) => {
        const dbContext = await safeVectorFetch(vq, userId, `affordability ${contract.entities.join(" ")} savings balance ${contract.time_range}`);
        return { facts: kf, dbContext };
    },
    format: (payload, contract) => {
        const hc = homeCurrency(payload.facts);
        const gc = goalCurrency(payload.facts);
        const amt = numFact(payload.facts, "targetAmount");
        const surplus = numFact(payload.facts, "netMonthlySavings", "netMonthlySurplus");
        const savings = numFact(payload.facts, "availableSavings", "spendable_savings", "currentBalance");
        if (amt == null) {
            return `No target amount in session for ${contract.entities.join(", ")} — use DB context.\n${payload.dbContext.slice(0, 800)}`;
        }
        const lines = [`Asset evaluation — ${contract.entities.join(", ")} | ${contract.questions.join(", ")}:`];
        lines.push(`  Purchase cost:      ${gc}${amt.toFixed(0)}`);
        if (savings != null) {
            const buffer = savings * 0.45;
            const headroom = savings - buffer;
            lines.push(`  Spendable savings:  ${hc}${savings.toFixed(0)}   (buffer: ${hc}${buffer.toFixed(0)})`);
            lines.push(`  Available headroom: ${hc}${headroom.toFixed(0)}`);
            lines.push(headroom >= amt
                ? `  ✓ Affordable in full from savings`
                : `  ✗ Shortfall: ${gc}${(amt - headroom).toFixed(0)}`);
        }
        if (surplus != null)
            lines.push(`  Monthly surplus:    ${hc}${surplus.toFixed(0)}`);
        if (payload.dbContext)
            lines.push(`\nDB:\n${payload.dbContext.slice(0, 600)}`);
        return lines.join("\n");
    },
};
const RiskAlertResolver = {
    name: "RiskAlertResolver",
    matches: (c) => c.intent === "RISK_ALERT",
    dataRequirements: () => [
        { key: "dbContext", source: "vectorDB", query: "subscriptions recurring charges anomalies compliance alerts" },
    ],
    fetch: async (userId, contract, kf, vq) => {
        const dbContext = await safeVectorFetch(vq, userId, `subscriptions recurring charges ${contract.entities.join(" ")} ${contract.questions.join(" ")}`);
        return { facts: kf, dbContext };
    },
    format: (payload, contract) => `Risk/alert analysis — ${contract.entities.join(", ")} | ${contract.questions.join(", ")}:\n` +
        (payload.dbContext.slice(0, 1200) || "No subscription or alert data found in DB."),
};
const GeneralExplorationResolver = {
    name: "GeneralExplorationResolver",
    matches: (c) => c.intent === "GENERAL_EXPLORATION",
    dataRequirements: () => [],
    fetch: async (_u, _c, kf) => ({ facts: kf, dbContext: "" }),
    format: () => "", // LLM reasons freely from conversation history
};
// ═════════════════════════════════════════════════════════════════════════════
// RESOLVER_REGISTRY — add new domain → push one Resolver here, done.
// ═════════════════════════════════════════════════════════════════════════════
const RESOLVER_REGISTRY = [
    AccountInsightResolver,
    TransactionAnalysisResolver,
    InvestmentInsightResolver,
    LoanPlanningResolver,
    GoalPlanningResolver,
    AssetEvaluationResolver,
    RiskAlertResolver,
    GeneralExplorationResolver, // must stay last — catch-all
];
// ═════════════════════════════════════════════════════════════════════════════
// BankingReasoningEngine — v3
// Thin orchestrator. No domain logic lives here.
// ═════════════════════════════════════════════════════════════════════════════
export class BankingReasoningEngine {
    llm;
    vectorQuery;
    constructor(llm, vectorQuery) {
        this.llm = llm;
        this.vectorQuery = vectorQuery;
    }
    async run(state) {
        const history = state.conversationHistory ?? [];
        console.log(`[EngineV3] question="${state.question}" historyLen=${history.length}`);
        // ─────────────────────────────────────────────────────────────────────
        // STEP 0 — Confirmation fast-path (runs BEFORE any LLM call)
        //
        // Two ways to detect a pending offer — BOTH must fail before we proceed:
        //   A) _pendingOffer in knownFacts (persisted across restarts via sessionRepo)
        //   B) last assistant message in history contains an offer phrase
        //
        // If either fires AND the user is being affirmative, skip extractFacts +
        // classifyIntent entirely and deliver the promised schedule directly.
        // ─────────────────────────────────────────────────────────────────────
        const wordCount = state.question.trim().split(/\s+/).length;
        const isAffirmative = /^(yes|yeah|sure|ok|okay|please|yep|go ahead|do it|do that|yes please|sounds good|absolutely|of course|great|perfect|please do|definitely|run it|show me|go for it|lets do it|let's do it)\b/i.test(state.question.trim());
        const storedOffer = typeof state.knownFacts?._pendingOffer === "string"
            ? state.knownFacts._pendingOffer
            : null;
        const lastAssistant0 = [...history].reverse().find(m => m.role === "assistant")?.content ?? "";
        const historyOffer = /want me to|shall i|would you like|let me|i can show|i can work|i can calculate|run the numbers/i.test(lastAssistant0);
        console.log(`[EngineV3] step0: wordCount=${wordCount} isAff=${isAffirmative} ` +
            `storedOffer="${storedOffer?.slice(0, 50) ?? "null"}" historyOffer=${historyOffer} ` +
            `lastAssistantLen=${lastAssistant0.length}`);
        if (isAffirmative && wordCount <= 12 && (storedOffer || historyOffer)) {
            // Resolve the task description
            let priorTask = storedOffer ?? "";
            if (!priorTask && historyOffer) {
                const tm = lastAssistant0.match(/(?:want me to|shall i|i can show you?|i can|would you like me to|let me|run the numbers on)\s+([^.?!\n]{5,180})/i);
                priorTask = tm ? tm[1].trim() : "run the instalment schedule";
            }
            const fastFacts = { ...(state.knownFacts ?? {}), _pendingOffer: null };
            console.log(`[EngineV3] CONFIRMATION fast-path → priorTask="${priorTask.slice(0, 80)}"`);
            const answer = await this.deliverPriorOffer(state, history, priorTask, fastFacts);
            return { finalAnswer: answer, missingFacts: [], knownFacts: fastFacts };
        }
        // 1. Extract facts from current message, merge with session
        const { extractedFacts, missingFacts, followUpQuestion } = await this.extractFacts(state, history);
        const mergedFacts = { ...(state.knownFacts ?? {}), ...extractedFacts };
        // 2. If critical facts are missing → ask before reasoning
        if (missingFacts.length > 0) {
            return { finalAnswer: followUpQuestion, missingFacts, knownFacts: mergedFacts };
        }
        // 3. Classify intent → IntentDataContract
        const contract = await this.classifyIntent(state, history, mergedFacts);
        console.log(`[EngineV3] intent=${contract.intent} confidence=${contract.confidence} ` +
            `entities=[${contract.entities.join(",")}] questions=[${contract.questions.join(",")}]`);
        // 4. Greeting short-circuit (no history, exploration)
        if (contract.intent === "GENERAL_EXPLORATION" && history.length === 0) {
            return {
                finalAnswer: "Hello! I'm your AI banking advisor. Ask me about accounts, investments, loans, goals, subscriptions, or spending analysis.",
                missingFacts: [],
                knownFacts: mergedFacts,
            };
        }
        // 5. Find matching resolver (RESOLVER_REGISTRY order matters — GeneralExploration is last)
        const resolver = RESOLVER_REGISTRY.find(r => r.matches(contract)) ?? GeneralExplorationResolver;
        console.log(`[EngineV3] resolver=${resolver.name}`);
        // 6. Resolver self-fetches its data
        const payload = await resolver.fetch(state.userId, contract, mergedFacts, this.vectorQuery);
        // 7. Resolver formats pre-computed data table for LLM
        const precomputed = resolver.format(payload, contract);
        // 8. LLM generates user-facing answer using pre-computed data
        const answer = await this.generateAnswer(state, history, contract, precomputed, mergedFacts);
        // 9. Persist any offer embedded in the answer so Turn N+1 can detect it
        //    even if the process restarts (Railway resets in-memory state).
        const newOfferMatch = answer.match(/(?:want me to|shall i|would you like me to)\s+([^.?!\n]{5,180})/i);
        mergedFacts._pendingOffer = newOfferMatch ? newOfferMatch[1].trim() : null;
        console.log(`[EngineV3] _pendingOffer stored: "${String(mergedFacts._pendingOffer).slice(0, 60)}"`);
        return { finalAnswer: answer, missingFacts: [], knownFacts: mergedFacts };
    }
    // ─── Intent Classifier ──────────────────────────────────────────────────────
    async classifyIntent(state, history, mergedFacts) {
        const recentStr = history
            .slice(-6)
            .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n");
        const lastAssistant = [...history].reverse().find(m => m.role === "assistant")?.content ?? "";
        const wordCount = state.question.trim().split(/\s+/).length;
        const hasOffer = /want me to|shall i|would you like|let me|i can show|i can work|i can calculate/i.test(lastAssistant);
        const isAffirmative = /^(yes|sure|ok|okay|please|yep|go ahead|do it|yes please|sounds good|absolutely|of course|great|perfect|please do|definitely)\b/i.test(state.question.trim());
        // Deterministic fast-path: short affirmative after an explicit offer.
        // IMPORTANT: do NOT call classifyFromPriorTask here — the LLM will omit the
        // priorTask field in its JSON response, causing the short-circuit in run() to
        // silently fall through to the resolver (which re-runs affordability).
        // Instead return the contract directly with priorTask guaranteed to be set.
        if (wordCount <= 10 && hasOffer && isAffirmative) {
            const taskMatch = lastAssistant.match(/(?:want me to|shall i|i can show you?|i can|would you like me to|let me)\s+([^.?!\n]{10,180})/i);
            const priorTask = taskMatch ? taskMatch[1].trim() : "continue from the last offer";
            console.log(`[EngineV3] deterministic CONFIRM — bypassing LLM, priorTask="${priorTask.slice(0, 80)}"`);
            // intent is irrelevant here — run() short-circuits on priorTask before any resolver is touched
            return { intent: "LOAN_PLANNING", questions: [], entities: [], time_range: "n/a", confidence: 1.0, priorTask };
        }
        try {
            const contract = await this.llm.generateJSON(`
You are an intent classifier for a banking AI assistant. Return ONLY valid JSON, no markdown.

RECENT CONVERSATION:
${recentStr}

USER MESSAGE: "${state.question}"

KNOWN SESSION FACTS: ${JSON.stringify(mergedFacts)}

Classify into ONE IntentCategory:
  ACCOUNT_INSIGHT      — balance, account status, limits, currency overview
  TRANSACTION_ANALYSIS — spending patterns, cashflow, statement, income vs expenses
  INVESTMENT_INSIGHT   — portfolio, ISA, funds, Premium Bonds, performance, allocation
  LOAN_PLANNING        — instalment plan, repayment schedule, 0% credit, mortgage
  GOAL_PLANNING        — savings goals, milestone, timeline, monthly saving target
  ASSET_EVALUATION     — trip, car, house, any major purchase — affordability check
  RISK_ALERT           — subscriptions, recurring charges, anomalies, fraud, compliance
  GENERAL_EXPLORATION  — greeting, thanks, unclear, does not fit any above

Rules:
- If user agreed to a prior assistant offer → reuse the intent from that offer.
- New purchase/trip question → ASSET_EVALUATION.
- If unclear → GENERAL_EXPLORATION with confidence below 0.5.

Return:
{
  "intent": "ASSET_EVALUATION",
  "questions": ["affordability", "instalment options"],
  "entities": ["Paris trip", "EUR 2200"],
  "time_range": "n/a",
  "confidence": 0.92
}
`);
            return contract;
        }
        catch {
            return { intent: "GENERAL_EXPLORATION", questions: [], entities: [], time_range: "n/a", confidence: 0.3 };
        }
    }
    async classifyFromPriorTask(priorTask, mergedFacts) {
        try {
            return await this.llm.generateJSON(`
Classify the following banking task into an IntentDataContract. Return ONLY valid JSON.

TASK: "${priorTask}"
KNOWN FACTS: ${JSON.stringify(mergedFacts)}

IntentCategory options:
  ACCOUNT_INSIGHT | TRANSACTION_ANALYSIS | INVESTMENT_INSIGHT | LOAN_PLANNING
  GOAL_PLANNING   | ASSET_EVALUATION     | RISK_ALERT         | GENERAL_EXPLORATION

Return:
{
  "intent": "LOAN_PLANNING",
  "questions": ["schedule", "monthly payment"],
  "entities": ["Paris trip", "EUR 2200"],
  "time_range": "n/a",
  "confidence": 0.95,
  "priorTask": "${priorTask.replace(/"/g, '\\"')}"
}
`);
        }
        catch {
            // Safe fallback: treat as loan planning (most common confirmed-offer case)
            return {
                intent: "LOAN_PLANNING",
                questions: ["schedule"],
                entities: [],
                time_range: "n/a",
                confidence: 0.8,
                priorTask,
            };
        }
    }
    // ─── Fact Extractor ─────────────────────────────────────────────────────────
    async extractFacts(state, history) {
        const recentStr = history
            .slice(-4)
            .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n");
        try {
            const result = await this.llm.generateJSON(`
You are a fact extractor for a banking assistant. Return ONLY valid JSON, no markdown.

CONVERSATION:
${recentStr}

CURRENT MESSAGE: "${state.question}"

ALREADY KNOWN (do NOT ask again): ${JSON.stringify(state.knownFacts ?? {})}

Extract facts stated explicitly in the CURRENT message:
  goalType       : string | null  (trip, car, phone, house, etc.)
  destination    : string | null  (city or country)
  targetAmount   : number | null  (parse "2200 euros" → 2200)
  targetCurrency : string | null  (EUR, GBP, USD, etc.)
  duration       : string | null  ("3 days", "2 weeks")
  timeframe      : string | null  ("next month", "this year")

Set to null if not stated in this specific message.

Missing facts (only when ALL of the following are true):
  - Query is about a specific purchase or affordability check
  - targetAmount is absent from BOTH this message AND already-known facts
  - This is NOT a general banking question (investments, balance, subscriptions, etc.)

For all other query types → missingFacts: []

Return:
{
  "extractedFacts": { "goalType": null, "destination": null, "targetAmount": null, "targetCurrency": null, "duration": null, "timeframe": null },
  "missingFacts": [],
  "followUpQuestion": null
}
`);
            const cleanFacts = Object.fromEntries(Object.entries(result.extractedFacts ?? {}).filter(([, v]) => v !== null && v !== undefined));
            // Never let goal currency overwrite the user's home currency
            if (cleanFacts.targetCurrency) {
                const home = (state.knownFacts?.profileCurrency ?? state.knownFacts?.currency);
                if (home && cleanFacts.targetCurrency !== home)
                    delete cleanFacts.currency;
            }
            return {
                extractedFacts: cleanFacts,
                missingFacts: Array.isArray(result.missingFacts) ? result.missingFacts : [],
                followUpQuestion: result.followUpQuestion ?? "Could you give me a bit more detail?",
            };
        }
        catch {
            return { extractedFacts: {}, missingFacts: [], followUpQuestion: "" };
        }
    }
    // ─── Confirmed-offer Delivery (bypasses resolver + DB entirely) ─────────────
    // Called when user said YES to a prior assistant offer.
    // Computes the plan deterministically from knownFacts, then asks LLM to format it.
    // NEVER re-runs affordability analysis. NEVER queries the vector DB.
    async deliverPriorOffer(state, history, priorTask, kf) {
        const hc = homeCurrency(kf);
        const gc = goalCurrency(kf);
        const amt = numFact(kf, "targetAmount");
        const surplus = numFact(kf, "netMonthlySavings", "netMonthlySurplus");
        const savings = numFact(kf, "availableSavings", "spendable_savings", "currentBalance");
        // Pre-compute schedule in TypeScript — zero LLM calls for data, zero DB calls
        const scheduleLines = [];
        const isScheduleTask = /schedule|instalment|installment|plan|payment|repay|breakdown|spread|monthly/i.test(priorTask);
        if (isScheduleTask && amt != null) {
            const periods = [3, 6, 12, 24];
            scheduleLines.push(`0% instalment options for ${gc}${amt.toFixed(0)}:`);
            for (const p of periods) {
                const monthly = (amt / p).toFixed(0);
                const fits = surplus != null && amt / p <= surplus;
                scheduleLines.push(`  ${String(p).padStart(2)} months → ${gc}${monthly}/month${fits ? " ✓ fits surplus" : ""}`);
            }
            if (surplus != null) {
                const affordable = periods.filter(p => amt / p <= surplus);
                scheduleLines.push(affordable.length
                    ? `Plans fitting your ${hc}${surplus.toFixed(0)}/month surplus: ${affordable.map(p => `${p}m`).join(", ")}`
                    : `All options exceed your ${hc}${surplus.toFixed(0)}/month surplus — savings draw needed`);
            }
            if (savings != null) {
                scheduleLines.push(`Lump-sum option: pay ${gc}${amt.toFixed(0)} now, ${hc}${(savings - amt).toFixed(0)} savings remaining`);
            }
        }
        const precomputedBlock = scheduleLines.length
            ? scheduleLines.join("\n")
            : `Task: ${priorTask}`;
        // Deliberately minimal prompt — no conversation history to avoid LLM re-summarising it.
        // The only context given is the pre-computed numbers so there is nothing to hallucinate.
        return this.llm.generateText(`OUTPUT ONLY a short payment schedule. Do not write any other sentences.

SCHEDULE DATA (copy these numbers exactly, do not recalculate):
${precomputedBlock}

FORMAT RULES (strict):
- First line: "Here are your 0% instalment options for ${gc}${amt?.toFixed(0) ?? "the amount"}:"
- Then one bullet per period: "• X months → ${gc}Y/month"
- If a plan fits the monthly surplus, append " (fits your budget)"
- Last line: "Lump-sum: pay ${gc}${amt?.toFixed(0) ?? "the amount"} now, ${hc}${amt != null && savings != null ? (savings - amt).toFixed(0) : "?"} remaining in savings."
- Final line: "Which option works best for you?"
- NO sentences about affordability, savings balance, emergency buffer, or goals.
- NO introductory phrases like "Sure", "Great", "Based on", "You can afford".
- Maximum 8 lines total.`);
    }
    // ─── LLM Answer Generator ────────────────────────────────────────────────────
    async generateAnswer(state, history, contract, precomputed, mergedFacts) {
        const recentStr = history
            .slice(-6)
            .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n");
        const hc = homeCurrency(mergedFacts);
        const gc = goalCurrency(mergedFacts);
        return this.llm.generateText(`
You are a senior banking advisor. Deliver a specific, data-driven response.

CONVERSATION:
${recentStr}
User: ${state.question}

INTENT: ${contract.intent}
TOPICS: ${contract.questions.join(", ") || "general"}
ENTITIES: ${contract.entities.join(", ") || "n/a"}
TIME RANGE: ${contract.time_range}
${contract.priorTask ? `CONFIRMED TASK: "${contract.priorTask}"` : ""}

PRE-COMPUTED DATA (use these numbers exactly — do not recalculate):
${precomputed || "(no pre-computed data — reason from conversation history)"}

RULES:
1. If CONFIRMED TASK is set, deliver ONLY that specific analysis — nothing else.
2. Do NOT restate affordability if already summarised and you are delivering a plan.
3. Start with the first concrete number, verdict, or step — never with "Based on", "Your", "Given".
4. Use bullet points or a numbered list for multi-item answers.
5. Maximum 6 lines or 4 bullet points.
6. End with exactly ONE forward-looking offer starting "Want me to..." or "Shall I...".
7. Use ${hc} for home-currency amounts, ${gc} for goal-specific amounts.
`);
    }
}
