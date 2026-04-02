export const plannerAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    // If intent is unclear, ask user to clarify
    if (!state.intent || state.intent.confidence < 0.5) {
        return {
            missingFacts: ["clarify_intent"],
        };
    }
    const result = await llm.generateJSON(`
You are a planning agent for a financial reasoning system.

User intent:
${JSON.stringify(state.intent)}

Already known information:
${JSON.stringify(state.knownFacts)}

Task:
- Identify what additional information is REQUIRED
  to answer the user's question correctly.
- Use short, generic field names.
- Do not invent facts.
- If nothing is required, return an empty array.
- This is NOT execution planning.

Return ONLY valid JSON:
{
  "requiredFacts": string[]
}
`);
    const missingFacts = result.requiredFacts.filter(fact => !(fact in state.knownFacts));
    return {
        missingFacts,
    };
};
