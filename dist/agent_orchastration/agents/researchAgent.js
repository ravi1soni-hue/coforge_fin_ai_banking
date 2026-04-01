const parsePositiveNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
    }
    if (typeof value === "string") {
        const normalized = Number(value.replace(/[^\d.-]/g, ""));
        if (Number.isFinite(normalized) && normalized > 0) {
            return normalized;
        }
    }
    return undefined;
};
const sanitizeAffordabilityResult = (state, result) => {
    if (result.analysisType !== "affordability") {
        return result;
    }
    const knownFactsBudget = parsePositiveNumber(state.knownFacts?.targetAmount) ??
        parsePositiveNumber(state.knownFacts?.budget);
    // Web search price: use midpoint of confirmed/partial DDG range as trusted cost
    const searchResult = state.priceSearchResult;
    const webSearchCost = searchResult &&
        searchResult.confidence !== "none" &&
        searchResult.priceRange
        ? Math.round((searchResult.priceRange.min + searchResult.priceRange.max) / 2)
        : searchResult?.confidence !== "none" && searchResult?.extractedPrices?.length
            ? searchResult.extractedPrices[0].amount
            : undefined;
    const reportedCost = parsePositiveNumber(result.costs?.total ?? undefined);
    // Priority: user-provided > web search > LLM-estimated (untrusted)
    const trustedCost = knownFactsBudget ?? webSearchCost ?? undefined;
    const assumptions = Array.isArray(result.assumptions) ? [...result.assumptions] : [];
    if (!trustedCost) {
        assumptions.push("No reliable user-provided or web-searched numeric goal cost was available; affordability verdict should remain conditional until target amount is provided.");
    }
    else if (webSearchCost && !knownFactsBudget) {
        assumptions.push(`Cost sourced from live DuckDuckGo Instant Answer search (query: "${searchResult?.query ?? ""}", confidence: ${searchResult?.confidence ?? "partial"}).`);
    }
    const costSource = knownFactsBudget
        ? "user_input"
        : webSearchCost
            ? "web_search"
            : "missing";
    return {
        ...result,
        assumptions,
        costs: {
            ...(result.costs ?? { breakdown: {}, currency: "USD" }),
            total: trustedCost ?? null,
            source: costSource,
        },
    };
};
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

Live price search result (DuckDuckGo Instant Answer, may be empty):
${JSON.stringify(state.priceSearchResult ?? { confidence: "none", extractedPrices: [] })}

Task:
- Determine query type and produce relevant financial analysis.
- Supported query types:
  1) affordability (car/trip/purchase planning)
  2) investment_performance (profit/loss)
  3) subscriptions (subscription spend overview)
  4) bank_statement (monthly statement style summary)
- For affordability:
  * If user provided budget/amount in knownFacts, use it directly as goal cost and set costs.source="user_input".
  * If "Live price search result" above has confidence="confirmed" or "partial" and contains extracted prices, use the provided priceRange midpoint or the first extractedPrice as costs.total and set costs.source="web_search".
  * If neither user amount nor web search price is available, set costs.total to null and costs.source="missing".
  * Never invent or hallucinate a cost. Never return 0 or negative.
  * Do not be optimistic – if web search gave a range, prefer the higher end.
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
    "total": number | null,
    "currency": string,
    "source": "user_input" | "unverified" | "missing"
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
    const sanitizedResult = sanitizeAffordabilityResult(state, result);
    return {
        researchData: sanitizedResult,
    };
};
