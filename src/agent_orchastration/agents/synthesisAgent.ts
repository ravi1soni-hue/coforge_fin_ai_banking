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
5. Do NOT end with a follow-up offer or question. Deliver the task completely and stop.`
    );

    console.log(`[SynthesisAgent] continuation answer: ${continuationAnswer.slice(0, 120)}...`);

    return {
      finalAnswer: continuationAnswer,
      confirmedFollowUpAction: undefined,
      knownFacts: kf,
    };
  }
  // ─────────────────────────────────────────────────────────────────────────

  const reasoningData  = state.reasoning as Record<string, unknown> | undefined;
  const precomputed    = typeof reasoningData?.precomputed === "string" ? reasoningData.precomputed : "";
  const keyMetrics     = Array.isArray(reasoningData?.keyMetrics) ? reasoningData.keyMetrics : [];
  const risks          = Array.isArray(reasoningData?.risks)      ? reasoningData.risks      : [];
  const suggestions    = Array.isArray(reasoningData?.suggestions) ? reasoningData.suggestions : [];

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

PRE-COMPUTED ANALYSIS (trust these numbers — do NOT recalculate):
${precomputed || JSON.stringify(state.financeData, null, 2).slice(0, 1200)}

KEY METRICS:
${keyMetrics.map((m: { label: string; value: string | number }) => `- ${m.label}: ${m.value}`).join("\n") || "See pre-computed analysis above."}

RISKS:
${risks.length > 0 ? risks.map((r: string) => `- ${r}`).join("\n") : "None identified."}

SUGGESTIONS:
${suggestions.length > 0 ? suggestions.map((s: string) => `- ${s}`).join("\n") : "None."}

KNOWN FACTS:
${JSON.stringify(state.knownFacts, null, 2)}

RULES:
0. CRITICAL — HOME CURRENCY: The user's home currency is ${mainHomeCurrency}. ALL figures for the user's own money (savings, income, expenses, surplus) MUST use ${mainHomeCurrency}. ONLY the trip/purchase cost uses ${mainTripCurrency !== mainHomeCurrency ? mainTripCurrency : mainHomeCurrency}.
1. Use ONLY pre-computed figures above. Do NOT invent or recalculate numbers.
2. CRITICAL — Use ONLY spendable_savings as available pool. NEVER add current account balance to it.
3. CRITICAL — If the user said "yes/sure/please do that" to a plan offered previously, DELIVER that plan — do NOT repeat the affordability verdict.
4. For affordability: open with a direct verdict + key numbers. End with one follow-up offer.
5. For investments/ISA: state current value, contribution, and performance. Note exact P&L needs cost basis.
6. For subscriptions: list items + monthly total; suggest 1-2 to cancel.
7. For balance/cashflow: give key numbers clearly (inflow, outflow, net).
8. For loan/repayment: give outstanding balance, EMI, payoff timeline.
9. Plain prose only — no markdown, no bullet points, no headers.
10. 3–4 short, punchy sentences max. Friendly, confident financial advisor tone.
11. End with ONE brief follow-up offer on a related but different aspect.
`);

  // Persist any offer in this response so next turn can detect it without LLM
  const newOffer = answer.match(
    /(?:want me to|shall i|would you like me to|let me|i can show you?)\s+([^.?!\n]{5,180})/i
  );
  const updatedKnownFacts = {
    ...(state.knownFacts as Record<string, unknown>),
    _pendingOffer: newOffer ? newOffer[1].trim() : null,
  };

  const validation = validateAssistantAnswer(state.question, answer, snapshot);
  if (!validation.valid) {
    return {
      finalAnswer:
        validation.safeAnswer ??
        "I want to avoid giving you an inaccurate number. Please share specific period and source values to confirm this precisely.",
      knownFacts: updatedKnownFacts,
    };
  }

  return {
    finalAnswer: answer,
    confirmedFollowUpAction: undefined,
    knownFacts: updatedKnownFacts,
  };
};
