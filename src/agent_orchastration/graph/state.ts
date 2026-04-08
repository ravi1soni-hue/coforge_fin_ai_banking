import { z } from "zod";





export const DEFAULT_BASE_CURRENCY = "GBP";


/* ------------------------------------------------
 * Shared enums
 * ------------------------------------------------ */

export const DataSourceEnum = z.enum(["sql", "vector"]);

export const FinancialFacetEnum = z.enum([
  "balances",
  "expenses",
  "income",
  "savings",
  "loans",
  "credit",
  "investments",
  "assets",
  "liabilities",
  "transactions",
  "investment_activity",
  "subscriptions",
]);



/* ------------------------------------------------
 * Facet planning primitives
 * ------------------------------------------------ */

export const FacetPlanItemSchema = z.object({
  facet: FinancialFacetEnum,
  source: DataSourceEnum,

  month: z.string().optional(), // YYYY-MM-01
  topK: z.number().optional(),
});

/* ------------------------------------------------
 * Graph State
 * ------------------------------------------------ */
export const GraphState = z.object({
  /* ✅ Identity & input */
  userId: z.string(),
  question: z.string(),

  /* ✅ User base currency (authoritative context) */
  baseCurrency: z.string().default(DEFAULT_BASE_CURRENCY),


  /* ✅ Generic financial intent (from IntentAgent) */
  intent: z
    .object({
      domain: z.string(),
      action: z.string(),
      subject: z.string().optional(),
      confidence: z.number(),
    })
    .optional(),

  /* ✅ Facet planner output */
  queryFacets: z.array(FacetPlanItemSchema).default([]),

  /* ✅ User-provided / inferred facts */
  knownFacts: z.record(z.string(), z.unknown()).default({}),
  missingFacts: z.array(z.string()).default([]),

  /* ✅ Downstream agent outputs */
  financeData: z.any().optional(),
  researchData: z.any().optional(),
  reasoning: z.any().optional(),

  /* ✅ Final answer */
  finalAnswer: z.string().optional(),
});

/* ------------------------------------------------
 * Inferred types
 * ------------------------------------------------ */
export type GraphStateType = z.infer<typeof GraphState>;
export type FinancialFacet = z.infer<typeof FinancialFacetEnum>;
export type DataSource = z.infer<typeof DataSourceEnum>;



/**
 * Safe string → Zod enum conversion.
 * Works reliably with z.enum([...]).
 */
export function toEnumValue(
  enumSchema: z.ZodEnum<any>,
  value: string | null | undefined
): string | undefined {
  if (!value) return undefined;

  return enumSchema.options.includes(value) ? value : undefined;
}