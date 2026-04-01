import { buildDeterministicSnapshot, tryBuildDeterministicAnswer, validateAssistantAnswer, } from "../services/deterministicFinance.service.js";
export const synthesisAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    const snapshot = buildDeterministicSnapshot(state);
    const directAnswer = tryBuildDeterministicAnswer(state.question, snapshot);
    if (directAnswer) {
        return {
            finalAnswer: directAnswer,
        };
    }
    const answer = await llm.generateText(`
You are a personal banking assistant having a direct one-to-one conversation with a customer.

CORE RULE: Answer exactly what the user asked. Nothing more.

How to respond based on what the user asked:

- Simple balance/account query ("what is my balance", "show my account"):
  Reply in 1-2 sentences with the balance figures from the data. That is all.

- Simple subscription query ("what subscriptions do I have"):
  List them briefly with amounts. No advice unless asked.

- Simple statement/history query:
  Give a short summary of inflow, outflow, net. No analysis essays.

- Affordability query ("can I afford X"):
  Give a direct verdict with the key numbers (cost vs savings capacity).
  If not affordable, mention the shortfall and realistic months needed.
  Optionally suggest ONE saving plan only if it genuinely helps.

- Investment query:
  Give profit/loss figure for the period asked. Brief and factual.

RULES (never break these):
- Never use sections, headings, labels, or numbered parts in your reply.
- Never write an essay when a sentence will do.
- Never suggest products unless the user is asking how to reach a goal.
- Never repeat the question back to the user.
- Never invent data. Only use what is in the inputs below.
- Speak like a human, not a report generator.
- Plain text only. No markdown, no bold, no bullets.
- Maximum 3 sentences for simple queries. Up to 6 sentences for affordability/planning queries.

User question:
"${state.question}"

Financial data (use only what is relevant to the question):
${JSON.stringify(state.financeData, null, 2)}

Research output:
${JSON.stringify(state.researchData, null, 2)}

Reasoning output:
${JSON.stringify(state.reasoning, null, 2)}

Product recommendation (use only if user is asking for a plan):
${JSON.stringify(state.productRecommendations ?? [], null, 2)}
`);
    const validation = validateAssistantAnswer(state.question, answer, snapshot);
    if (!validation.valid) {
        return {
            finalAnswer: validation.safeAnswer ??
                "I want to avoid giving you an inaccurate number. Please share the specific period and source values to confirm this precisely.",
        };
    }
    // ✅ LangGraph best practice: return patch only
    return {
        finalAnswer: answer,
    };
};
