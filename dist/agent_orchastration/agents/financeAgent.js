const ALLOWED_FINANCIAL_FACETS = [
    "income",
    "expenses",
    "savings",
    "loans",
    "credit",
    "investments",
    "assets",
    "liabilities",
    "subscriptions",
    "cashflow_summary",
];
export const financeAgent = async (state, config) => {
    const llm = config.configurable?.llm;
    const vectorQueryService = config.configurable?.vectorQueryService;
    if (!llm) {
        throw new Error("LlmClient not provided to graph");
    }
    if (!vectorQueryService) {
        throw new Error("VectorQueryService not provided to graph");
    }
    // ✅ Step 1: Decide what financial data is needed
    const facetDecision = await llm.generateJSON(`
You are a financial data planning agent.

User intent:
${JSON.stringify(state.intent)}

User question:
"${state.question}"

Task:
Decide which financial data facets are REQUIRED to answer the user's question.

Allowed facets:
${JSON.stringify(ALLOWED_FINANCIAL_FACETS)}

Rules:
- Choose only from the allowed list.
- Return the MINIMAL required set.
- If the question is generic, return ["cashflow_summary"].
- Return ONLY valid JSON.

Return format:
{
  "requiredFacets": string[]
}
`);
    // ✅ Validate against allowed facets
    const facetsToExtract = facetDecision.requiredFacets.filter((f) => ALLOWED_FINANCIAL_FACETS.includes(f)) ?? ["cashflow_summary"];
    // ✅ Step 2: Fetch RAG financial context
    const context = await vectorQueryService.getContext(`complete financial data for user ${state.userId}`, { topK: 8 });
    // ✅ Step 3: Extract only the required facets
    const financeData = await llm.generateJSON(`
Extract ONLY the specified financial facets from the context below.

Requested facets:
${JSON.stringify(facetsToExtract)}

Context:
${context}

Rules:
- Do NOT invent values.
- If a facet is missing, return null.
- Keep structure simple.

Return ONLY valid JSON in this shape:
{
${facetsToExtract.map(f => `  "${f}": object | number | null`).join(",\n")}
}
`);
    return {
        financeData,
    };
};
