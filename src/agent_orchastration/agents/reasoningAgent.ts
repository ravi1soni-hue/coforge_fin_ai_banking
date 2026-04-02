
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
    verdict: "yes" | "conditional" | "no";
    confidence: number;
    affordable: boolean;
    affordableNextMonth: boolean;
    estimatedGoalCost: number;
    projectedNextMonthSavings: number;
    shortfallAmount: number;
    monthsToTargetAtCurrentSavingsRate: number;
    keyMetrics: Array<{ label: string; value: string | number }>;
    risks: string[];
    suggestions: string[];
  }>(`
You are a banking affordability and financial reasoning agent.

Scope restriction:
- Operate strictly within finance and money management.

User finance:
${JSON.stringify(state.financeData)}

Goal cost:
${JSON.stringify(state.researchData)}

Known facts:
${JSON.stringify(state.knownFacts)}

Current date:
${new Date().toISOString()}

CRITICAL SAVINGS RULES:
- spendable_savings (or availableSavings) is the ONLY amount the user can deploy for a large purchase. It contains ONLY savings-type account balances.
- The current account balance is NOT available for large one-off purchases — it covers monthly living expenses (rent, EMIs, groceries, subscriptions, etc.).
- NEVER add current account balance to spendable_savings when assessing affordability.
- Always subtract a minimum emergency buffer of 1 month's expenses from spendable_savings before assessing affordability.

Task:
- Determine query type from data (affordability, investment_performance, subscriptions, bank_statement, general_finance).
- For affordability queries (car, phone, trip, house deposit, insurance, bike, electronics, any purchase):
  * Use spendable_savings (savings account only) as the available pool.
  * Subtract emergency buffer (≥ 1 month expenses) from spendable_savings to get safe_spendable.
  * Compare goal cost to safe_spendable.
  * Calculate shortfall and months needed at current net savings rate.
- For non-affordability queries:
  * Keep affordability fields as conservative defaults.
  * Provide useful key metrics and practical suggestions.
- Keep numbers realistic and conservative.
- Set verdict using only these values:
  * "yes" when goal cost ≤ safe_spendable.
  * "conditional" when possible with moderate adjustment or short wait.
  * "no" when timeline is unrealistic at current run rate.
- Set confidence between 0 and 1 based on completeness and consistency of numeric inputs.

Return JSON ONLY in this format:
{
  "queryType": string,
  "verdict": "yes" | "conditional" | "no",
  "confidence": number,
  "affordable": boolean,
  "affordableNextMonth": boolean,
  "estimatedGoalCost": number,
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