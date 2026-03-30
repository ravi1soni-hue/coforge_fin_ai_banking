import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

export const researchAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {
  const llm = config.configurable?.llm as LlmClient;

  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

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
You are a research and planning agent for a financial AI system.

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

Rules:
- Be practical and conservative.
- Use realistic numbers.
- Keep structure clean.
- Return ONLY valid JSON.

Return JSON in this structure:
{
  "planType": string,
  "assumptions": string[],
  "plan": object,
  "costs": {
    "breakdown": { [key: string]: number },
    "total": number,
    "currency": string
  },
  "alternatives": []
}
`);

  return {
    researchData: result,
  };
};