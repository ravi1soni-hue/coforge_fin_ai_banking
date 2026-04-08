import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import {
  FinancialFacetEnum,
  DataSourceEnum,
  FacetPlanItemSchema,
} from "../graph/state.js";

/* -----------------------------------------
 * Inferred types (single source of truth)
 * ----------------------------------------- */
type FinancialFacet = z.infer<typeof FinancialFacetEnum>;
type DataSource = z.infer<typeof DataSourceEnum>;
type FacetPlanItem = z.infer<typeof FacetPlanItemSchema>;

/* -----------------------------------------
 * Runtime guards (Zod‑safe)
 * ----------------------------------------- */
function isValidFacet(value: string): value is FinancialFacet {
  return FinancialFacetEnum.options.includes(value as FinancialFacet);
}

function isValidSource(value: string): value is DataSource {
  return DataSourceEnum.options.includes(value as DataSource);
}

/* -----------------------------------------
 * Facet Planner Agent
 * ----------------------------------------- */
export const facetPlannerAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {
  const llm = config.configurable?.llm as LlmClient;
  if (!llm) throw new Error("LlmClient not provided");

  const result = await llm.generateJSON<{
    facets: { name: string; source: "sql" | "vector" }[];
  }>(`
You are a financial data planning agent for a bank.

STRICT RULES:
- Output MUST be valid JSON only
- Choose the MINIMAL set of facets required
- NEVER invent facet names
- Structured facts → SQL
- Activity or explanation → Vector

AVAILABLE SQL FACETS:
- balances
- income
- expenses
- savings
- loans
- credit
- investments
- assets
- liabilities

AVAILABLE VECTOR FACETS:
- transactions
- investment_activity
- subscriptions

User intent:
${JSON.stringify(state.intent)}

User question:
"${state.question}"

Return EXACTLY:
{
  "facets": [
    { "name": string, "source": "sql" | "vector" }
  ]
}
`);

  /* -----------------------------------------
   * Normalize + validate output
   * ----------------------------------------- */
  const queryFacets: FacetPlanItem[] =
    Array.isArray(result.facets)
      ? result.facets
          .filter(
            (f): f is { name: FinancialFacet; source: DataSource } =>
              isValidFacet(f.name) && isValidSource(f.source)
          )
          .map((f) =>
            ({
              facet: f.name,
              source: f.source,
            } satisfies FacetPlanItem)
          )
      : [];

  /* ✅ Deterministic fallback */
  if (queryFacets.length === 0) {
    queryFacets.push({
      facet: "balances",
      source: "sql",
    });
  }

  /* ✅ Patch‑only */
  return { queryFacets };
};