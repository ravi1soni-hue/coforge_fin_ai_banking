import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";
import {
  buildDeterministicSnapshot,
  tryBuildDeterministicAnswer,
  validateAssistantAnswer,
} from "../services/deterministicFinance.service.js";

export const synthesisAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {
  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  // Deterministic shortcut for pure factual lookups (balance, statement, investment value).
  // Uses verified account/transaction data to prevent LLM from hallucinating numbers.
  // Skip deterministic shortcut when the user is confirming a follow-up action —
  // we must deliver the requested plan/recovery, not a pre-canned factual answer.
  const snapshot = buildDeterministicSnapshot(state);
  const confirmedActionForShortcut = state.confirmedFollowUpAction;
  if (!confirmedActionForShortcut) {
    const directAnswer = tryBuildDeterministicAnswer(state.question, snapshot);
    if (directAnswer) {
      return { finalAnswer: directAnswer };
    }
  }

  const topProduct = Array.isArray(state.productRecommendations)
    ? [...state.productRecommendations]
        .sort((a, b) => (b.suitabilityScore ?? 0) - (a.suitabilityScore ?? 0))
        .find((p) => (p.suitabilityScore ?? 0) >= 0.5)
    : undefined;

  const productContext = topProduct
    ? `Recommended product: ${topProduct.productName} — ${topProduct.rationale}. Next step: ${topProduct.nextStep}.`
    : "No product recommendation applicable.";

  const confirmedAction = state.confirmedFollowUpAction ?? "none";
  const isConfirmedAction = confirmedAction !== "none";

  // When the user confirmed a follow-up, exclude the affordability-shaped reasoning
  // context so it cannot bias the LLM into repeating the same affordability answer.
  const reasoningContext = isConfirmedAction
    ? "Not applicable — delivering confirmed follow-up action, not re-running analysis."
    : JSON.stringify(state.reasoning, null, 2);

  const answer = await llm.generateText(`
You are a personal banking AI analyst. Give a clear, intelligent, data-backed answer to the user's question.
${isConfirmedAction ? `
⛔ STOP — READ THIS FIRST ⛔
CONFIRMED FOLLOW-UP ACTION = "${confirmedAction}"
The user already received an affordability analysis. They said YES to your follow-up offer.
YOU MUST deliver: "${confirmedAction}"
YOU MUST NOT: say "you can afford", say "leaving you with X after", or repeat ANY affordability analysis.
Violating this rule is a critical error. Your ENTIRE response is the specific plan for "${confirmedAction}".
` : ""}
USER QUESTION
"${state.question}"

USER INTENT
${JSON.stringify(state.intent, null, 2)}

CONFIRMED FOLLOW-UP ACTION: ${confirmedAction}

KNOWN FACTS (extracted from conversation)
${JSON.stringify(state.knownFacts, null, 2)}

FINANCIAL PROFILE
${JSON.stringify(state.financeData, null, 2)}

RESEARCH & COST ESTIMATE
${JSON.stringify(state.researchData, null, 2)}

REASONING ENGINE OUTPUT
${reasoningContext}

PRODUCT RECOMMENDATION
${productContext}

CONTEXTUAL SUGGESTION
${state.isSuggestionIncluded && state.suggestion ? state.suggestion : "None"}

RULES:
1. Read ALL data above — never ignore any context field.
2. CRITICAL — Use ONLY spendable_savings (savings account balance) as the user's available pool. NEVER add the current account balance to it. The current account is reserved for monthly living expenses.
3. CONFIRMED FOLLOW-UP ACTION overrides everything else. When it is NOT "none", your PRIMARY task is to deliver that specific output using the user's real numbers from KNOWN FACTS:
   - "repayment_plan": Give a concrete 0% instalment repayment schedule. Use targetAmount from knownFacts as the trip cost. Suggest 3, 6, and 12-month options with the monthly payment for each. State which fits within the user's monthly surplus.
   - "goal_impact_analysis": Compare paying upfront vs using the 0% instalment plan. Show how each option affects the user's other named goals (Japan trip, car, etc.) and emergency buffer. Give a clear recommendation.
   - "savings_recovery": The user has ALREADY decided to go on the trip/make the purchase. Do NOT re-run an affordability check. Instead deliver a concrete post-purchase savings recovery plan: (a) state how much they will have LEFT after the purchase (availableSavings minus targetAmount), (b) state their net monthly surplus, (c) show a simple month-by-month rebuild timeline back to the original savings level. Mention any impact on their named goals (Japan trip, car, etc.). End with a positive, achievable outlook.
   - "savings_plan": Build a month-by-month savings plan to reach the target. State monthly contribution needed and the timeline.
   - "goal_planning": Outline a clear goal-based savings or spending plan from the user's current financial position.
   - "cashflow_forecast": Summarise projected monthly cashflow for the next 3 months based on income/expenses.
   - "investment_review": Summarise investment portfolio performance with period, profit/loss, and confidence.
   - "subscription_review": List subscriptions, monthly totals, and suggest which to cut.
   - "statement_summary": Provide inflow, outflow, and net cashflow for the most recent period.
   - "cost_cutting_advice": Suggest 3-4 concrete ways to cut the cost of the trip/purchase by 15-25% without ruining the experience. For each, give an estimated saving amount. End with the revised total. Do NOT mention affordability.
   - "general_planning": Based on the conversation context (goalType, destination in knownFacts), deliver a specific savings optimisation or cost-reduction plan. Do NOT re-run affordability.
4. For affordability (when confirmedAction is "none" and intent action is "affordability"): open with a direct verdict using the user's key numbers (spendable_savings, goal cost, leftover after purchase). Weave any suggestion or product recommendation into the last sentence naturally.
5. For investment / portfolio / ISA queries: state current value, monthly contribution, and performance where available. Note that exact profit/loss cannot be calculated without a cost basis.
6. For subscriptions: list items with amounts and give the monthly total; suggest 1-2 to cancel.
7. For statement / balance / cashflow: give the key numbers clearly — inflow, outflow, net, or account balance as appropriate.
8. For loan / repayment queries: give the outstanding balance, EMI, and timeline to payoff.
8. NEVER invent numbers that are not present in the data above.
9. NEVER repeat the question back to the user. NEVER use filler phrases.
10. Plain prose only — no markdown, no bullet points, no headers.
11. Keep it to 3–4 short, punchy sentences. When delivering a repayment plan or comparison, provide the actual numbers clearly, then end with one brief follow-up offer. Speak like a friendly, confident financial advisor — casual tone.
12. NEVER re-run an affordability check when confirmedAction is set — the user already has that answer. Deliver the specific requested output.
`);

  const validation = validateAssistantAnswer(state.question, answer, snapshot);
  if (!validation.valid) {
    // Still tag the follow-up action so the next turn can detect confirmations
    const pendingFollowUpAction = detectFollowUpAction(answer);
    return {
      finalAnswer:
        validation.safeAnswer ??
        "I want to avoid giving you an inaccurate number. Please share specific period and source values to confirm this precisely.",
      knownFacts: { ...state.knownFacts, pendingFollowUpAction },
    };
  }

  // Tag what action was offered in the follow-up question so the next turn
  // can detect a short "yes / do it" confirmation without re-running affordability.
  const pendingFollowUpAction = detectFollowUpAction(answer);

  return {
    finalAnswer: answer,
    // Clear confirmedFollowUpAction so it doesn't persist into the next turn.
    confirmedFollowUpAction: undefined,
    knownFacts: { ...state.knownFacts, pendingFollowUpAction },
  };
};

/**
 * Lightweight keyword match on the last question in an answer to tag what
 * the assistant offered, e.g. "Want me to build a savings plan?" → "savings_plan".
 * Avoids an extra LLM call.
 */
function detectFollowUpAction(answer: string): string {
  const lastQuestion =
    answer
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.includes("?"))
      .pop()
      ?.toLowerCase() ?? answer.toLowerCase();

  // Repayment / instalment schedule — must check before generic plan/goal
  if (/repayment|instalment|installment|monthly.cost|cost.monthly|spread.the.cost|schedule|split.*payment|run.*numbers/.test(lastQuestion))
    return "repayment_plan";
  // Goal impact / option comparison
  if (/option.*goal|goal.*option|impact.*goal|goal.*impact|which.*option|affect.*goal/.test(lastQuestion))
    return "goal_impact_analysis";
  // Post-purchase / post-trip RECOVERY plan (buffer rebuild, savings restore) — must check BEFORE generic savings_plan
  if (/buffer|rebuild|recover|restore|replenish|bounce.back|after.the.trip|after.trip|post.trip/.test(lastQuestion))
    return "savings_recovery";
  // Ways to cut / reduce cost (e.g. "find ways to cut the trip cost")
  if (/cut.*cost|find.*ways|ways.*save|reduce.*cost|cheaper.*option|save.*on.*trip|trim.*cost|lower.*cost|without.*missing/.test(lastQuestion))
    return "cost_cutting_advice";
  if (/savings.plan|save.up|saving.plan|top.up/.test(lastQuestion))
    return "savings_plan";
  if (/cash.?flow|forecast|monthly.surplus/.test(lastQuestion))
    return "cashflow_forecast";
  if (/invest|portfolio|returns|fund/.test(lastQuestion))
    return "investment_review";
  if (/subscription|recurring/.test(lastQuestion))
    return "subscription_review";
  if (/statement|transaction|history/.test(lastQuestion))
    return "statement_summary";
  if (/plan|goal|target|budget/.test(lastQuestion))
    return "goal_planning";
  return "general_planning";
}

