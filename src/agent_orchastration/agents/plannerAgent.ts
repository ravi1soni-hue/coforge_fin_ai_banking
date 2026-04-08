import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

/**
 * Planner Agent
 *
 * Responsibility:
 * - Determine which additional facts are REQUIRED to answer the user's question
 * - Must ALWAYS return a valid Partial<GraphStateType>
 * - Must NEVER throw due to LLM output issues
 */
export const plannerAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  /* ---------------------------------------------------------
   * 1️⃣ Intent guard
   * --------------------------------------------------------- */
  if (!state.intent || state.intent.confidence < 0.5) {
    return {
      missingFacts: ["clarify_intent"],
    };
  }

  /* ---------------------------------------------------------
   * 2️⃣ Call LLM with HARD JSON‑only contract
   * --------------------------------------------------------- */
  let result: { requiredFacts: string[] };

  try {
    result = await llm.generateJSON<{
      requiredFacts: string[];
    }>(`
You are a planning agent for a financial reasoning system.

STRICT OUTPUT RULES (MANDATORY):
- Output MUST be a single valid JSON object
- Output MUST start with "{" and end with "}"
- NO text, NO markdown, NO explanation
- NO bullet points, NO prose
- NEVER ask questions
- If no information is required, return an empty array

Context:
User intent:
${JSON.stringify(state.intent)}

Already known information:
${JSON.stringify(state.knownFacts)}

Task:
- Identify ONLY the missing information REQUIRED to answer the user's question
- Use short, generic field names (e.g. "budget", "country", "time_horizon")
- Do NOT invent facts
- This is NOT execution planning

Return exactly this JSON shape:
{
  "requiredFacts": string[]
}
`);
  } catch (err) {
    // ✅ ABSOLUTELY CRITICAL: never crash the graph
    console.error("❌ PlannerAgent JSON failure:", err);

    // Safe fallback: assume no more facts are required
    result = { requiredFacts: [] };
  }

  /* ---------------------------------------------------------
   * 3️⃣ Defensive validation
   * --------------------------------------------------------- */
  const requiredFacts = Array.isArray(result.requiredFacts)
    ? result.requiredFacts
    : [];

  /* ---------------------------------------------------------
   * 4️⃣ Filter out already‑known facts
   * --------------------------------------------------------- */
  const missingFacts = requiredFacts.filter(
    fact => !(fact in state.knownFacts)
  );

  /* ---------------------------------------------------------
   * 5️⃣ Return graph patch ONLY
   * --------------------------------------------------------- */
  return {
    missingFacts,
  };
};
``