import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

export const reasoningAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;

  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  const reasoning = await llm.generateJSON<{
    affordable: boolean;
    confidenceLevel: "high" | "medium" | "low";
    risks: string[];
    rationale: string;
    suggestions: string[];
  }>(`
You are a bank-grade financial reasoning agent.

INPUT DATA:
User financial data:
${JSON.stringify(state.financeData)}

Planned purchase / goal cost:
${JSON.stringify(state.researchData)}

TASK:
- Determine whether the goal is affordable for the user.
- Assess risk conservatively.
- Provide high-level reasoning suitable for a bank advisor.

STRICT JSON RULES (NON-NEGOTIABLE):
- Output MUST be valid JSON.
- DO NOT include formulas, calculations, or math expressions.
- DO NOT include symbols like =, ≈, /, *, or parentheses in numeric fields.
- ALL numeric values must be FINAL computed values.
- If explanation is needed, put it ONLY in plain text strings.
- NEVER show calculation steps.

REASONING GUIDELINES:
- "affordable": true ONLY if the cost can be covered without harming essential expenses.
- Use conservative judgment when data is incomplete.
- If financial data is missing or insufficient, set affordable = false.
- risks should be realistic and short.
- suggestions should be practical and bank-safe.

Return ONLY valid JSON in this structure:
{
  "affordable": boolean,
  "confidenceLevel": "high" | "medium" | "low",
  "risks": string[],
  "rationale": string,
  "suggestions": string[]
}
`);

  // ✅ Return PATCH ONLY (LangGraph best practice)
  return {
    reasoning,
  };
};