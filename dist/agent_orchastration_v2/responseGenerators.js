/**
 * responseGenerators.ts
 *
 * All LLM response generators for the V2 pipeline.
 * NONE of these functions make routing decisions — only text generation.
 *
 * Architectural rules:
 *  - LLM is called ONLY to generate user-facing text
 *  - Affordability verdict is computed in CODE (computeAffordabilityVerdict)
 *  - Product suggestion flag is computed in CODE (computeShouldSuggestProduct)
 *  - Every LLM prompt carries the SYSTEM_PREAMBLE for consistent agent identity
 */
// ─── System preamble ──────────────────────────────────────────────────────────
// Injected at the top of every LLM prompt to establish agent identity.
const SYSTEM_PREAMBLE = `You are a stateful Banking Reasoning Engine — not a chatbot.

Your responsibility:
- Analyze the user's financial situation using structured data
- Produce verdicts, plans, or suggestions based on real numbers
- Never hallucinate financial data
- Never market products unless data justifies it
- Be concise, analytical, and factual

Core rule: Solve the user's financial question first. Offer a product only when it fixes a real problem.
`;
// ─── History formatting ───────────────────────────────────────────────────────
const historyBlock = (turns, max = 6) => {
    const recent = turns.slice(-max);
    if (!recent.length)
        return "";
    return recent.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join("\n");
};
// ─── Goal label builder ───────────────────────────────────────────────────────
const goalLabel = (goal) => {
    const dest = goal.metadata?.destination;
    const item = goal.metadata?.item;
    switch (goal.goalType) {
        case "TRIP": return dest ? `${dest} trip` : "the trip";
        case "PURCHASE": return item ? item : "the purchase";
        case "HOUSING": return "the housing cost";
        case "LOAN": return "the loan";
        case "INVESTMENT": return "the investment";
        case "SAVINGS": return "the savings goal";
        default: return "the goal";
    }
};
// ─── 1. Affordability verdict (CODE — no LLM) ─────────────────────────────────
/**
 * Computes affordability verdict from hard numbers only.
 * Emergency buffer = 3 months of net surplus (or 20% of savings if no surplus).
 *
 * COMFORTABLE → can afford, buffer intact
 * RISKY       → can afford but buffer falls below safe threshold
 * CANNOT_AFFORD → cost exceeds savings
 */
export function computeAffordabilityVerdict(profile, goal) {
    const { availableSavings, netMonthlySurplus } = profile;
    const cost = goal.cost ?? 0;
    if (cost <= 0 || availableSavings <= 0)
        return "CANNOT_AFFORD";
    const remaining = availableSavings - cost;
    if (remaining < 0)
        return "CANNOT_AFFORD";
    const emergencyBuffer = netMonthlySurplus && netMonthlySurplus > 0
        ? netMonthlySurplus * 3
        : availableSavings * 0.2;
    if (remaining < emergencyBuffer)
        return "RISKY";
    return "COMFORTABLE";
}
// ─── 2. Product suggestion gate (CODE — no LLM) ───────────────────────────────
/**
 * Decides whether to suggest a banking product.
 *
 * Offer ONLY if at least one condition is true:
 *   - Verdict = CANNOT_AFFORD
 *   - Verdict = RISKY
 *   - User explicitly asked for options/plan/EMI/instalment
 *
 * COMFORTABLE verdict + no explicit request → should = false → plain response only.
 */
export function computeShouldSuggestProduct(verdict, userMessage) {
    if (verdict === "CANNOT_AFFORD")
        return { should: true, reason: "INSUFFICIENT_FUNDS" };
    if (verdict === "RISKY")
        return { should: true, reason: "CASHFLOW_RISK" };
    // User explicitly requested a plan/options (even when comfortable)
    if (/\b(option|plan|emi|instalment|installment|how.{0,20}manage|alternative|split|spread|payment.plan)\b/i.test(userMessage)) {
        return { should: true, reason: "USER_REQUESTED" };
    }
    return { should: false };
}
export async function classifyIntent(llm, message, history) {
    const recentHistory = historyBlock(history, 4);
    const result = await llm.generateJSON(`${SYSTEM_PREAMBLE}
Classify the user message.

INTENT OPTIONS:
- "INFO_ONLY"           — explanation, rates, definitions, eligibility
- "AFFORDABILITY_CHECK" — can I afford X? do I have enough?
- "PLANNING"            — how should I save/invest/plan?
- "COMPARISON"          — product A vs B?
- "ACTION_SUGGESTION"   — suggest a product or action

DOMAIN OPTIONS:
- "TRAVEL", "CONSUMER_PURCHASE", "HOUSING", "LOAN", "SAVINGS", "INVESTMENT", "SUBSCRIPTION", "LIFESTYLE", "GENERAL_BANKING"

REASONING LEVEL:
- "NONE"   — simple info, no calculations
- "LIGHT"  — advice without heavy calculations
- "HEAVY"  — affordability, projections, plans with numbers

${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n\n` : ""}USER MESSAGE: "${message}"

Return ONLY valid JSON (no markdown):
{ "intent": string, "domain": string, "reasoning": string }`);
    const intent = (result.intent ?? "INFO_ONLY").trim();
    const domain = (result.domain ?? "GENERAL_BANKING").trim();
    const reasoning = (result.reasoning ?? "NONE").trim();
    // Validate — fall back safely if LLM returns unexpected value
    const validIntents = ["INFO_ONLY", "AFFORDABILITY_CHECK", "PLANNING", "COMPARISON", "ACTION_SUGGESTION"];
    const validDomains = ["TRAVEL", "CONSUMER_PURCHASE", "HOUSING", "LOAN", "SAVINGS", "INVESTMENT", "SUBSCRIPTION", "LIFESTYLE", "GENERAL_BANKING"];
    const validReasoning = ["NONE", "LIGHT", "HEAVY"];
    return {
        intent: validIntents.includes(intent) ? intent : "INFO_ONLY",
        domain: validDomains.includes(domain) ? domain : "GENERAL_BANKING",
        reasoning: validReasoning.includes(reasoning) ? reasoning : "NONE",
    };
}
// ─── 4. Follow-up: ask for cost ───────────────────────────────────────────────
export async function generateCostQuestion(llm, originalQuestion, goal) {
    const context = goal?.metadata?.destination
        ? ` to ${goal.metadata.destination}`
        : goal?.metadata?.item
            ? ` for ${goal.metadata.item}`
            : "";
    return llm.generateText(`${SYSTEM_PREAMBLE}
The user asked: "${originalQuestion}"

They want to know if they can afford ${goal ? goalLabel(goal) : "something"}${context} but haven't mentioned the expected cost.
Write ONE short, natural, conversational question asking only for the total estimated cost.
No bullet points. No preamble. Just the question.`);
}
// ─── 5. Follow-up: ask for time horizon ───────────────────────────────────────
export async function generateTimeHorizonQuestion(llm, originalQuestion) {
    return llm.generateText(`${SYSTEM_PREAMBLE}
The user asked: "${originalQuestion}"

To build an accurate savings or investment plan, we need to know their time horizon.
Write ONE short, natural, conversational question asking only for the target timeframe (e.g. months or year).
No bullet points. No preamble. Just the question.`);
}
// ─── 6. Affordability answer ──────────────────────────────────────────────────
export async function generateAffordabilityAnswer(llm, profile, goal, verdict, shouldSuggestProduct, suggestionReason, history) {
    const { availableSavings, netMonthlySurplus, homeCurrency } = profile;
    const cost = goal.cost ?? 0;
    const goalCurrency = goal.currency ?? homeCurrency;
    const label = goalLabel(goal);
    const remaining = availableSavings - cost;
    const preComputed = [
        `Available savings: ${homeCurrency}${availableSavings}`,
        `Goal cost: ${goalCurrency}${cost}`,
        verdict !== "CANNOT_AFFORD"
            ? `Remaining after payment: ${homeCurrency}${remaining.toFixed(0)}`
            : `Shortfall: ${homeCurrency}${Math.abs(remaining).toFixed(0)}`,
        netMonthlySurplus && netMonthlySurplus > 0
            ? `Monthly surplus: ${homeCurrency}${netMonthlySurplus}`
            : "",
    ].filter(Boolean).join("\n");
    const verdictLabel = verdict === "COMFORTABLE" ? "✅ COMFORTABLE — can afford without risk"
        : verdict === "RISKY" ? "⚠️ RISKY — can afford but buffer falls below safe level"
            : "❌ CANNOT AFFORD — cost exceeds available savings";
    const suggestionInstruction = shouldSuggestProduct
        ? `End with ONE justified offer for a plan/instalment option, directly tied to the risk: "${suggestionReason === "INSUFFICIENT_FUNDS"
            ? "Since this exceeds your available savings, would you like me to explore a savings or EMI plan?"
            : "Since this would reduce your buffer below a safe level, want me to map out a 0% instalment plan to spread the cost?"}"`
        : `DO NOT suggest any product, loan, EMI, or savings plan. The verdict is clear — give a plain, reassuring response and stop. No offers, no upsell.`;
    const recentHistory = historyBlock(history);
    return llm.generateText(`${SYSTEM_PREAMBLE}
${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n\n` : ""}VERDICT (computed, trust it): ${verdictLabel}

PRE-COMPUTED FIGURES (use ONLY these — never recalculate):
${preComputed}

TASK: Write the affordability response for ${label}.

RULES:
1. Open with a direct verdict — do NOT start with "Yes", "Sure", "So", "Based on", or filler.
2. Include key figures: savings, cost, what's left (or shortfall).
3. If RISKY or CANNOT_AFFORD: briefly explain why it's risky (emergency buffer impact or shortfall).
4. ${suggestionInstruction}
5. Use ${homeCurrency} for the user's money. Use ${goalCurrency} for the goal cost${goalCurrency !== homeCurrency ? " — keep currencies distinct" : ""}.
6. Plain prose only. 3–4 sentences max.
7. No disclaimers, no generic advice, no filler.`);
}
// ─── 7. Plan / instalment simulation ─────────────────────────────────────────
export async function generatePlanSimulation(llm, profile, goal, verdict, history) {
    const { availableSavings, netMonthlySurplus, homeCurrency } = profile;
    const cost = goal.cost ?? 0;
    const goalCurrency = goal.currency ?? homeCurrency;
    const label = goalLabel(goal);
    // Pre-compute all plan scenarios in code — LLM only formats
    const plans = [3, 6, 12].map((months) => ({
        months,
        monthly: Math.ceil(cost / months),
    }));
    const upfrontRemaining = availableSavings - cost;
    const monthsToReplenish = netMonthlySurplus && netMonthlySurplus > 0
        ? Math.ceil(cost / netMonthlySurplus)
        : null;
    const preComputed = [
        `Goal cost: ${goalCurrency}${cost}`,
        `Current savings: ${homeCurrency}${availableSavings}`,
        `3-month plan: ${goalCurrency}${plans[0].monthly}/month (savings stay intact: ${homeCurrency}${availableSavings})`,
        `6-month plan: ${goalCurrency}${plans[1].monthly}/month (savings stay intact: ${homeCurrency}${availableSavings})`,
        `12-month plan: ${goalCurrency}${plans[2].monthly}/month (savings stay intact: ${homeCurrency}${availableSavings})`,
        `Lump-sum payment leaves: ${homeCurrency}${upfrontRemaining.toFixed(0)} in savings`,
        netMonthlySurplus && netMonthlySurplus > 0
            ? `Monthly surplus: ${homeCurrency}${netMonthlySurplus}`
            : "",
        monthsToReplenish
            ? `Months to replenish savings after lump sum: ${monthsToReplenish} months`
            : "",
    ].filter(Boolean).join("\n");
    const recentHistory = historyBlock(history);
    return llm.generateText(`${SYSTEM_PREAMBLE}
${recentHistory ? `RECENT CONVERSATION (for context only):\n${recentHistory}\n\n` : ""}The user confirmed they want the instalment/plan breakdown for ${label}.

PRE-COMPUTED FIGURES — use ONLY these exact numbers, never recalculate:
${preComputed}

VERDICT CONTEXT: ${verdict === "COMFORTABLE"
        ? "User can afford lump sum — instalment plan is optional cash-flow optimisation."
        : verdict === "RISKY"
            ? "Lump sum risks depleting the emergency buffer — instalment plan protects cash flow."
            : "User cannot afford lump sum — instalment plan is the only viable path."}

CRITICAL OUTPUT RULES:
1. Start DIRECTLY with the plan — e.g. "3-month plan: ..." or "Here are your options:".
2. DO NOT say: "Yes", "Sure", "Based on your savings", "You've got", or any affordability restatement.
3. DO NOT repeat that the user can/cannot afford it. Deliver only the plan.
4. List ALL THREE options (3, 6, 12 months) on separate lines with exact monthly amounts.
5. After listing options, add 2 sentences comparing instalment vs lump-sum on buffers/goals.
6. Use ONLY the pre-computed figures. Maximum 8 sentences total.
7. Plain prose. No markdown headers.
8. No follow-up offer at the end — the user already asked for this.`);
}
// ─── 8. Planning answer (PLANNING intent) ────────────────────────────────────
export async function generatePlanningAnswer(llm, vectorQuery, userId, question, profile, goal, history) {
    const context = await vectorQuery.getContext(userId, `savings plan investment goal: ${question}`, { topK: 6 });
    const { availableSavings, netMonthlySurplus, homeCurrency } = profile;
    const recentHistory = historyBlock(history);
    const goalSection = goal?.cost
        ? `\nGOAL: ${goalLabel(goal)} — cost ${goal.currency ?? homeCurrency}${goal.cost}${goal.timeHorizon ? `, target by ${goal.timeHorizon}` : ""}`
        : "";
    const monthsToGoal = goal?.cost && netMonthlySurplus && netMonthlySurplus > 0
        ? `Months to reach goal from surplus alone: ${Math.ceil(goal.cost / netMonthlySurplus)}`
        : "";
    return llm.generateText(`${SYSTEM_PREAMBLE}
${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n\n` : ""}USER QUESTION: "${question}"
${goalSection}

USER FINANCIAL PROFILE:
Available savings: ${homeCurrency}${availableSavings}
${netMonthlySurplus ? `Monthly surplus: ${homeCurrency}${netMonthlySurplus}` : ""}
${monthsToGoal}

RETRIEVED CONTEXT:
${context || "No additional context."}

TASK: Build a clear, data-backed financial plan.

RULES:
1. Use real figures only — no invented numbers.
2. State the timeline clearly if computable from surplus.
3. Mention 1–2 concrete actions (e.g. increase standing order, open LISA/ISA).
4. Suggest a product ONLY if it directly improves the outcome — justify it in one sentence.
5. Plain prose. 4–5 sentences max. No disclaimers.`);
}
// ─── 9. Info-only answer (INFO_ONLY / LIGHT intent) ──────────────────────────
export async function generateInfoAnswer(llm, vectorQuery, userId, question, profile, history) {
    const context = await vectorQuery.getContext(userId, question, { topK: 5 });
    const recentHistory = historyBlock(history);
    return llm.generateText(`${SYSTEM_PREAMBLE}
${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n\n` : ""}USER QUESTION: "${question}"

USER HOME CURRENCY: ${profile.homeCurrency}

RETRIEVED CONTEXT:
${context || "No additional context."}

TASK: Answer the question clearly and directly.

RULES:
1. Pure information only — no product suggestions unless explicitly asked.
2. Use plain language — no jargon, no disclaimers.
3. 2–3 sentences max.
4. If rates/limits are mentioned, note figures are illustrative (no real-time data).`);
}
// ─── 10. Comparison answer ────────────────────────────────────────────────────
export async function generateComparisonAnswer(llm, vectorQuery, userId, question, profile, history) {
    const context = await vectorQuery.getContext(userId, `comparison financial options: ${question}`, { topK: 6 });
    const recentHistory = historyBlock(history);
    return llm.generateText(`${SYSTEM_PREAMBLE}
${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n\n` : ""}USER QUESTION: "${question}"

USER PROFILE:
Savings: ${profile.homeCurrency}${profile.availableSavings}
${profile.netMonthlySurplus ? `Monthly surplus: ${profile.homeCurrency}${profile.netMonthlySurplus}` : ""}

RETRIEVED CONTEXT:
${context || "No additional context."}

TASK: Compare the options clearly.

RULES:
1. Name each option and state its key trade-offs in one sentence each.
2. Give a clear recommendation based on the user's profile data.
3. Justify the recommendation with one data point.
4. No marketing language. Plain prose. 5 sentences max.`);
}
// ─── 11. General / fallback answer ───────────────────────────────────────────
export async function generateGeneralAnswer(llm, vectorQuery, userId, question, profile, history) {
    const context = await vectorQuery.getContext(userId, `financial data: ${question}`, { topK: 8 });
    const { homeCurrency, availableSavings, monthlyIncome, monthlyExpenses, netMonthlySurplus } = profile;
    const recentHistory = historyBlock(history);
    const profileSummary = [
        `Savings: ${homeCurrency}${availableSavings}`,
        monthlyIncome ? `Monthly income: ${homeCurrency}${monthlyIncome}` : "",
        monthlyExpenses ? `Monthly expenses: ${homeCurrency}${monthlyExpenses}` : "",
        netMonthlySurplus ? `Monthly surplus: ${homeCurrency}${netMonthlySurplus}` : "",
    ].filter(Boolean).join("\n");
    return llm.generateText(`${SYSTEM_PREAMBLE}
${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n\n` : ""}USER QUESTION: "${question}"

USER FINANCIAL PROFILE:
${profileSummary}

RETRIEVED CONTEXT:
${context || "No additional context."}

RULES:
1. Answer directly and specifically using the data above.
2. Use ${homeCurrency} for user's money throughout.
3. Plain prose, 3–5 sentences max.
4. End with ONE follow-up offer if genuinely relevant.
5. No disclaimers. No generic finance advice.`);
}
