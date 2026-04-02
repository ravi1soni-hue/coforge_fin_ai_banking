import { buildDeterministicSnapshot, tryBuildDeterministicAnswer, validateAssistantAnswer, } from "../services/deterministicFinance.service.js";
export const synthesisAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    // Deterministic shortcut for pure factual lookups (balance, statement, investment value).
    // Uses verified account/transaction data to prevent LLM from hallucinating numbers.
    const snapshot = buildDeterministicSnapshot(state);
    const directAnswer = tryBuildDeterministicAnswer(state.question, snapshot);
    if (directAnswer) {
        return { finalAnswer: directAnswer };
    }
    const topProduct = Array.isArray(state.productRecommendations)
        ? [...state.productRecommendations]
            .sort((a, b) => (b.suitabilityScore ?? 0) - (a.suitabilityScore ?? 0))
            .find((p) => (p.suitabilityScore ?? 0) >= 0.5)
        : undefined;
    const productContext = topProduct
        ? `Recommended product: ${topProduct.productName} — ${topProduct.rationale}. Next step: ${topProduct.nextStep}.`
        : "No product recommendation applicable.";
    const answer = await llm.generateText(`
You are a personal banking AI analyst. Give a clear, intelligent, data-backed answer to the user's question.

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
${JSON.stringify(state.reasoning, null, 2)}

PRODUCT RECOMMENDATION
${productContext}

CONTEXTUAL SUGGESTION
${state.isSuggestionIncluded && state.suggestion ? state.suggestion : "None"}

RULES:
1. Read ALL data above — never ignore any context field.
2. CRITICAL — Use ONLY spendable_savings (savings account balance) as the user's available pool. NEVER add the current account balance to it. The current account is reserved for monthly living expenses.
3. For affordability: open with a direct verdict using the user's key numbers (spendable_savings, goal cost, leftover after purchase). If there is a suggestion or product recommendation, weave it into the last sentence naturally — do NOT repeat it as a separate paragraph.
4. For investment / profit: state the figure, period, and confidence level.
5. For subscriptions: list items with amounts and give the monthly total.
6. For statement: give inflow, outflow, and net clearly.
7. For general finance questions: give a focused, data-backed answer.
8. NEVER invent numbers that are not present in the data above.
9. NEVER repeat the question back to the user. NEVER use filler phrases.
10. Plain prose only — no markdown, no bullet points, no headers.
11. Keep it to 2–3 short, punchy sentences maximum. End with one brief follow-up question or offer (e.g. "Want me to build a savings plan?"). Speak like a friendly, confident financial advisor — casual tone, not a formal report.
`);
    const validation = validateAssistantAnswer(state.question, answer, snapshot);
    if (!validation.valid) {
        return {
            finalAnswer: validation.safeAnswer ??
                "I want to avoid giving you an inaccurate number. Please share specific period and source values to confirm this precisely.",
        };
    }
    // Tag what action was offered in the follow-up question so the next turn
    // can detect a short "yes / do it" confirmation without re-running affordability.
    const pendingFollowUpAction = detectFollowUpAction(answer);
    return {
        finalAnswer: answer,
        knownFacts: { ...state.knownFacts, pendingFollowUpAction },
    };
};
/**
 * Lightweight keyword match on the last question in an answer to tag what
 * the assistant offered, e.g. "Want me to build a savings plan?" → "savings_plan".
 * Avoids an extra LLM call.
 */
function detectFollowUpAction(answer) {
    const lastQuestion = answer
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.includes("?"))
        .pop()
        ?.toLowerCase() ?? answer.toLowerCase();
    if (/buffer|rebuild|savings.plan|save.up|saving.plan|top.up/.test(lastQuestion))
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
