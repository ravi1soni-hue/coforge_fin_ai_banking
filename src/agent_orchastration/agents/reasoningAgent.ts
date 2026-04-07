
import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

// ─── Domain categories (mirrors BankingReasoningEngineV3 taxonomy) ───────────
type DomainCategory =
  | "ASSET_EVALUATION"      // affordability: trip, car, house, any purchase
  | "ACCOUNT_INSIGHT"       // balance, limits, account overview
  | "TRANSACTION_ANALYSIS"  // cashflow, statement, spending, income vs expenses
  | "INVESTMENT_INSIGHT"    // ISA, portfolio, funds, Premium Bonds, performance
  | "LOAN_PLANNING"         // instalment plan, repayment schedule, EMI
  | "GOAL_PLANNING"         // savings goal, milestone, timeline
  | "RISK_ALERT"            // subscriptions, recurring anomalies
  | "GENERAL_EXPLORATION";  // greeting, off-topic, unclear

export const reasoningAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) throw new Error("LlmClient not provided to graph");

  // Short-circuit: user confirmed a follow-up offer.
  // Do NOT re-run domain reasoning — synthesisAgent will deliver the confirmed task.
  if (state.confirmedFollowUpAction) {
    return {
      reasoning: {
        domain: "confirmation" as DomainCategory,
        queryType: "confirmation",
        precomputed: `Confirmed task: ${state.confirmedFollowUpAction}`,
        keyMetrics: [] as Array<{ label: string; value: string | number }>,
        risks: [] as string[],
        suggestions: [] as string[],
      },
    };
  }

  const kf = state.knownFacts ?? {};
  const homeCurrency = String(kf.profileCurrency ?? kf.currency ?? "GBP");
  const goalCurrency = String(kf.targetCurrency ?? homeCurrency);

  // ── Step 1: Classify the domain so reasoning is targeted ─────────────────
  const domainResult = await llm.generateJSON<{
    domain: DomainCategory;
    questions: string[];
    entities: string[];
    confidence: number;
  }>(`
You are a banking domain classifier. Return ONLY valid JSON, no markdown.

USER QUESTION: "${state.question}"

KNOWN FACTS: ${JSON.stringify(kf)}

INTENT: ${JSON.stringify(state.intent ?? {})}

Classify into ONE domain:
  ASSET_EVALUATION     — affordability check for trip, car, house, any purchase
  ACCOUNT_INSIGHT      — balance, account status, limits, overview
  TRANSACTION_ANALYSIS — spending, cashflow, statement, income vs expenses
  INVESTMENT_INSIGHT   — portfolio, ISA, funds, Premium Bonds, performance
  LOAN_PLANNING        — instalment plan, repayment, EMI, mortgage
  GOAL_PLANNING        — savings goals, milestones, timeline, monthly target
  RISK_ALERT           — subscriptions, recurring charges, anomalies
  GENERAL_EXPLORATION  — greeting, thanks, unclear

Return:
{
  "domain": "ASSET_EVALUATION",
  "questions": ["affordability", "instalment_options"],
  "entities": ["Paris trip", "EUR 2200"],
  "confidence": 0.95
}
`);

  const domain = domainResult.domain ?? "GENERAL_EXPLORATION";
  console.log(`[ReasoningAgent] domain=${domain} entities=[${(domainResult.entities ?? []).join(",")}]`);

  // ── Step 2: Domain-specific deterministic pre-computation ─────────────────
  // Build a structured context block for synthesisAgent so it works from
  // pre-computed figures rather than raw numbers — reduces hallucinations.
  let precomputed = "";

  if (domain === "ASSET_EVALUATION") {
    const amt     = typeof kf.targetAmount === "number" ? kf.targetAmount : null;
    const savings = typeof kf.availableSavings === "number" ? kf.availableSavings
                  : typeof kf.spendable_savings === "number" ? kf.spendable_savings : null;
    const surplus = typeof kf.netMonthlySavings === "number" ? kf.netMonthlySavings
                  : typeof kf.netMonthlySurplus === "number" ? kf.netMonthlySurplus : null;
    const monthlyExpenses = typeof kf.monthlyExpenses === "number" ? kf.monthlyExpenses : null;

    if (savings !== null && amt !== null) {
      const buffer   = monthlyExpenses !== null ? monthlyExpenses : savings * 0.25;
      const headroom = savings - buffer;
      const affordable = headroom >= amt;
      const shortfall  = affordable ? 0 : amt - headroom;
      const monthsNeeded = surplus !== null && surplus > 0 ? Math.ceil(shortfall / surplus) : null;

      precomputed = [
        `Domain: ASSET_EVALUATION`,
        `Purchase cost:      ${goalCurrency}${amt.toFixed(0)}`,
        `Spendable savings:  ${homeCurrency}${savings.toFixed(0)}`,
        `Emergency buffer:   ${homeCurrency}${buffer.toFixed(0)}`,
        `Safe to spend:      ${homeCurrency}${headroom.toFixed(0)}`,
        affordable
          ? `Verdict: AFFORDABLE — headroom ${homeCurrency}${headroom.toFixed(0)} exceeds cost`
          : `Verdict: SHORTFALL of ${goalCurrency}${shortfall.toFixed(0)}`,
        surplus !== null ? `Monthly surplus:    ${homeCurrency}${surplus.toFixed(0)}` : "",
        monthsNeeded !== null ? `Months to target at current rate: ${monthsNeeded}` : "",
      ].filter(Boolean).join("\n");
    } else {
      precomputed = `Domain: ASSET_EVALUATION\nFinance context:\n${JSON.stringify(state.financeData ?? {}, null, 2).slice(0, 1200)}`;
    }

  } else if (domain === "LOAN_PLANNING") {
    const amt     = typeof kf.targetAmount === "number" ? kf.targetAmount : null;
    const surplus = typeof kf.netMonthlySavings === "number" ? kf.netMonthlySavings : null;
    const savings = typeof kf.availableSavings === "number" ? kf.availableSavings : null;

    if (amt !== null) {
      const periods = [3, 6, 12, 24];
      const lines = [`Domain: LOAN_PLANNING`, `Instalment schedule for ${goalCurrency}${amt.toFixed(0)}:`];
      for (const p of periods) {
        const monthly = (amt / p).toFixed(0);
        const fits = surplus !== null && amt / p <= surplus ? " ✓ fits surplus" : "";
        lines.push(`  ${String(p).padStart(2)} months: ${goalCurrency}${monthly}/month${fits}`);
      }
      if (surplus !== null) lines.push(`Monthly surplus available: ${homeCurrency}${surplus.toFixed(0)}`);
      if (savings !== null) lines.push(`Savings after lump sum: ${homeCurrency}${(savings - amt).toFixed(0)}`);
      precomputed = lines.join("\n");
    } else {
      precomputed = `Domain: LOAN_PLANNING\nFinance context:\n${JSON.stringify(state.financeData ?? {}).slice(0, 800)}`;
    }

  } else if (domain === "GOAL_PLANNING") {
    const surplus = typeof kf.netMonthlySavings === "number" ? kf.netMonthlySavings : null;
    const savings = typeof kf.availableSavings === "number" ? kf.availableSavings : null;
    const target  = typeof kf.targetAmount === "number" ? kf.targetAmount : null;
    const lines   = [`Domain: GOAL_PLANNING`];
    if (savings !== null) lines.push(`Current savings: ${homeCurrency}${savings.toFixed(0)}`);
    if (surplus !== null) lines.push(`Monthly surplus: ${homeCurrency}${surplus.toFixed(0)}`);
    if (target !== null && surplus !== null && surplus > 0) {
      const remaining = Math.max(0, target - (savings ?? 0));
      lines.push(`Months to reach ${homeCurrency}${target.toFixed(0)}: ${Math.ceil(remaining / surplus)}`);
    }
    precomputed = lines.join("\n") + `\n\nFinance context:\n${JSON.stringify(state.financeData ?? {}).slice(0, 800)}`;

  } else {
    // All other domains: pass finance data as context for LLM to reason over
    precomputed = `Domain: ${domain}\nFinance context:\n${JSON.stringify(state.financeData ?? {}, null, 2).slice(0, 1500)}`;
  }

  // ── Step 3: Structured reasoning output ───────────────────────────────────
  const reasoning = await llm.generateJSON<{
    queryType: string;
    domain: string;
    verdict: "yes" | "conditional" | "no";
    confidence: number;
    keyMetrics: Array<{ label: string; value: string | number }>;
    risks: string[];
    suggestions: string[];
    precomputed: string;
  }>(`
You are a banking financial reasoning agent. Return ONLY valid JSON, no markdown.

PRE-COMPUTED ANALYSIS:
${precomputed}

USER QUESTION: "${state.question}"

KNOWN FACTS: ${JSON.stringify(kf)}

CURRENT DATE: ${new Date().toISOString()}

Based ONLY on the pre-computed analysis above, produce structured reasoning output:
- queryType: one of (affordability, investment_performance, subscriptions, bank_statement, loan_planning, goal_planning, general_finance)
- domain: the classified domain category
- verdict: "yes" | "conditional" | "no" (for affordability; use "yes" for other domains)
- confidence: 0-1 based on completeness of numeric inputs
- keyMetrics: top 3-5 numbers the answer should reference (label + value pairs)
- risks: up to 3 key financial risks to mention
- suggestions: up to 3 practical suggestions

Return:
{
  "queryType": string,
  "domain": string,
  "verdict": "yes" | "conditional" | "no",
  "confidence": number,
  "keyMetrics": [{ "label": string, "value": string | number }],
  "risks": string[],
  "suggestions": string[],
  "precomputed": string
}
`);

  return {
    reasoning: { ...reasoning, precomputed },
  };
};