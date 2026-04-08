import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";


/**
 * Research Agent
 *
 * Responsibility:
 * - Produce a realistic research / planning output
 * - MUST always return valid Partial<GraphStateType>
 * - MUST never throw on LLM output errors
 * - Currency consistency is enforced deterministically
 */
export const researchAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  /* ---------------------------------------------------------
   * 1️⃣ Currency resolution (explicit system policy)
   * --------------------------------------------------------- */
  const baseCurrency =
    state.baseCurrency ;

  /* ---------------------------------------------------------
   * 2️⃣ LLM call (STRICT JSON‑only contract)
   * --------------------------------------------------------- */
  let result: {
    planType: string;
    assumptions: string[];
    plan: Record<string, unknown>;
    costs: {
      breakdown: Record<string, number>;
      total: number;
      currency: string;
    };
    alternatives?: Array<{
      label: string;
      costs: { total: number };
      notes?: string;
    }>;
  };

  try {
    result = await llm.generateJSON<{
      planType: string;
      assumptions: string[];
      plan: Record<string, unknown>;
      costs: {
        breakdown: Record<string, number>;
        total: number;
        currency: string;
      };
      alternatives?: Array<{
        label: string;
        costs: { total: number };
        notes?: string;
      }>;
    }>(`
You are a research and planning agent for a bank-grade financial AI system.

STRICT OUTPUT RULES (MANDATORY):
- Output MUST be a single valid JSON object
- Output MUST start with "{" and end with "}"
- NO text, NO markdown, NO explanations outside JSON
- NO formulas, NO calculations, NO math symbols inside numbers
- ALL numeric values must be FINAL computed values
- If explanation is required, put it ONLY inside text fields

CURRENCY RULES (NON-NEGOTIABLE):
- Base currency is ${baseCurrency}
- ALL monetary values MUST be in ${baseCurrency}
- Do NOT convert currencies
- Do NOT mix currencies

User intent:
${JSON.stringify(state.intent)}

Known facts:
${JSON.stringify(state.knownFacts)}

Task:
- Build a REALISTIC plan relevant to the user intent
- Explicitly list assumptions
- Provide a detailed cost breakdown
- Optionally provide 1–2 reasonable alternatives
- Do NOT assess affordability
- Do NOT give advice

Return exactly this JSON shape:
{
  "planType": string,
  "assumptions": string[],
  "plan": object,
  "costs": {
    "breakdown": { [key: string]: number },
    "total": number,
    "currency": "${baseCurrency}"
  },
  "alternatives": [
    {
      "label": string,
      "costs": { "total": number },
      "notes": string
    }
  ]
}
`);
  } catch (err) {
    // ✅ CRITICAL: never crash the graph
    console.error("❌ ResearchAgent JSON failure:", err);

    // ✅ Deterministic safe fallback
    result = {
      planType: "unknown",
      assumptions: [],
      plan: {},
      costs: {
        breakdown: {},
        total: 0,
        currency: baseCurrency,
      },
      alternatives: [],
    };
  }

  /* ---------------------------------------------------------
   * 3️⃣ Defensive currency enforcement (NO throws)
   * --------------------------------------------------------- */
  if (result.costs.currency !== baseCurrency) {
    console.warn(
      `⚠️ ResearchAgent currency mismatch: got ${result.costs.currency}, expected ${baseCurrency}`
    );

    // Force system‑policy currency instead of crashing
    result.costs.currency = baseCurrency;
  }

  /* ---------------------------------------------------------
   * 4️⃣ Defensive structure sanitization
   * --------------------------------------------------------- */
  const sanitizedResult = {
    planType: typeof result.planType === "string" ? result.planType : "unknown",
    assumptions: Array.isArray(result.assumptions) ? result.assumptions : [],
    plan: result.plan && typeof result.plan === "object" ? result.plan : {},
    costs: {
      breakdown:
        result.costs.breakdown && typeof result.costs.breakdown === "object"
          ? result.costs.breakdown
          : {},
      total: typeof result.costs.total === "number" ? result.costs.total : 0,
      currency: baseCurrency,
    },
    alternatives: Array.isArray(result.alternatives)
      ? result.alternatives
      : [],
  };

  /* ---------------------------------------------------------
   * 5️⃣ Return PATCH ONLY (LangGraph best practice)
   * --------------------------------------------------------- */
  return {
    researchData: sanitizedResult,
  };
};