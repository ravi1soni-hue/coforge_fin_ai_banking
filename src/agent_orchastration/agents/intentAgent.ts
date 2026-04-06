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

  console.log(`[IntentAgent] question="${state.question}" isConfirmation=${isConfirmation} pendingAction=${pendingAction ?? "none"}`);

  if (isConfirmation && pendingAction) {
    // Map the stored tag to a meaningful intent so downstream agents don't
    // re-run the previous analysis.
    const pendingIntentMap: Record<string, { domain: string; action: string }> =
      {
        savings_plan:          { domain: "saving",   action: "planning"            },
        savings_recovery:      { domain: "saving",   action: "recovery"            },
        cashflow_forecast:     { domain: "cashflow",  action: "forecast"            },
        investment_review:     { domain: "investing", action: "review"              },
        subscription_review:   { domain: "spending",  action: "optimization"        },
        statement_summary:     { domain: "banking",   action: "statement"           },
        goal_planning:         { domain: "saving",    action: "planning"            },
        general_planning:      { domain: "general",   action: "planning"            },
        repayment_plan:        { domain: "finance",   action: "repayment_planning"  },
        goal_impact_analysis:  { domain: "finance",   action: "goal_impact"         },
        cost_cutting_advice:   { domain: "travel",    action: "cost_optimization"   },
      };
    const mapped = pendingIntentMap[pendingAction] ?? { domain: "travel", action: "cost_optimization" };

    console.log(`[IntentAgent] CONFIRMED pendingAction="${pendingAction}" → domain="${mapped.domain}" action="${mapped.action}"`);

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

  // ── Fallback: no pendingFollowUpAction tag, but the message is a short
  //    confirmation and there is active financial context.
  //    Use conversation history to infer what the last offer was, defaulting
  //    to cost_cutting_advice for trip/purchase contexts.
  const isShortMessage = state.question.trim().split(/\s+/).length <= 10;
  const hasActivePlanContext = !!(state.knownFacts?.targetAmount || state.knownFacts?.goalType);
  if (isConfirmation && isShortMessage && hasActivePlanContext) {
    // Try to infer action from the last assistant message in conversation history
    const lastAssistantMsg = Array.isArray(state.conversationHistory)
      ? [...state.conversationHistory].reverse().find(m => m.role === "assistant")?.content?.toLowerCase() ?? ""
      : "";

    let inferredAction = "cost_cutting_advice"; // safe default for trip/purchase context
    if (/repayment|instalment|installment|spread.*cost|run.*numbers/.test(lastAssistantMsg))
      inferredAction = "repayment_plan";
    else if (/recover|rebuild|restore|replenish|bounce.back|after.*trip/.test(lastAssistantMsg))
      inferredAction = "savings_recovery";
    else if (/savings.plan|save.up|top.up/.test(lastAssistantMsg))
      inferredAction = "savings_plan";
    else if (/cash.?flow|forecast/.test(lastAssistantMsg))
      inferredAction = "cashflow_forecast";
    else if (/invest|portfolio/.test(lastAssistantMsg))
      inferredAction = "investment_review";
    else if (/subscription/.test(lastAssistantMsg))
      inferredAction = "subscription_review";
    // cost_cutting_advice is the default — catches "find low-cost options", "lower the cost", etc.

    console.log(`[IntentAgent] FALLBACK confirmation (no pendingAction) → inferring "${inferredAction}" from history`);
    return {
      intent: {
        domain: "travel",
        action: "cost_optimization",
        subject:
          (state.knownFacts?.destination as string | undefined) ??
          (state.knownFacts?.subject as string | undefined),
        confidence: 0.8,
      },
      confirmedFollowUpAction: inferredAction,
      knownFacts: state.knownFacts,
    };
  }
  // ─────────────────────────────────────────────────────────────────────────

  const result = await llm.generateJSON<{
    domain: string;
    action: string;
    subject?: string;
    confidence: number;
  }>(`
You are an intent classification agent for a personal banking AI assistant.

Classify the user's request into ONE of the following intents:

DOMAIN / ACTION combinations (pick the single best match):
- travel / affordability       — can I afford a trip, holiday, flight, hotel
- travel / planning            — how to plan a trip budget
- travel / cost_optimization   — how to cut trip costs
- purchase / affordability     — can I afford a car, bike, house, phone, appliance, any purchase
- purchase / planning          — how to save up for a big purchase
- saving / planning            — savings plan, goal saving, building an emergency fund
- saving / recovery            — rebuild savings after a purchase or trip
- investing / review           — how are my investments doing, ISA performance, premium bonds
- investing / decision         — should I invest more, which fund, rebalancing
- loans / affordability        — can I take a loan, EMI affordability
- loans / repayment_planning   — repayment schedule, clear debt faster
- spending / optimization      — review subscriptions, cut spending, reduce expenses
- banking / statement          — account balance, transaction history, monthly summary, cashflow
- cashflow / forecast          — project next month's cashflow, surplus
- general / conversation       — greeting, unclear, off-topic

Rules:
- subject is optional — fill it only if clearly mentioned (e.g. "Paris trip", "Honda Civic", "ISA").
- confidence: 0.9+ for clear queries, 0.6-0.9 for partial match, below 0.6 = unsupported.
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