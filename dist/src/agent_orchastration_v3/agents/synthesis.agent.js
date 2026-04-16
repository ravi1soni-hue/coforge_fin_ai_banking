async function extractScenarioStateLLM(conversationHistory, treasuryAnalysis, llmClient) {
    // Compose a prompt for the LLM to extract scenario state
    const prompt = `You are an agentic treasury assistant. Given the following conversation history, extract the current scenario state as a JSON object with these fields:
  - userChoseSplit (boolean)
  - userChoseFullRelease (boolean)
  - userRequestedSimulation (boolean)
  - userConfirmedSchedule (boolean) // true if the user has confirmed or requested to schedule, in any wording
  - lastSplitAmount (number|null)
  - lastDeferAmount (number|null)
  - lastUrgentAmount (number|null)
  - lastUserMessage (string)
  Respond ONLY with a valid JSON object.

Conversation history:
${conversationHistory.map(t => `${t.role}: ${t.content}`).join("\n")}
`;
    const response = await llmClient.chat([
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt }
    ]);
    try {
        const scenario = JSON.parse(response);
        // If user specified an amount, ensure all scenario fields use only that amount
        if (treasuryAnalysis?.usedUserAmount && treasuryAnalysis.paymentAmount > 0) {
            scenario.lastSplitAmount = treasuryAnalysis.paymentAmount;
            scenario.lastDeferAmount = 0;
            scenario.lastUrgentAmount = null;
        }
        else {
            // Fallback to treasuryAnalysis if needed
            if (!scenario.lastSplitAmount && treasuryAnalysis?.suggestedNowAmount)
                scenario.lastSplitAmount = treasuryAnalysis.suggestedNowAmount;
            if (!scenario.lastDeferAmount && treasuryAnalysis?.suggestedLaterAmount)
                scenario.lastDeferAmount = treasuryAnalysis.suggestedLaterAmount;
        }
        // Ensure userConfirmedSchedule is always present
        if (typeof scenario.userConfirmedSchedule !== "boolean")
            scenario.userConfirmedSchedule = false;
        return scenario;
    }
    catch {
        // Fallback: return empty/default scenario
        return {
            userChoseSplit: false,
            userChoseFullRelease: false,
            userRequestedSimulation: false,
            userConfirmedSchedule: false,
            lastSplitAmount: treasuryAnalysis?.usedUserAmount && treasuryAnalysis.paymentAmount > 0
                ? treasuryAnalysis.paymentAmount
                : treasuryAnalysis?.suggestedNowAmount ?? null,
            lastDeferAmount: treasuryAnalysis?.usedUserAmount && treasuryAnalysis.paymentAmount > 0
                ? 0
                : treasuryAnalysis?.suggestedLaterAmount ?? null,
            lastUrgentAmount: null,
            lastUserMessage: conversationHistory.filter(t => t.role === "user").slice(-1)[0]?.content || ""
        };
    }
}
const SYSTEM_PROMPT = `
You are a senior corporate banking treasury advisor. Respond to the user’s question about payment runs, cashflow, and treasury risk as if you are having a real conversation with a corporate client—never as a bot or machine.

Requirements:
- Write a single, natural conversational paragraph (no bullet points, no lists, no itemized breakdowns, no headings).
- Do not use any risk flags, labels, or formulaic phrases (never say SAFE, DANGER, EASY, “the risk level is”, “here’s why”, or “this assessment is based on”).
- Weave together all key financial details: available cash, recent and upcoming inflows, outflows, upcoming payments (like payroll), any late or early receipts, and the comfort threshold, so the client understands the real situation.
- All numbers and calculations must be strictly anchored to the user’s requested amount and the scenario data provided—never invent or hallucinate numbers.
- Always mention both the option to release the full payment run and the option to split it, even if the full release is safe, and explain the implications of each in a conversational way so the user can make an informed choice.
- Use a warm, human, banking-professional tone, as if you are explaining your reasoning to a peer or client in a meeting.
- Never repeat the user’s question verbatim.
- End with a natural offer to help or next step, not a formulaic question.

You will be given structured scenario data as JSON. Use only the data provided. Respond as a real banking professional would in a conversation, not as a machine or chatbot.
`;
// Async version: buildDataContext with LLM-driven scenario extraction
export async function buildDataContextAsync(state, llmClient) {
    // Build a structured context for the LLM
    // Remove DB total from context if user specified amount
    const scenario = state.treasuryAnalysis
        ? await extractScenarioStateLLM(state.conversationHistory ?? [], state.treasuryAnalysis, llmClient)
        : null;
    const context = {
        plan: state.plan,
        priceInfo: state.priceInfo,
        fxInfo: state.fxInfo,
        treasuryAnalysis: {
            ...state.treasuryAnalysis,
            // If user specified an amount, override all scenario amounts with it
            ...(state.treasuryAnalysis?.usedUserAmount && state.treasuryAnalysis.paymentAmount > 0
                ? {
                    suggestedNowAmount: state.treasuryAnalysis.paymentAmount,
                    suggestedLaterAmount: 0,
                    urgentSupplierTotal: null,
                    deferableSupplierTotal: null
                }
                : {})
        },
        scenario,
        knownFacts: state.knownFacts,
        userProfile: state.userProfile,
        conversationHistory: state.conversationHistory,
        userMessage: state.userMessage
    };
    return JSON.stringify(context, null, 2);
}
export async function runSynthesisAgent(llmClient, state) {
    const dataContext = await buildDataContextAsync(state, llmClient);
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
