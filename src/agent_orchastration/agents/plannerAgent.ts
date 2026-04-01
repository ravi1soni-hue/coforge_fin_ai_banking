import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

export const plannerAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  // If intent is unclear, ask user to clarify
  if (!state.intent || state.intent.confidence < 0.5) {
    return {
      missingFacts: ["clarify_intent"],
    };
  }

  const lowerQuestion = state.question.toLowerCase();
  const isTravelAffordability =
    /holiday|trip|travel|vacation|japan|tour/.test(lowerQuestion) &&
    ["affordability", "planning", "decision"].includes(
      state.intent.action.toLowerCase()
    );

  // Keep travel affordability intake banking-focused and lightweight.
  if (isTravelAffordability) {
    // Proceed directly for affordability estimation using known facts + banking profile context.
    return {
      missingFacts: [],
    };
  }

  const result = await llm.generateJSON<{
    requiredFacts: string[];
  }>(`
You are a planning agent for a financial reasoning system.

User intent:
${JSON.stringify(state.intent)}

Already known information:
${JSON.stringify(state.knownFacts)}

Task:
- Identify what additional information is REQUIRED
  to answer the user's question correctly.
- Use short, generic field names.
- Do not invent facts.
- If nothing is required, return an empty array.
- This is NOT execution planning.
- Ask for the minimum required facts only.
- Prioritize banking affordability data over lifestyle/travel details.
- Do NOT ask for items like activities, itinerary, or accommodation preferences.
- Return at most 3 facts.

Return ONLY valid JSON:
{
  "requiredFacts": string[]
}
`);

  const missingFacts = result.requiredFacts.filter(
    fact => !(fact in state.knownFacts)
  ).slice(0, 3);

  return {
    missingFacts,
  };
};