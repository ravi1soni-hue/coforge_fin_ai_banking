import { z } from "zod";
export const GraphState = z.object({
    // ✅ Identity & input
    userId: z.string(),
    question: z.string(),
    // ✅ Generic financial intent (from IntentAgent)
    intent: z
        .object({
        domain: z.string(), // e.g. travel, saving, investing, loans, general
        action: z.string(), // e.g. affordability, planning, optimization
        subject: z.string().optional(), // e.g. "Japan trip", "home loan"
        confidence: z.number(), // 0 → 1
    })
        .optional(),
    // ✅ User‑provided / extracted facts (multi‑turn)
    knownFacts: z.record(z.string(), z.unknown()).default({}),
    missingFacts: z.array(z.string()).default([]),
    // ✅ Downstream agent outputs
    financeData: z.any().optional(),
    researchData: z.any().optional(),
    reasoning: z.any().optional(),
    // ✅ Final user‑facing answer
    finalAnswer: z.string().optional(),
});
