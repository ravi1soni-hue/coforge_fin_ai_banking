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

Return ONLY valid JSON:
{
  "requiredFacts": string[]
}
`);

  const missingFacts = result.requiredFacts.filter(
    fact => !(fact in state.knownFacts)
  );

  return {
    missingFacts,
  };
};