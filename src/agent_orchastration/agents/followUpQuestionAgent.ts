import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

export const followUpQuestionAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {
  if (!state.missingFacts || state.missingFacts.length === 0) {
    return {};
  }

  // When intentAgent already wrote a natural-language question, use it directly
  // (it will be a full sentence, not a bare field name like "targetAmount")
  const firstItem = state.missingFacts[0];
  if (firstItem && firstItem.includes(" ")) {
    return { finalAnswer: firstItem.trim() };
  }

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  const followUpQuestion = await llm.generateText(`
You are a helpful banking assistant. A user sent the following message:
"${state.question}"

From their message, we already know:
${JSON.stringify(state.knownFacts, null, 2)}

However, to give them a precise financial answer we still need:
${state.missingFacts.join(", ")}

Write a single, natural, friendly follow-up question that asks ONLY for the genuinely missing information.

RULES:
- Do NOT ask for anything that is already present in the user's message or known facts above.
- Be concise — one sentence only.
- Be conversational, not robotic.
- Do NOT use bullet points or lists.
- Do NOT repeat the user's question back to them.
`);

  return {
    finalAnswer: followUpQuestion.trim(),
  };
};
