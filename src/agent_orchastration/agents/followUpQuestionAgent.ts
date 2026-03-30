import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

export const followUpQuestionAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {
  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  if (!state.missingFacts || state.missingFacts.length === 0) {
    return {};
  }

  const followUpQuestion = await llm.generateText(`
You are a professional banking assistant.

Original user question:
"${state.question}"

The system needs more information to proceed.

Missing information (internal identifiers):
${JSON.stringify(state.missingFacts)}

Task:
- Ask a single, clear, polite follow-up question.
- Do NOT mention internal field names.
- Combine multiple questions if possible.
- Sound helpful and professional.
- Ask as a relationship manager would.

Return ONLY the follow-up question text.
`);

  return {
    finalAnswer: followUpQuestion,
  };
};
