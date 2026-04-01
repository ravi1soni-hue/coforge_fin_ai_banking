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
- Recommend exactly 1 best-fit banking product based on affordability and plan context.
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

Allowed products only:
- savings_goal
- recurring_deposit
- sip
- flexi_sweep_fd
- budget_planner
- auto_pay_saving
- installment_card_0apr
- low_apr_credit_card

Rules:
- Do not suggest products that increase risk when affordability is weak.
- Keep rationale concise and customer-friendly.
- suitabilityScore must be between 0 and 1.
- Prefer one clear recommendation over multiple options.
- Product suggestions are optional and context-driven.
- Frame recommendations as optional support paths, never hard sales.
- For short-term purchase affordability with cashflow pressure, prefer budget_planner or installment_card_0apr over high-interest credit.
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