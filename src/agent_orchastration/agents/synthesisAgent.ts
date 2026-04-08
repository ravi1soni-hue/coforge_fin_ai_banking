import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

/**
 * Synthesis Agent
 *
 * Responsibility:
 * - Produce the FINAL human‑readable answer to the user
 * - Clearly say Yes / Yes with caution / No
 * - Explain WHY using concrete financial details
 * - MUST never crash the graph
 * - Uses ONLY trusted upstream data (research + reasoning)
 */
export const synthesisAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  /* ---------------------------------------------------------
   * 1️⃣ Build trusted inputs (never undefined)
   * --------------------------------------------------------- */
  const reasoning = state.reasoning ?? {
    affordable: false,
    confidenceLevel: "low",
    risks: [],
    rationale:
      "There is not enough financial information to make a confident decision.",
    suggestions: [],
  };

  const researchData = state.researchData ?? {};

  /* ---------------------------------------------------------
   * 2️⃣ LLM call (TEXT output, but still guarded)
   * --------------------------------------------------------- */
  let answer: string;

  try {
    answer = await llm.generateText(`
You are a professional relationship manager at a bank, explaining a financial decision
using verified data and responsible guidance.

Your response MUST strictly follow this structure and tone.

================================================
1. DECISION (FIRST LINE ONLY)
- Start with EXACTLY one of:
  "Yes"
  "Yes, with caution"
  "No"
- Clearly answer the user's question.

2. WHY THIS DECISION (IMPORTANT)
- Explain WHY it is possible or not using FINANCIAL DETAILS.
- Reference cash flow, savings, liabilities, and buffers in simple terms.
- Be concrete but NOT mathematical.
- This section MUST justify the decision logically.

3. FINANCIAL HEALTH SNAPSHOT
- Summarize the user's financial position.
- Mention income stability, spending pattern, savings buffer.
- Avoid raw numbers where possible.

4. PROPOSED PLAN OVERVIEW
- Briefly describe the plan being considered.
- Duration, scope, and main assumptions.
- Make it easy to visualize.

5. COST & IMPACT SUMMARY
- High‑level cost components (bullets).
- Explain relative impact on monthly finances or savings.
- No excessive breakdowns.

6. RISK & BUFFER CHECK
- What could go wrong?
- Are emergency funds still protected?
- Use bank‑grade language like "within a safe range" or "manageable impact".

7. BANK GUIDANCE & NEXT STEPS
- Clear recommendation.
- What to monitor carefully.
- Optional safer adjustments or alternatives.

STYLE RULES:
- Calm, reassuring, professional.
- Do NOT speculate beyond provided data.
- Do NOT introduce new financial facts.
- Do NOT encourage risky behavior.
- Do NOT mention confidence scores or internal reasoning labels.

User question:
"${state.question}"

Research plan details (trusted input):
${JSON.stringify(researchData, null, 2)}

Financial reasoning result (trusted input):
${JSON.stringify(reasoning, null, 2)}

Produce ONE coherent final response.
`);
  } catch (err) {
    console.error("❌ SynthesisAgent text generation failure:", err);

    /* ---------------------------------------------------------
     * 3️⃣ Deterministic, human‑safe fallback
     * --------------------------------------------------------- */
    answer = `
No

Based on the available financial information, we cannot confidently confirm that this plan
can be supported without placing stress on essential expenses or savings.

At this stage, the overall financial picture does not clearly show enough surplus or buffer
to absorb the proposed cost comfortably. When key details such as stable cash flow,
recurring obligations, or emergency reserves are unclear, the safest position is to avoid
moving forward.

From a financial health perspective, it would be advisable to first strengthen visibility
around income stability, monthly commitments, and savings reserves before considering
this plan.

Our recommendation is to pause, review core finances, and reassess once clearer and more
complete information is available. This ensures any future decision remains well within a
safe and sustainable range.
`.trim();
  }

  /* ---------------------------------------------------------
   * 4️⃣ Return PATCH ONLY (LangGraph best practice)
   * --------------------------------------------------------- */
  return {
    finalAnswer: answer,
  };
};