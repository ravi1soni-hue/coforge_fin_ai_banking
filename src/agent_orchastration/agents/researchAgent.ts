import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

type ResearchResult = {
  analysisType: string;
  assumptions: string[];
  plan: Record<string, unknown>;
  summary: string;
  costs: {
    breakdown: Record<string, number>;
    total: number | null;
    currency: string;
    source?: "user_input" | "web_search" | "unverified" | "missing";
  };
  investmentSummary?: {
    period: string;
    profitOrLoss: number;
    currency: string;
    notes?: string;
  };
  subscriptionSummary?: {
    monthlyTotal: number;
    currency: string;
    items: Array<{ name: string; amount: number }>;
  };
  statementSummary?: {
    period: string;
    totalInflow: number;
    totalOutflow: number;
    netCashflow: number;
    currency: string;
  };
  alternatives?: Array<{
    label: string;
    costs: { total: number };
    notes?: string;
  }>;
};

const parsePositiveNumber = (value: unknown): number | undefined => {
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

const sanitizeAffordabilityResult = (
  state: GraphStateType,
  result: ResearchResult
): ResearchResult => {
  if (result.analysisType !== "affordability") {
    return result;
  }

  const knownFactsBudget =
    parsePositiveNumber(state.knownFacts?.targetAmount) ??
    parsePositiveNumber(state.knownFacts?.budget);

  // Web search price: use midpoint of confirmed/partial DDG range as trusted cost
  const searchResult = state.priceSearchResult;
  const webSearchCost =
    searchResult &&
    searchResult.confidence !== "none" &&
    searchResult.priceRange
      ? Math.round(
          (searchResult.priceRange.min + searchResult.priceRange.max) / 2
        )
      : searchResult?.confidence !== "none" && searchResult?.extractedPrices?.length
      ? searchResult.extractedPrices[0].amount
      : undefined;

  const reportedCost = parsePositiveNumber(result.costs?.total ?? undefined);
  // Priority 1: user-provided  Priority 2: DDG web search  Priority 3: LLM training estimate  Priority 4: ask user
  const trustedCost = knownFactsBudget ?? webSearchCost ?? reportedCost;

  const assumptions = Array.isArray(result.assumptions) ? [...result.assumptions] : [];
  if (!trustedCost) {
    assumptions.push(
      "No numeric goal cost could be determined; user should provide the target amount for an accurate verdict."
    );
  } else if (webSearchCost && !knownFactsBudget) {
    assumptions.push(
      `Cost sourced from live DuckDuckGo search (query: "${searchResult?.query ?? ""}", confidence: ${searchResult?.confidence ?? "partial"}).`
    );
  } else if (reportedCost && !knownFactsBudget && !webSearchCost) {
    assumptions.push(
      "Cost is a market estimate based on model training data. Confirm the actual price before making any financial decision."
    );
  }

  const costSource: "user_input" | "web_search" | "unverified" | "missing" = knownFactsBudget
    ? "user_input"
    : webSearchCost
    ? "web_search"
    : reportedCost
    ? "unverified"
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

export const researchAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {
  const llm = config.configurable?.llm as LlmClient;

  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  const result = await llm.generateJSON<ResearchResult>(`
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
  * If neither user amount nor web search price is available but the item is a well-known consumer product (e.g. iPhone model, specific car, laptop brand), use your training-data knowledge of its typical retail price and set costs.source="unverified".
  * Only set costs.total=null and costs.source="missing" when the item is genuinely custom or unidentifiable with no price signal at all.
  * Never return 0 or negative for affordability cost.
  * Do not be optimistic – when uncertain, use the higher end of a known price range.
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