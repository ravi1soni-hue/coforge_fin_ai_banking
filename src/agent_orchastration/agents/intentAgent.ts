import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

export const intentAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  // ── Short-circuit: user is confirming a pending follow-up offer ──────────
  // e.g. "Yes do it" / "Sure" / "Go ahead" after we offered a savings plan.
  const pendingAction = state.knownFacts?.pendingFollowUpAction as string | undefined;
  const isConfirmation =
    /^\s*(yes|yeah|yep|sure|ok|okay|go ahead|do it|sounds good|proceed|please|absolutely|let's|let me know|continue)\b/i.test(
      state.question.trim()
    );

  if (isConfirmation && pendingAction) {
    // Map the stored tag to a meaningful intent so downstream agents don't
    // re-run the previous analysis.
    const pendingIntentMap: Record<string, { domain: string; action: string }> =
      {
        savings_plan:          { domain: "saving",   action: "planning"            },
        cashflow_forecast:     { domain: "cashflow",  action: "forecast"            },
        investment_review:     { domain: "investing", action: "review"              },
        subscription_review:   { domain: "spending",  action: "optimization"        },
        statement_summary:     { domain: "banking",   action: "statement"           },
        goal_planning:         { domain: "saving",    action: "planning"            },
        general_planning:      { domain: "general",   action: "planning"            },
        repayment_plan:        { domain: "finance",   action: "repayment_planning"  },
        goal_impact_analysis:  { domain: "finance",   action: "goal_impact"         },
      };
    const mapped = pendingIntentMap[pendingAction] ?? { domain: "general", action: "planning" };

    return {
      intent: {
        domain: mapped.domain,
        action: mapped.action,
        subject:
          (state.knownFacts?.subject as string | undefined) ??
          (state.knownFacts?.destination as string | undefined),
        confidence: 0.95,
      },
      // Mark what was confirmed so the graph can fast-path and synthesisAgent knows what to deliver.
      confirmedFollowUpAction: pendingAction,
      // Clear the flag so subsequent turns don't re-trigger this path.
      knownFacts: { ...state.knownFacts, pendingFollowUpAction: undefined },
    };
  }
  // ─────────────────────────────────────────────────────────────────────────

  const result = await llm.generateJSON<{
    domain: string;
    action: string;
    subject?: string;
    confidence: number;
  }>(`
You are an intent classification agent for a financial AI assistant.

Your task is to classify the user's request into a GENERIC FINANCIAL INTENT.

Guidelines:
- Domain must be a broad financial area (e.g. travel, saving, investing, loans, spending, income, general).
- Action describes what the user wants to do (e.g. affordability, planning, optimization, decision, explanation).
- Subject is optional and should be short (e.g. "Japan trip", "car", "home loan").
- If the message is casual or unclear (e.g. "hello"), use:
  domain = "general"
  action = "conversation"
- Do NOT invent details.
- Keep output concise.
- Return ONLY valid JSON. No markdown, no explanation.

User message:
"${state.question}"

Return JSON:
{
  "domain": string,
  "action": string,
  "subject": string | null,
  "confidence": number
}
`);

  // ✅ Return only the patch
  return {
    intent: {
      domain: result.domain,
      action: result.action,
      subject: result.subject ?? undefined,
      confidence: result.confidence,
    },
  };
};