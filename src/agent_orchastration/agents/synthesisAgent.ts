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
    const availSavings   = parseFloat(String(kf.availableSavings ?? kf.spendable_savings ?? kf.currentBalance ?? 0)) || 0;
    const targetAmt      = parseFloat(String(kf.targetAmount ?? 0)) || 0;
    const destination    = (kf.destination ?? kf.goalType ?? "the purchase") as string;
    const monthlySurplus = parseFloat(String(kf.netMonthlySavings ?? kf.netMonthlySurplus ?? 0)) || 0;
    const homeCurrency   = (kf.profileCurrency ?? kf.currency ?? "GBP") as string;
    const tripCurrency   = (kf.targetCurrency ?? homeCurrency) as string;

    // Pre-compute instalment scenarios so the LLM formats numbers, not calculates them
    const instalmentLines: string[] = [];
    if (targetAmt > 0) {
      for (const months of [3, 6, 12]) {
        const monthly = Math.ceil(targetAmt / months);
        const totalInterest = 0; // assume 0% plan
        instalmentLines.push(`${months}-month plan: ${tripCurrency}${monthly}/month (total ${tripCurrency}${months * monthly}, interest-free)`);
      }
    }
    const remainingIfLumpSum = availSavings > 0 && targetAmt > 0
      ? `Paying in full leaves ${homeCurrency}${(availSavings - targetAmt).toFixed(0)} in savings`
      : null;
    const monthsToSaveFromSurplus = monthlySurplus > 0 && targetAmt > 0
      ? Math.ceil(targetAmt / monthlySurplus)
      : null;

    const preComputedNumbers = [
      targetAmt > 0        && `Trip cost: ${tripCurrency}${targetAmt}`,
      availSavings > 0     && `Available savings: ${homeCurrency}${availSavings}`,
      remainingIfLumpSum,
      monthlySurplus > 0   && `Monthly surplus: ${homeCurrency}${monthlySurplus}`,
      monthsToSaveFromSurplus && `Months to save full cost from surplus alone: ${monthsToSaveFromSurplus}`,
      ...instalmentLines,
    ].filter(Boolean).join("\n");

    // Include financeData fetched by financeAgent in this turn (if available)
    const financeDataContext = state.financeData
      ? `\nFINANCIAL DATA FROM ANALYSIS:\n${JSON.stringify(state.financeData, null, 2).slice(0, 900)}`
      : "";

    // Include the recent conversation so the LLM can see exactly what was offered.
    const recentHistory = (state.conversationHistory ?? []).slice(-8)
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    console.log(`[SynthesisAgent] CONFIRMATION PATH — task="${confirmedAction.slice(0, 100)}"`);

    // When the user confirmed an affordability offer and intent is installment_simulation,
    // override the generic task text with an explicit instalment directive so the LLM
    // delivers the right output regardless of what _pendingOffer literally said.
    const isInstalmentSim =
      state.intent?.action === "installment_simulation" ||
      /instalment|installment|split|spreading|replenish|numbers|payment.plan|months/i.test(
        confirmedAction
      );

    const effectiveTask = isInstalmentSim && targetAmt > 0
      ? `Show the 0% instalment plan for a ${tripCurrency}${targetAmt} trip. ` +
        `List the 3-month, 6-month, and 12-month options from the pre-computed lines. ` +
        `Then in 2–3 sentences compare upfront payment vs instalment on goal/savings impact. ` +
        `Do NOT restate the affordability verdict, savings balance, or anything from prior turns.`
      : confirmedAction;

    const continuationAnswer = await llm.generateText(
      `You are a personal banking AI assistant. The user confirmed an action — execute it now.

RECENT CONVERSATION:
${recentHistory}

CONFIRMED TASK (execute this exactly):
"${effectiveTask}"

PRE-COMPUTED FIGURES (use these exact numbers — do NOT recalculate):
${preComputedNumbers || "See financial data below."}
${financeDataContext}

OUTPUT RULES:
1. DO NOT start with: Yes, Sure, So, You, Your, With, Based, Covering, Paying, Since, Given, As, The, A.
   Open directly with the plan: "3-month", "Here's how", "Option 1", or similar.
2. Present ONLY the instalment options or confirmed plan. Do NOT restate affordability, savings balance, or prior verdict.
3. Use ONLY the pre-computed figures above — do not invent or recalculate numbers.
4. Show each instalment option on its own line with the monthly amount clearly stated.
5. After listing options, briefly note the impact on savings and goals (2–3 sentences max).
6. Maximum 10 sentences total.
7. Do NOT end with another offer or question.`
    );

    console.log(`[SynthesisAgent] continuation answer: ${continuationAnswer.slice(0, 120)}...`);

    return {
      finalAnswer: continuationAnswer,
      confirmedFollowUpAction: undefined,
      knownFacts: { ...(kf as Record<string, unknown>), _pendingOffer: null }, // clear offer after fulfillment
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
3. CRITICAL — If KNOWN FACTS has a non-null "_pendingOffer" AND the user's message is affirmative ("yes", "sure", "please do", "go ahead"), execute ONLY that offer. Do NOT mention affordability, savings-left verdict, or any prior conclusion. Deliver the instalment plan or whatever the offer was.
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
