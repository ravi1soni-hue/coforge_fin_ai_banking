import { RunnableConfig } from "@langchain/core/runnables";
import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";

export const productRecommendationAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {
  const llm = config.configurable?.llm as LlmClient;

  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  const result = await llm.generateJSON<{
    recommendations: Array<{
      productCode: string;
      productName: string;
      rationale: string;
      suitabilityScore: number;
      nextStep: string;
    }>;
  }>(`
You are a banking product recommendation agent.

Your job:
- Recommend up to 3 suitable banking products based on affordability and plan context.
- Recommend only practical, low-risk products unless data clearly supports otherwise.
- If no product is appropriate, return an empty array.

User intent:
${JSON.stringify(state.intent, null, 2)}

User finance profile:
${JSON.stringify(state.financeData, null, 2)}

Plan details:
${JSON.stringify(state.researchData, null, 2)}

Reasoning summary:
${JSON.stringify(state.reasoning, null, 2)}

Allowed product styles (examples):
- recurring_deposit
- high_yield_savings
- goal_based_savings
- emergency_fund_sweeper
- low_risk_sip

Rules:
- Do not suggest products that increase risk when affordability is weak.
- Keep rationale concise and customer-friendly.
- suitabilityScore must be between 0 and 1.
- Return ONLY valid JSON.

Return JSON:
{
  "recommendations": [
    {
      "productCode": string,
      "productName": string,
      "rationale": string,
      "suitabilityScore": number,
      "nextStep": string
    }
  ]
}
`);

  return {
    productRecommendations: Array.isArray(result.recommendations)
      ? result.recommendations
      : [],
  };
};