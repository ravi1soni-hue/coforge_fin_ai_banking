export const reasoningAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    const reasoning = await llm.generateJSON(`
You are a financial reasoning agent.

User finance:
${JSON.stringify(state.financeData)}

Goal cost:
${JSON.stringify(state.researchData)}

Evaluate affordability strictly.

Return JSON ONLY.
`);
    return {
        ...state,
        reasoning,
    };
};
