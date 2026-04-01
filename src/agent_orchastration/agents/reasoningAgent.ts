
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
    queryType: string;
    affordable: boolean;
    affordableNextMonth: boolean;
    estimatedTripCost: number;
    projectedNextMonthSavings: number;
    shortfallAmount: number;
    monthsToTargetAtCurrentSavingsRate: number;
    keyMetrics: Array<{ label: string; value: string | number }>;
    risks: string[];
    suggestions: string[];
  }>(`
You are a financial reasoning agent.

User finance:
${JSON.stringify(state.financeData)}

Goal cost:
${JSON.stringify(state.researchData)}

Known facts:
${JSON.stringify(state.knownFacts)}

Current date:
${new Date().toISOString()}

Task:
- Determine query type from data (affordability, investment_performance, subscriptions, bank_statement, general_finance).
- For affordability queries:
  * Evaluate whether this goal is affordable next month.
  * Estimate goal cost from plan data.
  * Estimate projected savings available by next month.
  * If unaffordable, calculate shortfall and months needed at current savings rate.
- For non-affordability queries:
  * Keep affordability fields conservative defaults.
  * Provide useful key metrics and practical suggestions.
- Keep numbers realistic and conservative.

Return JSON ONLY in this format:
{
  "queryType": string,
  "affordable": boolean,
  "affordableNextMonth": boolean,
  "estimatedTripCost": number,
  "projectedNextMonthSavings": number,
  "shortfallAmount": number,
  "monthsToTargetAtCurrentSavingsRate": number,
  "keyMetrics": [{ "label": string, "value": string | number }],
  "risks": string[],
  "suggestions": string[]
}
`);

  return {
    ...state,
    reasoning,
  };
};