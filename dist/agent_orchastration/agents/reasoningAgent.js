export const reasoningAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    const reasoning = await llm.generateJSON(`
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

Task:
- Determine query type from data (affordability, investment_performance, subscriptions, bank_statement, general_finance).
- For affordability queries:
  * Evaluate whether this goal is affordable next month.
  * Analyze current savings balance, average monthly income, average monthly expenses, and monthly net savings capacity.
  * Estimate goal cost from plan data.
  * Estimate projected savings available by next month.
  * Calculate shortfall and months needed at current savings rate.
  * Check emergency fund impact conservatively (do not assume full depletion is acceptable).
- For non-affordability queries:
  * Keep affordability fields conservative defaults.
  * Provide useful key metrics and practical suggestions.
- Keep numbers realistic and conservative.
- Set verdict using only these values:
  * "yes" when affordable now or next month without unsafe assumptions.
  * "conditional" when possible with moderate adjustment or short wait.
  * "no" when timeline is unrealistic at current run rate.
- Set confidence between 0 and 1 based on completeness and consistency of numeric inputs.

Verdict rules for affordability:
- affordable => "yes"
- possible with planning => "conditional"
- not advisable in timeline => "no"

Return JSON ONLY in this format:
{
  "queryType": string,
  "verdict": "yes" | "conditional" | "no",
  "confidence": number,
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
