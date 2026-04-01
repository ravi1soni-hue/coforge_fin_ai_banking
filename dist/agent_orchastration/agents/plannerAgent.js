export const plannerAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    // No-follow-up mode: always proceed with available context.
    if (!state.intent || state.intent.confidence < 0.5) {
        return {
            missingFacts: [],
        };
    }
    const lowerQuestion = state.question.toLowerCase();
    const action = state.intent.action.toLowerCase();
    const knownFacts = state.knownFacts ?? {};
    const hasAffordabilityContext = knownFacts.queryType === "affordability" ||
        "targetAmount" in knownFacts ||
        "budget" in knownFacts ||
        "goalType" in knownFacts ||
        "destination" in knownFacts;
    const isAffordability = /afford|affordability|buy|purchase|plan|decision/.test(action) ||
        /\bcan i afford\b|\bnext month\b/.test(lowerQuestion) ||
        hasAffordabilityContext;
    const isSubscriptions = /subscription/.test(lowerQuestion);
    const isInvestmentPerformance = /investment/.test(lowerQuestion) && /profit|return|gain|loss/.test(lowerQuestion);
    const isStatement = /bank statement|statement/.test(lowerQuestion);
    if (isSubscriptions || isInvestmentPerformance || isStatement || isAffordability) {
        return {
            missingFacts: [],
        };
    }
    return {
        missingFacts: [],
    };
};
