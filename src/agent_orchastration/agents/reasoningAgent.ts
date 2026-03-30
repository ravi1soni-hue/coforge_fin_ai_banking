
import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";
export const reasoningAgent =async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;

  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  const reasoning = await llm.generateJSON<{
    affordable: boolean;
    risks: string[];
    suggestions: string[];
  }>(`
You are a financial reasoning agent.

User finance:
${JSON.stringify(state.financeData)}

Goal cost:
${JSON.stringify(state.researchData)}

Evaluate affordability strictly.

Return JSON ONLY.
`);

  return {
    ...state,
    reasoning,
  };
};