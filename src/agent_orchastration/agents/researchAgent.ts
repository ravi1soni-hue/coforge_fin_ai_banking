import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

const DEFAULT_CURRENCY = "USD";

export const researchAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  // ✅ Currency resolution (explicit policy)
  const baseCurrency =
    state.financeData?.currency ?? DEFAULT_CURRENCY;

  const result = await llm.generateJSON<{
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

IMPORTANT CURRENCY RULES:
- The base currency is ${baseCurrency}.
- ALL monetary values MUST be expressed in ${baseCurrency}.
- Do NOT convert currencies.
- Do NOT mix currencies.

STRICT JSON RULES (NON-NEGOTIABLE):
- Output MUST be valid JSON.
- DO NOT include formulas, calculations, or math expressions.
- DO NOT include symbols like =, ≈, /, *, or parentheses inside numbers.
- ALL numeric values must be FINAL computed values.
- If explanation is needed, put it ONLY in text fields.
- Never show calculation steps.

User intent:
${JSON.stringify(state.intent)}

Known facts:
${JSON.stringify(state.knownFacts)}

Task:
- Build a REALISTIC plan relevant to the user intent.
- Include assumptions explicitly.
- Provide a detailed cost breakdown.
- Offer 1–2 reasonable alternatives if applicable.
- Do NOT consider user affordability.
- Do NOT give advice.

RULES:
- Be practical and conservative.
- Keep structure clean.
- Use realistic market prices.
- Return ONLY valid JSON.

Return JSON in this exact structure:
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

  // ✅ Defensive currency validation (bank-grade)
  if (result.costs.currency !== baseCurrency) {
    throw new Error(
      `ResearchAgent returned currency ${result.costs.currency}, expected ${baseCurrency}`
    );
  }

  return {
    researchData: result,
  };
};