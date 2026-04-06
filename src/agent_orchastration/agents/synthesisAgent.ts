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

  const confirmedAction = state.confirmedFollowUpAction ?? "none";
  const isConfirmedAction = confirmedAction !== "none";

  console.log(`[SynthesisAgent] confirmedAction="${confirmedAction}" question="${state.question}"`);

  // ── ISOLATED PATH: user confirmed a follow-up offer ──────────────────────
  // Use a completely clean, minimal prompt with NO affordability data so the
  // LLM cannot slide back into repeating the same affordability analysis.
  if (isConfirmedAction) {
    const kf = state.knownFacts ?? {};
    const availSavings   = kf.availableSavings ?? kf.spendable_savings ?? kf.currentBalance;
    const targetAmt      = kf.targetAmount;
    const destination    = kf.destination ?? kf.goalType ?? "the purchase";
    const monthlySurplus = kf.netMonthlySavings ?? kf.netMonthlySurplus;
    const goals          = kf.savingsGoals ? JSON.stringify(kf.savingsGoals) : "none";
    // Use the user's home/profile currency for savings and income amounts.
    // Never use the trip/purchase currency (targetCurrency) for the user's own finances.
    const homeCurrency   = (kf.profileCurrency ?? kf.currency ?? "GBP") as string;
    const tripCurrency   = (kf.targetCurrency ?? homeCurrency) as string;

    const remainingAfterPurchase =
      typeof availSavings === "number" && typeof targetAmt === "number"
        ? (availSavings - targetAmt).toFixed(0)
        : "N/A";
    const monthsToRebuild =
      typeof monthlySurplus === "number" && monthlySurplus > 0 && typeof availSavings === "number" && typeof targetAmt === "number"
        ? Math.ceil((availSavings - (availSavings - targetAmt)) / monthlySurplus)
        : undefined;

    // ONE-LINE context only — the full affordability history is intentionally excluded
    // to prevent the LLM from being biased back into repeating the affordability verdict.
    const priorContextLine = destination !== "the purchase"
      ? `Context: ${kf.userName ?? "User"} is planning a trip to ${destination} costing ${tripCurrency}${targetAmt ?? "N/A"}. The affordability check is done; they confirmed and want the action below.`
      : `Context: ${kf.userName ?? "User"} confirmed a follow-up action (${confirmedAction}). Execute it directly.`;

    const actionInstructions: Record<string, string> = {
      cost_cutting_advice:
        `Give exactly 3 concrete ways to lower the cost of the ${destination} trip from ${tripCurrency}${targetAmt ?? "N/A"}. ` +
        `For each way: one sentence describing the action + estimated saving in ${tripCurrency} (e.g. "Book a budget hotel instead of mid-range — saves ~${tripCurrency}200"). ` +
        `End with the new revised total: "Revised total: ${tripCurrency}[total after savings]". ` +
        `Do NOT mention the user's savings balance. Do NOT say "leaving you with X". Do NOT assess affordability.`,
      savings_recovery:
        `Build a concrete post-trip savings recovery plan. ` +
        `The trip to ${destination} costs ${tripCurrency}${targetAmt ?? "N/A"}. ` +
        `After this trip the user will have approximately ${homeCurrency}${remainingAfterPurchase} in savings ` +
        `(down from ${homeCurrency}${availSavings ?? "N/A"}). ` +
        `Their net monthly surplus is ${homeCurrency}${monthlySurplus ?? "N/A"}. ` +
        `${monthsToRebuild !== undefined ? `At this rate it will take about ${monthsToRebuild} months to rebuild back to ${homeCurrency}${availSavings ?? "N/A"}.` : ""} ` +
        `Mention the impact on their existing goals: ${goals}. ` +
        `Give a forward-looking recovery timeline with a practical tip to speed it up. ` +
        `Do NOT say "you can afford it" or describe the trip in affordability terms. Focus entirely on the rebuild plan.`,
      repayment_plan:
        `Give a concrete 0% instalment repayment schedule for ${tripCurrency}${targetAmt ?? "N/A"}. ` +
        `Show 3-month, 6-month, and 12-month options with the monthly payment amount for each. ` +
        `State which option fits within the user's monthly surplus of ${homeCurrency}${monthlySurplus ?? "N/A"}.`,
      goal_impact_analysis:
        `Compare two options: (1) pay ${tripCurrency}${targetAmt ?? "N/A"} upfront, (2) use a 0% instalment plan. ` +
        `Show how each option affects the user's savings goals: ${goals}. ` +
        `Give a clear recommendation with a one-sentence reason.`,
      savings_plan:
        `Build a month-by-month savings plan to reach ${tripCurrency}${targetAmt ?? "N/A"} for ${destination}. ` +
        `State the monthly contribution needed and the timeline. Use the spare monthly surplus of ${homeCurrency}${monthlySurplus ?? "N/A"}.`,
      goal_planning:
        `Outline a clear goal-based savings plan to reach ${tripCurrency}${targetAmt ?? "N/A"} for ${destination}. ` +
        `Use the current savings of ${homeCurrency}${availSavings ?? "N/A"} and monthly surplus of ${homeCurrency}${monthlySurplus ?? "N/A"}.`,
      cashflow_forecast:
        `Summarise the projected monthly cashflow for the next 3 months based on income and expenses. ` +
        `Monthly income: ${homeCurrency}${kf.monthlyIncome ?? "N/A"}, monthly expenses: ${homeCurrency}${kf.monthlyExpenses ?? "N/A"}.`,
      investment_review:
        `Summarise the user's investment portfolio. Investments: ${JSON.stringify(kf.investments ?? "none")}. ` +
        `State total value, monthly contribution, and whether performance data is available.`,
      subscription_review:
        `List the user's subscriptions: ${JSON.stringify(kf.subscriptions ?? "none")}. ` +
        `Give the monthly total and suggest which 1-2 to cancel.`,
      statement_summary:
        `Give the most recent monthly statement: total inflow, total outflow, and net cashflow.`,
      general_planning:
        `Give a specific, actionable financial plan based on the user's context: ` +
        `goal = ${destination}, amount = ${tripCurrency}${targetAmt ?? "N/A"}, savings = ${homeCurrency}${availSavings ?? "N/A"}.`,
    };

    const instructions = actionInstructions[confirmedAction]
      ?? `Provide a helpful financial action plan for: ${confirmedAction}.`;

    const isolatedAnswer = await llm.generateText(
      `You are a personal banking AI assistant for ${kf.userName ?? "the user"}.

⚠ EXECUTION MODE: The affordability check is COMPLETE. The user said YES. Execute ONLY the task below.
Do NOT re-state the affordability verdict. Do NOT open with "You've got X in savings". Do NOT say "leaving you with X".

HOME CURRENCY: ${homeCurrency} — use this for ALL the user's own financial figures (savings, income, surplus).
TRIP/PURCHASE CURRENCY: ${tripCurrency} — use this ONLY for the trip or purchase cost.

${priorContextLine}

YOUR TASK (execute completely and precisely — this is what the user asked for):
${instructions}

STYLE RULES:
- Plain prose only. No markdown, no bullet points, no headers.
- 3-4 short punchy sentences. End with ONE brief follow-up offer.
- Speak like a friendly, confident financial advisor.
- Do NOT open with "Sure!", "Of course!", or "You've got X in your savings/account".
- Start with the ACTION or its result, not with the user's balance.
`
    );

    console.log(`[SynthesisAgent] isolated answer for "${confirmedAction}": ${isolatedAnswer.slice(0, 120)}...`);

    const pendingFollowUpAction = detectFollowUpAction(isolatedAnswer);
    return {
      finalAnswer: isolatedAnswer,
      confirmedFollowUpAction: undefined,
      knownFacts: { ...state.knownFacts, pendingFollowUpAction },
    };
  }
  // ─────────────────────────────────────────────────────────────────────────

  const topProduct = Array.isArray(state.productRecommendations)
    ? [...state.productRecommendations]
        .sort((a, b) => (b.suitabilityScore ?? 0) - (a.suitabilityScore ?? 0))
        .find((p) => (p.suitabilityScore ?? 0) >= 0.5)
    : undefined;

  const productContext = topProduct
    ? `Recommended product: ${topProduct.productName} — ${topProduct.rationale}. Next step: ${topProduct.nextStep}.`
    : "No product recommendation applicable.";

  // When the user confirmed a follow-up, exclude the affordability-shaped reasoning
  // context so it cannot bias the LLM into repeating the same affordability answer.
  const reasoningContext = JSON.stringify(state.reasoning, null, 2);

  const mainHomeCurrency = (() => {
    const kf = state.knownFacts ?? {};
    return (kf.profileCurrency ?? kf.currency ?? "GBP") as string;
  })();
  const mainTripCurrency = (() => {
    const kf = state.knownFacts ?? {};
    const home = (kf.profileCurrency ?? kf.currency ?? "GBP") as string;
    return (kf.targetCurrency ?? home) as string;
  })();

  const conversationContext = Array.isArray(state.conversationHistory) && state.conversationHistory.length > 0
    ? `\nCONVERSATION HISTORY (for context only — do not repeat prior answers)\n` +
      state.conversationHistory
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n")
    : "";

  const answer = await llm.generateText(`
You are a personal banking AI analyst. Give a clear, intelligent, data-backed answer to the user's question.
${conversationContext}
USER QUESTION
"${state.question}"

USER INTENT
${JSON.stringify(state.intent, null, 2)}

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
0. CRITICAL — CURRENCY: The user's HOME currency is ${mainHomeCurrency}. ALL figures for the user's own money (savings, income, expenses, surplus, account balances) MUST be shown in ${mainHomeCurrency} with the correct symbol. ONLY the trip/purchase cost the user stated uses ${mainTripCurrency}. NEVER show the user's savings or income in ${mainTripCurrency !== mainHomeCurrency ? mainTripCurrency : "any other currency"}.
1. Read ALL data above — never ignore any context field.
2. CRITICAL — Use ONLY spendable_savings (savings account balance) as the user's available pool. NEVER add the current account balance to it. The current account is reserved for monthly living expenses.
3. CRITICAL — When the user says something like "yes", "sure", or "please do that" referring to a plan offered in the conversation history, DELIVER that plan — do NOT repeat the affordability verdict from a prior turn.
4. For affordability queries: open with a direct verdict using the user's key numbers (spendable_savings, goal cost, leftover after purchase). Weave any suggestion or product recommendation into the last sentence naturally.
5. For investment / portfolio / ISA queries: state current value, monthly contribution, and performance where available. Note that exact profit/loss cannot be calculated without a cost basis.
6. For subscriptions: list items with amounts and give the monthly total; suggest 1-2 to cancel.
7. For statement / balance / cashflow: give the key numbers clearly — inflow, outflow, net, or account balance as appropriate.
8. For loan / repayment queries: give the outstanding balance, EMI, and timeline to payoff.
9. NEVER invent numbers that are not present in the data above.
10. NEVER repeat the question back to the user. NEVER use filler phrases.
11. Plain prose only — no markdown, no bullet points, no headers.
12. Keep it to 3–4 short, punchy sentences. Speak like a friendly, confident financial advisor — casual tone. End with ONE brief follow-up offer.
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
  console.log(`[SynthesisAgent] storing pendingFollowUpAction="${pendingFollowUpAction}" for next turn`);

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
  // Ways to cut / reduce cost — checked BEFORE savings_recovery so "lower the cost + preserve buffer"
  // maps to cost-cutting rather than recovery (the primary offer in that phrasing is cost reduction)
  if (/cut.*cost|find.*ways|ways.*save|reduce.*cost|cheaper.*option|save.*on.*trip|trim.*cost|lower.*cost|without.*missing|run.*option|budget.*hotel|cheaper.*hotel|hotel.*option|flight.*option|option.*hotel/.test(lastQuestion))
    return "cost_cutting_advice";
  // Post-purchase / post-trip RECOVERY plan (buffer rebuild, savings restore)
  if (/buffer|rebuild|recover|restore|replenish|bounce.back|after.the.trip|after.trip|post.trip/.test(lastQuestion))
    return "savings_recovery";
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

