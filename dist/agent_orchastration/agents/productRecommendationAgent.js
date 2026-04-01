import { PRODUCT_CATALOG } from "./productCatalog.js";
// Summarise each catalog entry into a compact block the LLM can reason over
const buildCatalogBlock = () => PRODUCT_CATALOG.map((p) => `[${p.code}] ${p.name} (${p.category}, risk: ${p.riskLevel})\n` +
    `  Tagline: ${p.tagline}\n` +
    `  Best for: ${p.bestFor.join("; ")}\n` +
    `  NOT for: ${p.notFor.join("; ")}\n` +
    `  Key benefit: ${p.keyBenefit}\n` +
    `  Conditions: ${p.typicalConditions}\n` +
    `  Eligibility: ${p.eligibilitySummary}`).join("\n\n");
export const productRecommendationAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    // Extract key signals to help the LLM rank products
    const cashflow = (state.financeData?.cashflow_summary ?? {});
    const netMonthlySavings = typeof cashflow.netMonthlySavings === "number" ? cashflow.netMonthlySavings : undefined;
    const monthlyIncome = typeof cashflow.monthlyIncome === "number" ? cashflow.monthlyIncome : undefined;
    const goalType = typeof state.knownFacts?.goalType === "string" ? state.knownFacts.goalType : "unknown";
    const queryType = typeof state.knownFacts?.queryType === "string" ? state.knownFacts.queryType : "unknown";
    const intentAction = typeof state.intent?.action === "string" ? state.intent.action : "unknown";
    const reasoning = (state.reasoning ?? {});
    const affordable = reasoning.affordable;
    const affordableNextMonth = reasoning.affordableNextMonth;
    const shortfall = typeof reasoning.shortfallAmount === "number" && reasoning.shortfallAmount > 0
        ? reasoning.shortfallAmount
        : undefined;
    const contextSummary = [
        `Goal type: ${goalType}`,
        `Query type: ${queryType}`,
        `Intent action: ${intentAction}`,
        netMonthlySavings !== undefined ? `Net monthly cashflow: ${netMonthlySavings}` : null,
        monthlyIncome !== undefined ? `Monthly income: ${monthlyIncome}` : null,
        affordable !== undefined ? `Affordable (LLM): ${affordable}` : null,
        affordableNextMonth !== undefined ? `Affordable next month (LLM): ${affordableNextMonth}` : null,
        shortfall !== undefined ? `Shortfall amount: ${shortfall}` : null,
    ]
        .filter(Boolean)
        .join("\n");
    const result = await llm.generateJSON(`
You are an intelligent banking product recommendation agent.

Your job is to read the full banking product catalog below and select the 1 best-fit product
for this user based on their real financial context. You must reason over the catalog — do not
make up product codes that are not in the list.

════════════════════════════════════════
USER FINANCIAL CONTEXT
════════════════════════════════════════
${contextSummary}

Full intent:
${JSON.stringify(state.intent, null, 2)}

Finance profile:
${JSON.stringify(state.financeData, null, 2)}

Research / plan details:
${JSON.stringify(state.researchData, null, 2)}

Reasoning summary:
${JSON.stringify(state.reasoning, null, 2)}

════════════════════════════════════════
PRODUCT CATALOG (reason over all entries)
════════════════════════════════════════
${buildCatalogBlock()}

════════════════════════════════════════
SELECTION RULES
════════════════════════════════════════
1. Pick the single most suitable product by matching user context against "Best for" and "NOT for" fields.
2. NEVER recommend a product listed under "NOT for" conditions that match the user's situation.
3. If net monthly cashflow is negative, do NOT recommend any loan or high-risk credit card as a primary pick — prefer budget_planner, installment_card_0apr, or low_apr_credit_card.
4. If the goal is a property purchase, prefer home_loan.
5. If the goal is a car, prefer car_loan.
6. If the goal is electronics or a trip and cashflow is under pressure, prefer installment_card_0apr or budget_planner.
7. If the user has no clear purchase goal and just has savings capacity, prefer savings_goal or sip.
8. suitabilityScore must be 0–1. Only score above 0.7 if the match is strong and clear.
9. nextStep must be a single actionable sentence a customer can follow immediately.
10. rationale must be concise (1 sentence), human-friendly, and clearly explain WHY this product fits.
11. If no product is genuinely suitable, return an empty "recommendations" array.
12. Return ONLY valid JSON.

Return:
{
  "recommendations": [
    {
      "productCode": string,
      "productName": string,
      "rationale": string,
      "suitabilityScore": number,
      "nextStep": string
    }
  ]
}
`);
    return {
        productRecommendations: Array.isArray(result.recommendations)
            ? result.recommendations
            : [],
    };
};
