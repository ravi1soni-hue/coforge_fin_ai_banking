import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";
export const researchAgent =
async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;

  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }


    const costs = await llm.generateJSON(`
Estimate realistic costs for this goal:
${state.goal}

Return JSON cost breakdown.
`);

    return {
      ...state,
      researchData: costs,
    };
  };