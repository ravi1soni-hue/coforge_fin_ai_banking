import { z } from "zod";

export const GraphState = z.object({
  // ✅ Identity & input
  userId: z.string(),
  question: z.string(),

  // ✅ Generic financial intent (from IntentAgent)
  intent: z
    .object({
      domain: z.string(),      // e.g. travel, saving, investing, loans, general
      action: z.string(),      // e.g. affordability, planning, optimization
      subject: z.string().optional(), // e.g. "Japan trip", "home loan"
      confidence: z.number(),  // 0 → 1
    })
    .optional(),

  // ✅ User‑provided / extracted facts (multi‑turn)
  knownFacts: z.record(z.string(), z.unknown()).default({}),
  missingFacts: z.array(z.string()).default([]),

  // ✅ Downstream agent outputs
  financeData: z.any().optional(),
  researchData: z.any().optional(),
  reasoning: z.any().optional(),
  productRecommendations: z
    .array(
      z.object({
        productCode: z.string(),
        productName: z.string(),
        rationale: z.string(),
        suitabilityScore: z.number(),
        nextStep: z.string(),
      })
    )
    .optional(),

  // ✅ Live web price search result (DuckDuckGo Instant Answer, no API key)
  priceSearchResult: z
    .object({
      query: z.string(),
      source: z.literal("duckduckgo_ia"),
      rawAbstract: z.string().optional(),
      extractedPrices: z.array(
        z.object({
          amount: z.number(),
          currency: z.string(),
          label: z.string(),
        })
      ),
      priceRange: z
        .object({ min: z.number(), max: z.number(), currency: z.string() })
        .optional(),
      confidence: z.enum(["confirmed", "partial", "none"]),
      searchedAt: z.string(),
    })
    .optional(),

  // ✅ Context-aware suggestion (intent-based)
  suggestion: z.string().optional(),
  isSuggestionIncluded: z.boolean().optional(),

  // ✅ Final user‑facing answer
  finalAnswer: z.string().optional(),
});

export type GraphStateType = z.infer<typeof GraphState>;