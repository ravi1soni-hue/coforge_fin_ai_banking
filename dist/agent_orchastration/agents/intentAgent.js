export const intentAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    // ── Short-circuit: user is confirming a pending follow-up offer ──────────
    // e.g. "Yes do it" / "Sure" / "Go ahead" after we offered a savings plan.
    const pendingAction = state.knownFacts?.pendingFollowUpAction;
    const isConfirmation = /^\s*(yes|yeah|yep|sure|ok|okay|go ahead|do it|sounds good|proceed|please|absolutely|let's|let me know|continue)\b/i.test(state.question.trim());
    if (isConfirmation && pendingAction) {
        // Map the stored tag to a meaningful intent so downstream agents don't
        // re-run the previous analysis.
        const pendingIntentMap = {
            savings_plan: { domain: "saving", action: "planning" },
            cashflow_forecast: { domain: "cashflow", action: "forecast" },
            investment_review: { domain: "investing", action: "review" },
            subscription_review: { domain: "spending", action: "optimization" },
            statement_summary: { domain: "banking", action: "statement" },
            goal_planning: { domain: "saving", action: "planning" },
            general_planning: { domain: "general", action: "planning" },
        };
        const mapped = pendingIntentMap[pendingAction] ?? { domain: "general", action: "planning" };
        return {
            intent: {
                domain: mapped.domain,
                action: mapped.action,
                subject: state.knownFacts?.subject ??
                    state.knownFacts?.destination,
                confidence: 0.95,
            },
            // Clear the flag so subsequent turns don't re-trigger this path.
            knownFacts: { ...state.knownFacts, pendingFollowUpAction: undefined },
        };
    }
    // ─────────────────────────────────────────────────────────────────────────
    const result = await llm.generateJSON(`
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
