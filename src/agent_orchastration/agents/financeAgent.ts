import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { VectorQueryService } from "../services/vector.query.service.js";
import { RunnableConfig } from "@langchain/core/runnables";

export const financeAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  const vectorQueryService =
    config.configurable?.vectorQueryService as VectorQueryService;

  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  if (!vectorQueryService) {
    throw new Error("VectorQueryService not provided to graph");
  }

  // ✅ RAG context retrieval
  const context = await vectorQueryService.getContext(
    `financial summary for user ${state.userId}`,
    { topK: 5 }
  );

  // ✅ LLM structured extraction
  const finance = await llm.generateJSON<{
    income: number;
    expenses: number;
    savings: number;
  }>(`
Extract structured financial data from the context below.

Context:
${context}

Return JSON ONLY:
{
  "income": number,
  "expenses": number,
  "savings": number
}
`);

  // ✅ RETURN ONLY PATCH (NO spreading state)
  return {
    financeData: finance,
  };
};