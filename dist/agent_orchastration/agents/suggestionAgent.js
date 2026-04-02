export const suggestionAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    const topProduct = Array.isArray(state.productRecommendations) && state.productRecommendations.length > 0
        ? [...state.productRecommendations].sort((a, b) => (b.suitabilityScore ?? 0) - (a.suitabilityScore ?? 0))[0]
        : null;
    const productHint = topProduct
        ? `Recommended product: ${topProduct.productName} — ${topProduct.rationale} (next step: ${topProduct.nextStep})`
        : "No specific product identified.";
    const suggestion = await llm.generateText(`
You are a financial advisor deciding whether to provide an actionable suggestion to a banking customer.

USER QUESTION: "${state.question}"
USER INTENT: ${JSON.stringify(state.intent, null, 2)}
FINANCIAL DATA: ${JSON.stringify(state.financeData, null, 2)}
FINANCIAL REASONING: ${JSON.stringify(state.reasoning ?? {}, null, 2)}
RECOMMENDED BANKING PRODUCT: ${productHint}

DECISION RULES:
1. Reply "NO_SUGGESTION" if:
   - The user is simply asking for information (balance, investments, statement, subscriptions).
   - There is no financial risk or planning context.
   - The user can comfortably afford the goal with plenty of buffer.
2. Otherwise, provide one concrete, actionable suggestion (1-3 sentences) tied to the user's situation.
3. If there is a shortfall or negative cashflow, provide exactly TWO options:
   - Option 1: a practical spending or timing adjustment the user can act on immediately.
   - Option 2: reference the recommended banking product as a support path (non-salesy).
   Format: "Option 1: [text]. Option 2: [text]."
4. Be supportive and professional. Avoid judgmental or blunt phrasing.
5. Do NOT repeat the main answer or re-state the verdict.

Respond with the suggestion text or "NO_SUGGESTION".
`);
    const isSuggestionEmpty = suggestion.trim() === "NO_SUGGESTION" || suggestion.trim() === "";
    return {
        suggestion: isSuggestionEmpty ? undefined : suggestion.trim(),
        isSuggestionIncluded: !isSuggestionEmpty,
    };
};
