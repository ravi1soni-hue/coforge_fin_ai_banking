import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { VectorQueryService } from "../services/vector.query.service.js";
import { RunnableConfig } from "@langchain/core/runnables";

/* ------------------------------------------------
 * Allowed financial facets (STRICT guardrail)
 * ------------------------------------------------ */
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

function isFinancialFacet(value: string): value is FinancialFacet {
  return ALLOWED_FINANCIAL_FACETS.includes(value as FinancialFacet);
}

/* ------------------------------------------------
 * Allowed currencies (STRICT guardrail)
 * ------------------------------------------------ */
const ALLOWED_CURRENCIES = ["GBP", "INR", "USD", "EUR"] as const;
type CurrencyCode = typeof ALLOWED_CURRENCIES[number];

/* ------------------------------------------------
 * Canonical semantic query per facet (IMPORTANT)
 * One facet → one vector query
 * ------------------------------------------------ */
const FACET_CANONICAL_QUERY: Record<FinancialFacet, string> = {
  income: "user income and salary details",
  expenses: "user monthly expenses and spending breakdown",
  savings: "user savings and account balances",
  loans: "user outstanding loans and EMIs",
  credit: "user credit score and credit profile",
  investments: "user investment portfolio and holdings",
  assets: "user assets and net worth items",
  liabilities: "user financial liabilities",
  subscriptions: "user subscriptions and recurring payments",
  cashflow_summary: "user overall cash flow summary",
};

/* ------------------------------------------------
 * Finance Agent
 * ------------------------------------------------ */
export const financeAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {
  const llm = config.configurable?.llm as LlmClient;
  const vectorQueryService =
    config.configurable?.vectorQueryService as VectorQueryService;

  if (!llm) throw new Error("LlmClient not provided to graph");
  if (!vectorQueryService)
    throw new Error("VectorQueryService not provided to graph");

  /* ============================================================
   * STEP 1: LLM decides REQUIRED facets (dynamic intent)
   * ============================================================ */
  const facetPlan = await llm.generateJSON<{
    requiredFacets: string[];
  }>(`
You are a financial data planning agent for a bank.

User intent:
${JSON.stringify(state.intent)}

User question:
"${state.question}"

Allowed financial data categories:
${JSON.stringify(ALLOWED_FINANCIAL_FACETS)}

Task:
- Select the MINIMAL set of required categories.
- If unclear, return ["cashflow_summary"].
- Do NOT invent categories.

Return ONLY valid JSON:
{
  "requiredFacets": string[]
}
`);

  const facetsToUse: FinancialFacet[] =
    facetPlan.requiredFacets.filter(isFinancialFacet).length > 0
      ? facetPlan.requiredFacets.filter(isFinancialFacet)
      : ["cashflow_summary"];

  /* ============================================================
   * STEP 2: Targeted RAG retrieval (ONE call per facet)
   * Uses canonical semantic queries
   * ============================================================ */
  const contextChunks = await Promise.all(
    facetsToUse.map((facet) =>
      vectorQueryService.getContext(
        state.userId,
        `${FACET_CANONICAL_QUERY[facet]} for user ${state.userId}`,
        { topK: 3 }
      )
    )
  );

  const context = contextChunks.join("\n\n");

  // ✅ Explicit empty-context handling
  if (!context.trim()) {
    return {
      financeData: {
        currency: "GBP", // explicit system default
        facets: {},
      },
    };
  }

  /* ============================================================
   * STEP 3: SINGLE extraction LLM call (facets + currency)
   * Currency is inferred FROM CONTEXT (no guessing)
   * ============================================================ */
  const extraction = await llm.generateJSON<{
    currency: CurrencyCode;
    facets: Record<string, unknown | null>;
  }>(`
You are a bank-grade financial data extraction agent.

The text below comes from verified banking data.

TASK:
1. Determine the base currency from the context.
2. Extract ONLY the requested financial facets.

ALLOWED CURRENCIES:
${JSON.stringify(ALLOWED_CURRENCIES)}

CURRENCY RULES:
- Use explicit symbols (₹ £ $ €) or currency names.
- If multiple currencies appear, choose the most dominant one.
- Do NOT assume USD.
- Do NOT convert values between currencies.

EXTRACTION RULES:
- Extract ONLY requested facets.
- Do NOT invent data.
- If missing, return null.
- Do NOT add explanations.

Requested facets:
${JSON.stringify(facetsToUse)}

Context:
${context}

Return ONLY valid JSON:
{
  "currency": "GBP | INR | USD | EUR",
  "facets": {
    "<facet>": value | null
  }
}
`);

  /* ============================================================
   * STEP 4: Safety validation & sanitation
   * ============================================================ */
  const resolvedCurrency: CurrencyCode =
    ALLOWED_CURRENCIES.includes(extraction.currency)
      ? extraction.currency
      : "USD"; // explicit fallback per your policy

  const sanitizedFacets: Partial<Record<FinancialFacet, unknown>> = {};

  for (const [key, value] of Object.entries(extraction.facets)) {
    if (isFinancialFacet(key)) {
      sanitizedFacets[key] = value;
    }
  }

  /* ============================================================
   * STEP 5: Return PATCH ONLY (LangGraph best practice)
   * ============================================================ */
  return {
    financeData: {
      currency: resolvedCurrency,
      facets: sanitizedFacets,
    },
  };
};