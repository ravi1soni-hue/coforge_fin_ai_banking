export const followUpQuestionAgent = async (state, config) => {
    if (!state.missingFacts || state.missingFacts.length === 0) {
        return {};
    }
    const llm = config.configurable?.llm;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    const followUpQuestion = await llm.generateText(`
You are a helpful banking assistant. A user sent the following message:
"${state.question}"

From their message, we already know:
${JSON.stringify(state.knownFacts, null, 2)}

However, to give them a precise financial answer we still need:
${state.missingFacts.join(", ")}

Write a single, natural, friendly follow-up question that asks ONLY for the genuinely missing information.

RULES:
- Do NOT ask for anything that is already present in the user's message or known facts above.
- Be concise — one sentence only.
- Be conversational, not robotic.
- Do NOT use bullet points or lists.
- Do NOT repeat the user's question back to them.
`);
    return {
        finalAnswer: followUpQuestion.trim(),
    };
};
