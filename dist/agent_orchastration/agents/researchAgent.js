export const researchAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    const result = await llm.generateJSON(`
You are a research and planning agent for a banking AI assistant.

Scope restriction:
- Operate strictly within banking, finance, and money management use cases.
- If user asks non-finance topics, return analysisType="out_of_scope" and keep other outputs conservative.

User intent:
${JSON.stringify(state.intent)}

Known facts:
${JSON.stringify(state.knownFacts)}

Task:
- Determine query type and produce relevant financial analysis.
- Supported query types:
  1) affordability (car/trip/purchase planning)
  2) investment_performance (profit/loss)
  3) subscriptions (subscription spend overview)
  4) bank_statement (monthly statement style summary)
- For affordability:
  * If user provided budget/amount, use it directly as goal cost.
  * If budget missing, estimate conservative realistic cost using global benchmarks.
  * Do not be optimistic.
- For investment performance: provide period profit/loss summary.
- For subscriptions: provide total and top items.
- For bank statement: provide inflow/outflow/net.
- Include assumptions and one concise summary.
- Do NOT give risky advice.

Rules:
- Be practical and conservative.
- Use realistic numbers.
- Keep structure clean.
- Return ONLY valid JSON.

Return JSON in this structure:
{
  "analysisType": string,
  "assumptions": string[],
  "summary": string,
  "plan": object,
  "costs": {
    "breakdown": { [key: string]: number },
    "total": number,
    "currency": string
  },
  "investmentSummary": {
    "period": string,
    "profitOrLoss": number,
    "currency": string
  },
  "subscriptionSummary": {
    "monthlyTotal": number,
    "currency": string,
    "items": []
  },
  "statementSummary": {
    "period": string,
    "totalInflow": number,
    "totalOutflow": number,
    "netCashflow": number,
    "currency": string
  },
  "alternatives": []
}
`);
    return {
        researchData: result,
    };
};
