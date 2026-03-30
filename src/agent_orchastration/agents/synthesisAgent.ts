import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";
export const synthesisAgent =
async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;

  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

    const answer = await llm.generateText(`
Explain this financial advice clearly:

${JSON.stringify(state.reasoning)}
`);

    return {
      ...state,
      finalAnswer: answer,
    };
  };