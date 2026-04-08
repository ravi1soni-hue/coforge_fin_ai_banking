import { GraphStateType, FacetPlanItemSchema } from "../graph/state.js";
import { RunnableConfig } from "@langchain/core/runnables";
import { StructuredFinancialRepository } from "../../repo/structured.finance.repo.js";
import { VectorQueryService } from "../services/vector.query.service.js";
import { z } from "zod";
import { StructuredFinancialDataService } from "../../services/structured.financial.data.service.js";

/* -----------------------------------------
 * Helpers
 * ----------------------------------------- */
function currentMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

function assertNever(x: never): never {
  throw new Error(`Unhandled SQL facet: ${String(x)}`);
}

/* -----------------------------------------
 * SQL‑only facet domain
 * ----------------------------------------- */
type SqlFacet =
  | "balances"
  | "income"
  | "expenses"
  | "savings"
  | "loans"
  | "credit"
  | "investments"
  | "assets"
  | "liabilities";

/* -----------------------------------------
 * Correlated type‑guard (IMPORTANT)
 * ----------------------------------------- */
type FacetPlanItem = z.infer<typeof FacetPlanItemSchema>;

function isSqlFacetItem(
  item: FacetPlanItem
): item is FacetPlanItem & { source: "sql"; facet: SqlFacet } {
  return item.source === "sql";
}

/* -----------------------------------------
 * Finance Agent (EXECUTION ONLY)
 * ----------------------------------------- */
export const financeAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {
  const structuredfinancialService =
    config.configurable?.financialDataService as StructuredFinancialDataService;
  const vectorQueryService =
    config.configurable?.vectorQueryService as VectorQueryService;

  if (!structuredfinancialService) {
    throw new Error("StructuredFinancialRepository not provided");
  }
  if (!vectorQueryService) {
    throw new Error("VectorQueryService not provided");
  }

  const structuredResults: Record<string, unknown> = {};
  const unstructuredContexts: string[] = [];

  const queryFacets: FacetPlanItem[] = state.queryFacets;

  /* =====================================================
   * Execute data plan
   * ===================================================== */
  for (const item of queryFacets) {
    /* ---------------- SQL ---------------- */
    if (isSqlFacetItem(item)) {
      switch (item.facet) {
        case "balances":
        case "savings":
          structuredResults[item.facet] =
            await structuredfinancialService.getBalances(state.userId);
          break;

        case "income":
        case "expenses":
          structuredResults[item.facet] =
            await structuredfinancialService.getMonthlySummary(
              state.userId,
              item.month ?? currentMonth()
            );
          break;

        case "credit":
          structuredResults.credit =
            await structuredfinancialService.getCreditProfile(state.userId);
          break;

        case "loans":
          structuredResults.loans =
            await structuredfinancialService.getActiveLoans(state.userId);
          break;

        case "investments":
          structuredResults.investments =
            await structuredfinancialService.getInvestmentSummary(state.userId);
          break;

        case "assets":
        case "liabilities":
          structuredResults[item.facet] = []; // placeholder
          break;

        default:
          assertNever(item.facet);
      }
    }

    /* ---------------- VECTOR ---------------- */
    if (item.source === "vector") {
      const context = await vectorQueryService.getContext(
        state.userId,
        state.question,
        {
          facets: [item.facet],
          topK: item.topK ?? 5,
        }
      );

      if (context.trim()) {
        unstructuredContexts.push(context);
      }
    }
  }

  /* =====================================================
   * PATCH ONLY
   * ===================================================== */
  return {
    financeData: {
      structured: structuredResults,
      context:
        unstructuredContexts.length > 0
          ? unstructuredContexts.join("\n\n")
          : undefined,
    },
  };
};