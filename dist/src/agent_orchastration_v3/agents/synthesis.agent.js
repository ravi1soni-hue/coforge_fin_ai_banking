/**
 * Synthesis Agent — final response generation.
 *
 * Takes the full financial graph state and produces a clear,
 * simple, human-readable response for the user.
 */
const SYSTEM_PROMPT = `
You are a treasury/corporate cashflow assistant. Only answer corporate/treasury payment-run and liquidity questions.

Rules:
- Use only the treasury analysis data provided.
- Explain cashflow, payment, and liquidity decisions in clear, conversational UK English.
- If riskLevel is CAUTION or HIGH_RISK, suggest a two-batch release using the suggested amounts, and explain why simply.
- If the user asks to execute or schedule, do not claim execution is complete unless EXECUTION_STATUS is explicitly provided.
- Always mention that the analysis is based on real bank transaction behaviour (cashflow, supplier, and snapshot data), but do so conversationally.
// Never mention savings, retail, or personal context. (removed retail/personal context)
- Do not generate EMI, instalment, or product purchase plans.
- Do not answer non-corporate/treasury questions.
- Keep the tone friendly, clear, and neutral.
`;
function buildDataContext(state) {
    const parts = [];
    const isTreasuryFlow = Boolean(state.treasuryAnalysis);
    const homeCurrency = state.userProfile?.homeCurrency ??
        state.plan?.userHomeCurrency ??
        "GBP";
    // Count prior assistant turns — reliable, no text-matching
    const priorAssistantTurns = (state.conversationHistory ?? []).filter((m) => m.role === "assistant").length;
    // --- User financial profile ---
    // ...existing code...
    // --- Conversation subject (MUST appear first so LLM knows the topic) ---
    if (state.plan?.product) {
        parts.push(`SUBJECT: ${state.plan.product}`);
        parts.push(`(Answer ONLY about "${state.plan.product}" — do not mention any other product)`);
    }
    // --- Price info ---
    if (state.priceInfo && state.priceInfo.price > 0) {
        parts.push(`PRICE: ${state.plan?.product ?? "Item"} = ${state.priceInfo.price.toLocaleString("en-GB")} ${state.priceInfo.currency} (source: ${state.priceInfo.source})`);
    }
    else if (state.priceInfo && state.priceInfo.price === 0) {
        parts.push(`PRICE: No verified price found. Ask the user to confirm the amount instead of estimating.`);
    }
    // --- FX info ---
    if (state.fxInfo) {
        parts.push(`EXCHANGE RATE: 1 ${state.fxInfo.from} = ${state.fxInfo.rate.toFixed(4)} ${state.fxInfo.to}`);
        if (state.priceInfo && state.priceInfo.price > 0) {
            const converted = state.priceInfo.price * state.fxInfo.rate;
            parts.push(`CONVERTED PRICE: ${converted.toFixed(2)} ${state.fxInfo.to}`);
        }
    }
    // ...existing code...
    // --- Treasury/corporate conversational context ---
    if (state.treasuryAnalysis) {
        const t = state.treasuryAnalysis;
        let treasurySummary = `Here's where things stand for your upcoming payments. Right now, you have about ${t.availableLiquidity.toLocaleString("en-GB")} ${t.currency} available. On a typical week, you see about ${t.weeklyOutflow.toLocaleString("en-GB")} ${t.currency} going out, and you usually expect around ${t.expectedMidweekInflow.toLocaleString("en-GB")} ${t.currency} to come in midweek.`;
        if (t.lateInflowEventsLast4Weeks > 0) {
            treasurySummary += ` There have been ${t.lateInflowEventsLast4Weeks} late inflow events in the last month, so timing can be a bit unpredictable.`;
        }
        treasurySummary += ` The comfort threshold for your accounts is set at ${t.comfortThreshold.toLocaleString("en-GB")} ${t.currency}. The payment you're considering is ${t.paymentAmount.toLocaleString("en-GB")} ${t.currency}. Of that, about ${t.urgentSupplierTotal.toLocaleString("en-GB")} ${t.currency} is for urgent suppliers, and ${t.deferableSupplierTotal.toLocaleString("en-GB")} ${t.currency} could be deferred if needed.`;
        treasurySummary += ` If you paid everything now, your lowest projected balance would be ${t.projectedLowBalanceIfFullRelease.toLocaleString("en-GB")} ${t.currency}. If you split the payment, the lowest point would be closer to ${t.projectedLowBalanceIfSplit.toLocaleString("en-GB")} ${t.currency}.`;
        // Add scenario/simulation options
        const projectedLowIfLate = typeof t.projectedLowIfLateInflow === 'number' ? t.projectedLowIfLateInflow.toLocaleString("en-GB") : "N/A";
        const projectedLowIfEarly = typeof t.projectedLowIfEarlyInflow === 'number' ? t.projectedLowIfEarlyInflow.toLocaleString("en-GB") : "N/A";
        treasurySummary += `\n\nSimulation: If midweek inflows are late, your lowest projected balance could drop to ${projectedLowIfLate} ${t.currency}. If inflows arrive early, it could be as high as ${projectedLowIfEarly} ${t.currency}.`;
        if (t.riskLevel === "CAUTION" || t.riskLevel === "HIGH_RISK") {
            treasurySummary += `\n\nOptions:\n- Split the payment: send about ${t.suggestedNowAmount.toLocaleString("en-GB")} ${t.currency} now, and hold back ${t.suggestedLaterAmount.toLocaleString("en-GB")} ${t.currency} for later in the week, once more money comes in.\n- Simulate what happens if inflows are delayed or early.\n- Set up auto-release for the second batch if cash arrives as expected.`;
        }
        else {
            treasurySummary += `\n\nOptions:\n- Proceed with a full release (likely manageable).\n- Split the payment for extra headroom.\n- Simulate what happens if inflows are delayed or early.\n- Set up auto-release for the second batch if cash arrives as expected.`;
        }
        treasurySummary += `\n\nThis analysis is based on how money has actually moved through your accounts recently—cashflow, supplier payments, and your latest bank snapshots.`;
        // Surface audit trail and approval flow
        treasurySummary += `\n\nAll actions are logged for audit and treasury approval. You will receive alerts for any scheduled or conditional releases, and approval is always required for final execution.`;
        treasurySummary += `\n\n${t.rationale}`;
        parts.push(treasurySummary);
    }
    const execStatusRaw = (state.knownFacts?.executionStatus ?? state.knownFacts?.treasuryExecutionStatus ?? null);
    if (typeof execStatusRaw === "string" && execStatusRaw.trim()) {
        parts.push(`EXECUTION_STATUS: ${execStatusRaw.trim()}`);
    }
    return parts.join("\n");
}
export async function runSynthesisAgent(llmClient, state) {
    const dataContext = buildDataContext(state);
    const historyText = state.conversationHistory && state.conversationHistory.length > 0
        ? "\n\nConversation history (most recent last):\n" +
            state.conversationHistory
                .slice(-6)
                .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 400)}`)
                .join("\n")
        : "";
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
            role: "user",
            content: `${historyText}

Current message: "${state.userMessage}"

Financial data:
${dataContext}

Write a clear, natural response using this information.`,
        },
    ];
    const finalText = await llmClient.chat(messages);
    return finalText.trim()
        ? finalText
        : "Sorry — I couldn’t generate a response just now. Please try again.";
}
