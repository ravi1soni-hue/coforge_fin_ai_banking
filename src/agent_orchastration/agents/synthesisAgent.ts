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
  // Use conversation history to understand exactly what was offered and deliver it.
  if (isConfirmedAction) {
    const kf = state.knownFacts ?? {};
    const availSavings   = kf.availableSavings ?? kf.spendable_savings ?? kf.currentBalance;
    const targetAmt      = kf.targetAmount;
    const destination    = kf.destination ?? kf.goalType ?? "the purchase";
    const monthlySurplus = kf.netMonthlySavings ?? kf.netMonthlySurplus;
    const goals          = kf.savingsGoals ? JSON.stringify(kf.savingsGoals) : "none";
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

    // Extract last assistant message from conversation history — this is the EXACT offer
    // the user just confirmed. Using it as context prevents the LLM from guessing what was offered.
    const lastAssistantMsg = Array.isArray(state.conversationHistory)
      ? [...state.conversationHistory].reverse().find(m => m.role === "assistant")?.content ?? ""
      : "";

    // Extract the closing question/offer from the last assistant message
    const lastOfferSentence = lastAssistantMsg
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.includes("?"))
      .pop() ?? lastAssistantMsg.slice(-200);

    console.log(`[SynthesisAgent] ISOLATED PATH confirmed="${confirmedAction}" lastOffer="${lastOfferSentence.slice(0, 80)}"`);

    const actionInstructions: Record<string, string> = {
      cost_cutting_advice:
        `Give exactly 3 concrete ways to lower the cost of the ${destination} trip from ${tripCurrency}${targetAmt ?? "N/A"}. ` +
        `For each: one sentence with the specific action + estimated saving in ${tripCurrency} (e.g. "Book a hostel instead of a hotel — saves ~${tripCurrency}200"). ` +
        `End with the revised trip total: "Revised total: ${tripCurrency}[sum]". ` +
        `NEVER mention the user's savings balance. NEVER say "leaving you with X". NEVER assess affordability.`,
      savings_recovery:
        `Build a concrete post-trip savings recovery plan. ` +
        `After the ${destination} trip (${tripCurrency}${targetAmt ?? "N/A"}) the user will have ~${homeCurrency}${remainingAfterPurchase} left. ` +
        `Their monthly surplus is ${homeCurrency}${monthlySurplus ?? "N/A"}. ` +
        `${monthsToRebuild !== undefined ? `At this pace it takes ~${monthsToRebuild} months to restore the full buffer.` : ""} ` +
        `Mention impact on goals: ${goals}. Give a rebuild timeline + one tip to speed recovery. ` +
        `NEVER say "you can afford it". Focus entirely on the recovery plan.`,
      repayment_plan:
        `Give a 0% instalment repayment schedule for ${tripCurrency}${targetAmt ?? "N/A"}. ` +
        `Show 3-month, 6-month, and 12-month options with the monthly payment for each. ` +
        `State which fits within the monthly surplus of ${homeCurrency}${monthlySurplus ?? "N/A"}.`,
      goal_impact_analysis:
        `Compare: (1) pay ${tripCurrency}${targetAmt ?? "N/A"} upfront vs (2) use 0% instalments. ` +
        `Show how each affects the user's savings goals: ${goals}. Give a clear recommendation.`,
      savings_plan:
        `Build a savings plan to reach ${tripCurrency}${targetAmt ?? "N/A"} for ${destination}. ` +
        `State monthly contribution needed and timeline using monthly surplus of ${homeCurrency}${monthlySurplus ?? "N/A"}.`,
      goal_planning:
        `Outline a goal-based savings plan to reach ${tripCurrency}${targetAmt ?? "N/A"} for ${destination}. ` +
        `Monthly surplus: ${homeCurrency}${monthlySurplus ?? "N/A"}. State timeline and monthly target.`,
      cashflow_forecast:
        `Project monthly cashflow for the next 3 months. ` +
        `Monthly income: ${homeCurrency}${kf.monthlyIncome ?? "N/A"}, expenses: ${homeCurrency}${kf.monthlyExpenses ?? "N/A"}.`,
      investment_review:
        `Summarise the investment portfolio: ${JSON.stringify(kf.investments ?? "none")}. ` +
        `State total value, monthly contribution, and whether performance data is available.`,
      subscription_review:
        `List subscriptions: ${JSON.stringify(kf.subscriptions ?? "none")}. ` +
        `Give the monthly total and suggest 1-2 to cancel.`,
      statement_summary:
        `Give the most recent monthly statement: total inflow, total outflow, net cashflow.`,
    };

    // Primary instruction: use the specific action map when available.
    // Fallback: use the last assistant message to understand what was offered and deliver it exactly.
    const instructions = actionInstructions[confirmedAction]
      ?? (lastOfferSentence
          ? `The user confirmed your previous offer: "${lastOfferSentence}"\n` +
            `Deliver exactly what was offered. Be concrete: give 3 specific options with estimated amounts in ${tripCurrency} each. ` +
            `End with a revised total if applicable. Do NOT re-run the affordability analysis.`
          : `Give 3 specific, actionable cost-saving tips for the ${destination} trip (${tripCurrency}${targetAmt ?? "N/A"}). ` +
            `Include an estimated saving per tip. End with a revised total.`);

    const isolatedAnswer = await llm.generateText(
      `You are a personal banking AI assistant for ${kf.userName ?? "the user"}.

⚠ EXECUTION MODE — the affordability check is done and the user said YES.
Your ONLY job right now is to execute the task below. Do NOT, under any circumstances, re-state the affordability verdict.
FORBIDDEN OPENERS: "You've got X in savings", "You have X in spendable savings", "Covering this trip is doable", "Leaving you with X".
Start your response with the FIRST ACTION or FIRST OPTION — not with any balance figure.

HOME CURRENCY: ${homeCurrency} — use for ALL user financial figures (surplus, savings, income).
TRIP/PURCHASE CURRENCY: ${tripCurrency} — use ONLY for the trip or purchase cost.

TASK — execute this completely and precisely:
${instructions}

STYLE:
- Plain prose only. No markdown, no bullet points, no headers.
- 3-5 sentences maximum. End with ONE brief follow-up offer on a new topic (not affordability).
- Friendly, confident financial advisor tone.
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
  // Ways to cut / reduce cost — broad match covers many LLM phrasings:
  // "find the best low-cost options", "lower the cost", "budget hotel", "cheaper itinerary", etc.
  if (/cut.*cost|find.*ways|ways.*save|reduce.*cost|cheaper.*option|save.*on.*trip|trim.*cost|lower.*cost|lower.cost|low.cost|without.*missing|run.*option|budget.*hotel|cheaper.*hotel|hotel.*option|flight.*option|option.*hotel|find.*option|find.*low|find.*cheap|find.*best.*travel|itinerary|lower.*budget|ways.*lower|cost.*saving|saving.*tip/.test(lastQuestion))
    return "cost_cutting_advice";
  // Post-purchase / post-trip RECOVERY plan (buffer rebuild, savings restore)
  if (/buffer|rebuild|recover|restore|replenish|bounce.back|after.the.trip|after.trip|post.trip|reserve|keep.*buffer|preserve.*buffer|protect.*buffer/.test(lastQuestion))
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
  return "cost_cutting_advice"; // default to cost_cutting when confirming a trip/purchase follow-up
}

