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

import { LlmClient } from "../llm/llmClient.js";
import { VectorQueryService } from "../services/vector.query.service.js";
import type { GraphStateType } from "../graph/state.js";

// ─────────────────────────────────────────────────────────────────────────────
// Domain Intent Taxonomy
// Describes what the USER is thinking about — not which backend API to call.
// ─────────────────────────────────────────────────────────────────────────────

export type IntentCategory =
  | "ACCOUNT_INSIGHT"       // balance, account status, limits, overview
  | "TRANSACTION_ANALYSIS"  // spending patterns, cashflow, statement, income vs expenses
  | "INVESTMENT_INSIGHT"    // portfolio, ISA, funds, Premium Bonds, performance, allocation
  | "LOAN_PLANNING"         // instalment plan, repayment schedule, 0% credit, mortgage
  | "GOAL_PLANNING"         // savings goals, milestones, timeline, monthly target
  | "ASSET_EVALUATION"      // trip cost, car, house, major purchase — affordability check
  | "RISK_ALERT"            // subscriptions, recurring anomalies, compliance, fraud
  | "GENERAL_EXPLORATION";  // greeting, thanks, unclear — zero pre-computation

// ─────────────────────────────────────────────────────────────────────────────
// IntentDataContract
// Emitted by the LLM classifier. Resolvers consume this — engine never hardcodes
// which resolver handles which data shape.
// ─────────────────────────────────────────────────────────────────────────────

export interface IntentDataContract {
  intent:     IntentCategory;
  questions:  string[];    // e.g. ["trend", "performance", "allocation"]
  entities:   string[];    // e.g. ["ISA", "Premium Bonds", "Japan trip", "2200 EUR"]
  time_range: string;      // e.g. "12M", "3M", "YTD", "n/a"
  confidence: number;      // 0–1
  priorTask?: string;      // set when user confirmed a prior assistant offer
}

// ─────────────────────────────────────────────────────────────────────────────
// DataSpec — declares what a resolver needs (self-documented)
// ─────────────────────────────────────────────────────────────────────────────

export interface DataSpec {
  key:    string;
  source: "knownFacts" | "vectorDB" | "none";
  query?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DataPayload — produced by resolver.fetch()
// ─────────────────────────────────────────────────────────────────────────────

export interface DataPayload {
  facts:     Record<string, unknown>;
  dbContext: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver interface — self-contained, pluggable
// Engine calls: matches() → fetch() → format()
// Engine never knows what data any resolver needs.
// ─────────────────────────────────────────────────────────────────────────────

export interface Resolver {
  name: string;
  matches(contract: IntentDataContract): boolean;
  dataRequirements(contract: IntentDataContract): DataSpec[];
  fetch(
    userId: string,
    contract: IntentDataContract,
    knownFacts: Record<string, unknown>,
    vectorQuery: VectorQueryService
  ): Promise<DataPayload>;
  format(payload: DataPayload, contract: IntentDataContract): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// EngineResult
// ─────────────────────────────────────────────────────────────────────────────

export interface EngineResult {
  finalAnswer:  string;
  missingFacts: string[];
  knownFacts:   Record<string, unknown>;
}

// ═════════════════════════════════════════════════════════════════════════════
// Shared helpers (pure, no side-effects)
// ═════════════════════════════════════════════════════════════════════════════

function homeCurrency(kf: Record<string, unknown>): string {
  return String(kf.profileCurrency ?? kf.currency ?? "GBP");
}

function goalCurrency(kf: Record<string, unknown>): string {
  return String(kf.targetCurrency ?? homeCurrency(kf));
}

function numFact(kf: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) if (typeof kf[k] === "number") return kf[k] as number;
  return null;
}

async function safeVectorFetch(
  vq: VectorQueryService,
  userId: string,
  query: string
): Promise<string> {
  try {
    return await vq.getContext(userId, query, { topK: 8 });
  } catch {
    return "";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// RESOLVERS — one per domain, fully self-contained
// ═════════════════════════════════════════════════════════════════════════════

const AccountInsightResolver: Resolver = {
  name: "AccountInsightResolver",
  matches: (c) => c.intent === "ACCOUNT_INSIGHT",
  dataRequirements: () => [
    { key: "balance",   source: "knownFacts" },
    { key: "dbContext", source: "vectorDB",  query: "account balance limits currency profile" },
  ],
  fetch: async (userId, contract, kf, vq) => {
    const dbContext = await safeVectorFetch(
      vq, userId,
      `account balance limits ${contract.entities.join(" ")} ${contract.time_range}`
    );
    return { facts: kf, dbContext };
  },
  format: (payload, contract) => {
    const hc  = homeCurrency(payload.facts);
    const bal = numFact(payload.facts, "availableSavings", "currentBalance", "spendable_savings");
    const lines = [`Account insight — ${contract.entities.join(", ")} (${contract.time_range}):`];
    if (bal != null) lines.push(`  Spendable balance: ${hc}${bal.toFixed(2)}`);
    if (payload.dbContext) lines.push(`\nDB:\n${payload.dbContext.slice(0, 800)}`);
    return lines.join("\n");
  },
};

const TransactionAnalysisResolver: Resolver = {
  name: "TransactionAnalysisResolver",
  matches: (c) => c.intent === "TRANSACTION_ANALYSIS",
  dataRequirements: () => [
    { key: "surplus",   source: "knownFacts" },
    { key: "dbContext", source: "vectorDB",  query: "transactions cashflow income expenses monthly" },
  ],
  fetch: async (userId, contract, kf, vq) => {
    const dbContext = await safeVectorFetch(
      vq, userId,
      `transactions cashflow income expenses ${contract.time_range} ${contract.questions.join(" ")}`
    );
    return { facts: kf, dbContext };
  },
  format: (payload, contract) => {
    const hc      = homeCurrency(payload.facts);
    const surplus = numFact(payload.facts, "netMonthlySavings", "netMonthlySurplus");
    const lines   = [`Transaction analysis — ${contract.questions.join(", ")} (${contract.time_range}):`];
    if (surplus != null) lines.push(`  Monthly net surplus: ${hc}${surplus.toFixed(0)}`);
    if (payload.dbContext) lines.push(`\nDB:\n${payload.dbContext.slice(0, 1000)}`);
    return lines.join("\n");
  },
};

const InvestmentInsightResolver: Resolver = {
  name: "InvestmentInsightResolver",
  matches: (c) => c.intent === "INVESTMENT_INSIGHT",
  dataRequirements: () => [
    { key: "dbContext", source: "vectorDB", query: "investment portfolio ISA funds performance valuation holdings" },
  ],
  fetch: async (userId, contract, kf, vq) => {
    const dbContext = await safeVectorFetch(
      vq, userId,
      `investment portfolio ${contract.entities.join(" ")} performance ${contract.questions.join(" ")} ${contract.time_range}`
    );
    return { facts: kf, dbContext };
  },
  format: (payload, contract) =>
    `Investment insight — ${contract.entities.join(", ")} | ${contract.questions.join(", ")} (${contract.time_range}):\n` +
    (payload.dbContext.slice(0, 1200) || "No investment data found in DB."),
};

const LoanPlanningResolver: Resolver = {
  name: "LoanPlanningResolver",
  matches: (c) => c.intent === "LOAN_PLANNING",
  dataRequirements: () => [
    { key: "targetAmount", source: "knownFacts" },
    { key: "surplus",      source: "knownFacts" },
    { key: "savings",      source: "knownFacts" },
  ],
  fetch: async (_userId, _contract, kf) => ({ facts: kf, dbContext: "" }),
  format: (payload, _contract) => {
    const hc      = homeCurrency(payload.facts);
    const gc      = goalCurrency(payload.facts);
    const amt     = numFact(payload.facts, "targetAmount");
    const surplus = numFact(payload.facts, "netMonthlySavings", "netMonthlySurplus");
    const savings = numFact(payload.facts, "availableSavings", "spendable_savings", "currentBalance");
    if (amt == null) return "Target loan/purchase amount not in session — ask user for the amount.";
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
    if (savings != null) lines.push(`Savings after lump sum: ${hc}${(savings - amt).toFixed(0)}`);
    return lines.join("\n");
  },
};

const GoalPlanningResolver: Resolver = {
  name: "GoalPlanningResolver",
  matches: (c) => c.intent === "GOAL_PLANNING",
  dataRequirements: () => [
    { key: "surplus",   source: "knownFacts" },
    { key: "savings",   source: "knownFacts" },
    { key: "dbContext", source: "vectorDB",  query: "savings goals targets milestones timeline" },
  ],
  fetch: async (userId, contract, kf, vq) => {
    const dbContext = await safeVectorFetch(
      vq, userId,
      `savings goals ${contract.entities.join(" ")} timeline ${contract.time_range}`
    );
    return { facts: kf, dbContext };
  },
  format: (payload, contract) => {
    const hc      = homeCurrency(payload.facts);
    const surplus = numFact(payload.facts, "netMonthlySavings", "netMonthlySurplus");
    const savings = numFact(payload.facts, "availableSavings", "spendable_savings", "currentBalance");
    const amt     = numFact(payload.facts, "targetAmount");
    const lines   = [`Goal planning — ${contract.entities.join(", ")}:`];
    if (savings != null) lines.push(`  Current savings: ${hc}${savings.toFixed(0)}`);
    if (surplus != null) lines.push(`  Monthly surplus: ${hc}${surplus.toFixed(0)}`);
    if (amt != null && surplus != null && surplus > 0) {
      lines.push(`  Months to reach ${hc}${amt.toFixed(0)}: ${Math.ceil(amt / surplus)}`);
    }
    if (payload.dbContext) lines.push(`\nDB:\n${payload.dbContext.slice(0, 1000)}`);
    return lines.join("\n");
  },
};

const AssetEvaluationResolver: Resolver = {
  name: "AssetEvaluationResolver",
  matches: (c) => c.intent === "ASSET_EVALUATION",
  dataRequirements: () => [
    { key: "targetAmount", source: "knownFacts" },
    { key: "surplus",      source: "knownFacts" },
    { key: "savings",      source: "knownFacts" },
    { key: "dbContext",    source: "vectorDB",  query: "savings balance emergency buffer affordability" },
  ],
  fetch: async (userId, contract, kf, vq) => {
    const dbContext = await safeVectorFetch(
      vq, userId,
      `affordability ${contract.entities.join(" ")} savings balance ${contract.time_range}`
    );
    return { facts: kf, dbContext };
  },
  format: (payload, contract) => {
    const hc      = homeCurrency(payload.facts);
    const gc      = goalCurrency(payload.facts);
    const amt     = numFact(payload.facts, "targetAmount");
    const surplus = numFact(payload.facts, "netMonthlySavings", "netMonthlySurplus");
    const savings = numFact(payload.facts, "availableSavings", "spendable_savings", "currentBalance");
    if (amt == null) {
      return `No target amount in session for ${contract.entities.join(", ")} — use DB context.\n${payload.dbContext.slice(0, 800)}`;
    }
    const lines = [`Asset evaluation — ${contract.entities.join(", ")} | ${contract.questions.join(", ")}:`];
    lines.push(`  Purchase cost:      ${gc}${amt.toFixed(0)}`);
    if (savings != null) {
      const buffer   = savings * 0.45;
      const headroom = savings - buffer;
      lines.push(`  Spendable savings:  ${hc}${savings.toFixed(0)}   (buffer: ${hc}${buffer.toFixed(0)})`);
      lines.push(`  Available headroom: ${hc}${headroom.toFixed(0)}`);
      lines.push(headroom >= amt
        ? `  ✓ Affordable in full from savings`
        : `  ✗ Shortfall: ${gc}${(amt - headroom).toFixed(0)}`);
    }
    if (surplus != null) lines.push(`  Monthly surplus:    ${hc}${surplus.toFixed(0)}`);
    if (payload.dbContext) lines.push(`\nDB:\n${payload.dbContext.slice(0, 600)}`);
    return lines.join("\n");
  },
};

const RiskAlertResolver: Resolver = {
  name: "RiskAlertResolver",
  matches: (c) => c.intent === "RISK_ALERT",
  dataRequirements: () => [
    { key: "dbContext", source: "vectorDB", query: "subscriptions recurring charges anomalies compliance alerts" },
  ],
  fetch: async (userId, contract, kf, vq) => {
    const dbContext = await safeVectorFetch(
      vq, userId,
      `subscriptions recurring charges ${contract.entities.join(" ")} ${contract.questions.join(" ")}`
    );
    return { facts: kf, dbContext };
  },
  format: (payload, contract) =>
    `Risk/alert analysis — ${contract.entities.join(", ")} | ${contract.questions.join(", ")}:\n` +
    (payload.dbContext.slice(0, 1200) || "No subscription or alert data found in DB."),
};

const GeneralExplorationResolver: Resolver = {
  name: "GeneralExplorationResolver",
  matches: (c) => c.intent === "GENERAL_EXPLORATION",
  dataRequirements: () => [],
  fetch: async (_u, _c, kf) => ({ facts: kf, dbContext: "" }),
  format: () => "",  // LLM reasons freely from conversation history
};

// ═════════════════════════════════════════════════════════════════════════════
// RESOLVER_REGISTRY — add new domain → push one Resolver here, done.
// ═════════════════════════════════════════════════════════════════════════════

const RESOLVER_REGISTRY: Resolver[] = [
  AccountInsightResolver,
  TransactionAnalysisResolver,
  InvestmentInsightResolver,
  LoanPlanningResolver,
  GoalPlanningResolver,
  AssetEvaluationResolver,
  RiskAlertResolver,
  GeneralExplorationResolver,  // must stay last — catch-all
];

// ═════════════════════════════════════════════════════════════════════════════
// BankingReasoningEngine — v3
// Thin orchestrator. No domain logic lives here.
// ═════════════════════════════════════════════════════════════════════════════

export class BankingReasoningEngine {
  constructor(
    private readonly llm: LlmClient,
    private readonly vectorQuery: VectorQueryService
  ) {}

  async run(state: GraphStateType): Promise<EngineResult> {
    const history = state.conversationHistory ?? [];
    console.log(`[EngineV3] question="${state.question}" historyLen=${history.length}`);

    // 1. Extract facts from current message, merge with session
    const { extractedFacts, missingFacts, followUpQuestion } =
      await this.extractFacts(state, history);
    const mergedFacts = { ...(state.knownFacts ?? {}), ...extractedFacts };

    // 2. If critical facts are missing → ask before reasoning
    if (missingFacts.length > 0) {
      return { finalAnswer: followUpQuestion, missingFacts, knownFacts: mergedFacts };
    }

    // 3. Classify intent → IntentDataContract
    const contract = await this.classifyIntent(state, history, mergedFacts);
    console.log(
      `[EngineV3] intent=${contract.intent} confidence=${contract.confidence} ` +
      `entities=[${contract.entities.join(",")}] questions=[${contract.questions.join(",")}]`
    );

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

    return { finalAnswer: answer, missingFacts: [], knownFacts: mergedFacts };
  }

  // ─── Intent Classifier ──────────────────────────────────────────────────────

  private async classifyIntent(
    state: GraphStateType,
    history: Array<{ role: string; content: string }>,
    mergedFacts: Record<string, unknown>
  ): Promise<IntentDataContract> {
    const recentStr = history
      .slice(-6)
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const lastAssistant = [...history].reverse().find(m => m.role === "assistant")?.content ?? "";
    const wordCount     = state.question.trim().split(/\s+/).length;
    const hasOffer      = /want me to|shall i|would you like|let me|i can show|i can work|i can calculate/i.test(lastAssistant);
    const isAffirmative = /^(yes|sure|ok|okay|please|yep|go ahead|do it|yes please|sounds good|absolutely|of course|great|perfect|please do|definitely)\b/i.test(state.question.trim());

    // Deterministic fast-path: short affirmative after an explicit offer
    if (wordCount <= 10 && hasOffer && isAffirmative) {
      const taskMatch = lastAssistant.match(
        /(?:want me to|shall i|i can show you?|i can|would you like me to|let me)\s+([^.?!\n]{10,180})/i
      );
      const priorTask = taskMatch ? taskMatch[1].trim() : "continue from the last offer";
      console.log(`[EngineV3] deterministic CONFIRM priorTask="${priorTask.slice(0, 60)}"`);
      return this.classifyFromPriorTask(priorTask, mergedFacts);
    }

    try {
      const contract = await this.llm.generateJSON<IntentDataContract>(`
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
    } catch {
      return { intent: "GENERAL_EXPLORATION", questions: [], entities: [], time_range: "n/a", confidence: 0.3 };
    }
  }

  private async classifyFromPriorTask(
    priorTask: string,
    mergedFacts: Record<string, unknown>
  ): Promise<IntentDataContract> {
    try {
      return await this.llm.generateJSON<IntentDataContract>(`
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
    } catch {
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

  private async extractFacts(
    state: GraphStateType,
    history: Array<{ role: string; content: string }>
  ): Promise<{
    extractedFacts: Record<string, unknown>;
    missingFacts: string[];
    followUpQuestion: string;
  }> {
    const recentStr = history
      .slice(-4)
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    try {
      const result = await this.llm.generateJSON<{
        extractedFacts: Record<string, unknown>;
        missingFacts: string[];
        followUpQuestion: string | null;
      }>(`
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

      const cleanFacts = Object.fromEntries(
        Object.entries(result.extractedFacts ?? {}).filter(([, v]) => v !== null && v !== undefined)
      );

      // Never let goal currency overwrite the user's home currency
      if (cleanFacts.targetCurrency) {
        const home = (state.knownFacts?.profileCurrency ?? state.knownFacts?.currency) as string | undefined;
        if (home && cleanFacts.targetCurrency !== home) delete cleanFacts.currency;
      }

      return {
        extractedFacts:  cleanFacts,
        missingFacts:    Array.isArray(result.missingFacts) ? result.missingFacts : [],
        followUpQuestion: result.followUpQuestion ?? "Could you give me a bit more detail?",
      };
    } catch {
      return { extractedFacts: {}, missingFacts: [], followUpQuestion: "" };
    }
  }

  // ─── LLM Answer Generator ────────────────────────────────────────────────────

  private async generateAnswer(
    state: GraphStateType,
    history: Array<{ role: string; content: string }>,
    contract: IntentDataContract,
    precomputed: string,
    mergedFacts: Record<string, unknown>
  ): Promise<string> {
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
