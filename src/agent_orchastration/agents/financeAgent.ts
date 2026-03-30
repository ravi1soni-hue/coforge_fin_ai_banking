import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { VectorQueryService } from "../services/vector.query.service.js";
import { RunnableConfig } from "@langchain/core/runnables";

const ALLOWED_FINANCIAL_FACETS = [
  "income",
  "expenses",
  "savings",
  "loans",
  "credit",
  "investments",
  "assets",
  "liabilities",
  "subscriptions",
  "cashflow_summary",
] as const;

type FinancialFacet = typeof ALLOWED_FINANCIAL_FACETS[number];

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

  // ✅ Step 1: Decide what financial data is needed
  const facetDecision = await llm.generateJSON<{
    requiredFacets: FinancialFacet[];
  }>(`
You are a financial data planning agent.

User intent:
${JSON.stringify(state.intent)}

User question:
"${state.question}"

Task:
Decide which financial data facets are REQUIRED to answer the user's question.

Allowed facets:
${JSON.stringify(ALLOWED_FINANCIAL_FACETS)}

Rules:
- Choose only from the allowed list.
- Return the MINIMAL required set.
- If the question is generic, return ["cashflow_summary"].
- Return ONLY valid JSON.

Return format:
{
  "requiredFacets": string[]
}
`);

  // ✅ Validate against allowed facets
  const facetsToExtract =
    facetDecision.requiredFacets.filter(
      (f): f is FinancialFacet =>
        ALLOWED_FINANCIAL_FACETS.includes(f)
    ) ?? ["cashflow_summary"];

  // ✅ Step 2: Fetch RAG financial context
  const context = await vectorQueryService.getContext(
    `complete financial data for user ${state.userId}`,
    { topK: 8 }
  );

  // ✅ Step 3: Extract only the required facets
  const financeData = await llm.generateJSON<Record<string, unknown>>(`
Extract ONLY the specified financial facets from the context below.

Requested facets:
${JSON.stringify(facetsToExtract)}

Context:
${context}

Rules:
- Do NOT invent values.
- If a facet is missing, return null.
- Keep structure simple.

Return ONLY valid JSON in this shape:
{
${facetsToExtract.map(f => `  "${f}": object | number | null`).join(",\n")}
}
`);

  return {
    financeData,
  };
};