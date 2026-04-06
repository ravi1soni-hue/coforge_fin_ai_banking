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

  // ── CONFIRMATION PATH: user confirmed a follow-up offer ─────────────────
  // confirmedFollowUpAction is now a natural-language task description set by
  // intentAgent's LLM-based detection. We use it + conversation history directly
  // — no template lookup, no keyword tags, no brittle action maps.
  if (isConfirmedAction) {
    const kf = state.knownFacts ?? {};
    const availSavings   = kf.availableSavings ?? kf.spendable_savings ?? kf.currentBalance;
    const targetAmt      = kf.targetAmount;
    const destination    = kf.destination ?? kf.goalType ?? "the purchase";
    const monthlySurplus = kf.netMonthlySavings ?? kf.netMonthlySurplus;
    const homeCurrency   = (kf.profileCurrency ?? kf.currency ?? "GBP") as string;
    const tripCurrency   = (kf.targetCurrency ?? homeCurrency) as string;

    // Include the recent conversation so the LLM can see exactly what was offered.
    const recentHistory = (state.conversationHistory ?? []).slice(-8)
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    console.log(`[SynthesisAgent] CONFIRMATION PATH — task="${confirmedAction.slice(0, 100)}"`);

    const continuationAnswer = await llm.generateText(
      `You are a personal banking AI assistant helping ${kf.userName ?? "a customer"}.

RECENT CONVERSATION:
${recentHistory}
User: ${state.question}

TASK TO EXECUTE NOW:
The user just confirmed your previous offer. Execute this specific task and nothing else:
"${confirmedAction}"

KEY FINANCIAL FIGURES (use only what is relevant to the task above — do not recite all of them):
- Savings available: ${homeCurrency}${availSavings ?? "N/A"}
- Cost of trip / purchase: ${tripCurrency}${targetAmt ?? "N/A"}
- Monthly surplus: ${homeCurrency}${monthlySurplus ?? "N/A"}
- Goal / destination: ${destination}

ABSOLUTE RULES — if any rule is broken the response is invalid:
1. Your response MUST start with the first concrete number, option, or action.
   FORBIDDEN first words: "You", "Your", "Based", "Covering", "Since", "Given", "As".
2. Do NOT state the affordability verdict. Do NOT say "You can afford this",
   "You have €X in savings", or anything about whether the trip is doable.
3. Give SPECIFIC numbers for each option or step (monthly amounts, savings, totals).
4. Maximum 4 sentences.
5. End with ONE brief follow-up offer on a related but different aspect.`
    );

    console.log(`[SynthesisAgent] continuation answer: ${continuationAnswer.slice(0, 120)}...`);

    return {
      finalAnswer: continuationAnswer,
      confirmedFollowUpAction: undefined,
      knownFacts: kf,
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
    return {
      finalAnswer:
        validation.safeAnswer ??
        "I want to avoid giving you an inaccurate number. Please share specific period and source values to confirm this precisely.",
      knownFacts: state.knownFacts,
    };
  }

  return {
    finalAnswer: answer,
    // Clear confirmedFollowUpAction so it doesn't persist into the next turn.
    confirmedFollowUpAction: undefined,
    knownFacts: state.knownFacts,
  };
};


