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
2. For affordability: give a direct verdict (yes / conditional / no), cite the user's actual monthly cashflow and goal cost, state shortfall or buffer after purchase, weave in the suggestion and product recommendation naturally where relevant.
3. For investment / profit: state the figure, period, and confidence level.
4. For subscriptions: list items with amounts and give the monthly total.
5. For statement: give inflow, outflow, and net clearly.
6. For general finance questions: give a focused, data-backed answer.
7. NEVER invent numbers that are not present in the data above.
8. NEVER repeat the question back to the user. NEVER use filler phrases.
9. Plain prose only — no markdown, no bullet points, no headers.
10. Aim for 3–6 dense, useful sentences. Speak like a confident personal finance analyst.
`);

  const validation = validateAssistantAnswer(state.question, answer, snapshot);
  if (!validation.valid) {
    return {
      finalAnswer:
        validation.safeAnswer ??
        "I want to avoid giving you an inaccurate number. Please share specific period and source values to confirm this precisely.",
    };
  }

  let finalResponse = answer;
  if (state.isSuggestionIncluded && state.suggestion) {
    finalResponse = `${answer}\n\n${state.suggestion}`;
  }

  return { finalAnswer: finalResponse };
};

