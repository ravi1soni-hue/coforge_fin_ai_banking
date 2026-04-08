import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

/**
 * Reasoning Agent
 *
 * Responsibility:
 * - Assess affordability and risk based on known financial data
 * - MUST always return a valid Partial<GraphStateType>
 * - MUST never throw due to LLM output issues
 * - Conservative defaults when data is incomplete
 */
export const reasoningAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  /* ---------------------------------------------------------
   * 1️⃣ LLM call with STRICT JSON‑only contract
   * --------------------------------------------------------- */
  let result: {
    affordable: boolean;
    confidenceLevel: "high" | "medium" | "low";
    risks: string[];
    rationale: string;
    suggestions: string[];
  };

  try {
    result = await llm.generateJSON<{
      affordable: boolean;
      confidenceLevel: "high" | "medium" | "low";
      risks: string[];
      rationale: string;
      suggestions: string[];
    }>(`
You are a bank-grade financial reasoning agent.

STRICT OUTPUT RULES (MANDATORY):
- Output MUST be a single valid JSON object
- Output MUST start with "{" and end with "}"
- NO text, NO markdown, NO explanations outside JSON
- NO formulas, NO calculations, NO math symbols in numbers
- NEVER show calculation steps
- ALL numeric values must be FINAL

INPUT DATA:
User financial data:
${JSON.stringify(state.financeData)}

Planned purchase / goal cost:
${JSON.stringify(state.researchData)}

REASONING TASK:
- Decide whether the goal is affordable
- Assess risks conservatively
- Reason as a cautious bank advisor would

DECISION RULES:
- affordable = true ONLY if essential expenses are not impacted
- If data is missing or incomplete → affordable = false
- confidenceLevel reflects data completeness
- risks must be realistic and concise
- suggestions must be practical and bank‑safe

Return exactly this JSON shape:
{
  "affordable": boolean,
  "confidenceLevel": "high" | "medium" | "low",
  "risks": string[],
  "rationale": string,
  "suggestions": string[]
}
`);
  } catch (err) {
    // ✅ CRITICAL: reasoning failures must never crash the graph
    console.error("❌ ReasoningAgent JSON failure:", err);

    // ✅ Conservative, deterministic fallback
    result = {
      affordable: false,
      confidenceLevel: "low",
      risks: ["Insufficient financial data to assess affordability"],
      rationale:
        "The available financial information is incomplete or unclear, preventing a confident affordability assessment.",
      suggestions: [
        "Provide updated income and expense details",
      ],
    };
  }

  /* ---------------------------------------------------------
   * 2️⃣ Defensive validation & sanitation
   * --------------------------------------------------------- */
  const sanitizedReasoning = {
    affordable: typeof result.affordable === "boolean"
      ? result.affordable
      : false,

    confidenceLevel:
      result.confidenceLevel === "high" ||
      result.confidenceLevel === "medium" ||
      result.confidenceLevel === "low"
        ? result.confidenceLevel
        : "low",

    risks: Array.isArray(result.risks)
      ? result.risks
      : [],

    rationale:
      typeof result.rationale === "string"
        ? result.rationale
        : "No rationale provided.",

    suggestions: Array.isArray(result.suggestions)
      ? result.suggestions
      : [],
  };

  /* ---------------------------------------------------------
   * 3️⃣ Return PATCH ONLY (LangGraph best practice)
   * --------------------------------------------------------- */
  return {
    reasoning: sanitizedReasoning,
  };
};