/**
 * Synthesis Agent — final response generation.
 *
 * Takes the full financial graph state and produces a clear,
 * simple, human-readable response for the user.
 */
const SYSTEM_PROMPT = `
You explain money clearly and simply, like a normal person.
You are not a banker, not giving legal advice, and not writing a report.

Tone and language:
- Use very simple, natural words.
- Calm, friendly, and neutral. No role‑play.
- Short sentences are fine.
- Use phrases like “to be honest”, “the good news is”, “this should be manageable”, “this might feel a bit tight”.

Numbers:
- Always explain numbers in plain language.
- Don’t just state figures — explain what they mean in everyday terms.
- Example: instead of just “£1,200”, say “£1,200 in total — roughly what you’d spend over a month or two”.

UK data:
- Use UK prices and £ for money.
- Use UK‑style formatting and realistic context.
- Do not act like a UK bank or advisor — just use UK data.

Affordability:
- Be clear and honest.
- Say plainly whether it fits the budget or feels a bit tight.
- Avoid labels like SAFE, RISKY, or BORDERLINE.
- When you see MANDATORY OPENING in the financial data, you MUST start your reply with the four numbers (income, expenses, leftover, savings) before anything else. No exceptions.
- When you see "INSTRUCTION: ... was ALREADY shown", do NOT repeat those numbers. Continue the conversation naturally.
- Use savings as supporting context only when it adds new information.
- Help the user see *why* something works (or doesn't) using real numbers.

Topic discipline:
- The financial data you receive includes a SUBJECT field — always answer ONLY about that subject.
- NEVER switch the subject to a different product or item. If the conversation is about a trip, discuss the trip. If it is about a phone, discuss the phone.
- If a product name appears in the financial data that does NOT match the current conversation topic, ignore it completely.

EMI / instalment plans:
- When instalments are relevant, present them as a proper plan.
- Always show 3, 6, and 12‑month options.
- Each plan must clearly state total cost, monthly amount, and duration.
- Explain instalments naturally, like a person would.

User intent:
- When the user says something positive ("yes", "priority", "I want it", "go for it", "I'm happy to") — acknowledge it warmly and give them a clear recommended path. Do NOT ask an open question back.
- When the user says something like "I can wait", "maybe later", "let me think", "I'll save up" — acknowledge it calmly, tell them what saving up towards the goal looks like, and close positively. Do NOT push them to buy.
- Read the user's intent clearly and respond to it directly.

Conversation rules:
- Don't repeat earlier explanations.
- Continue naturally from the last message.
- Avoid bullet points unless you're laying out options or plans.
- Keep it under 180 words unless more detail is clearly needed.
- Don't say "I don't have that information".
- Ask at most one follow‑up question, only if it genuinely helps — do NOT ask a question if the user has already stated their intent clearly.

Treasury payment-run rules:
- If TREASURY ANALYSIS is present, anchor your answer on those numbers and use them explicitly.
- If riskLevel is CAUTION or HIGH_RISK, suggest a two-batch release using the suggested amounts.
- If the user asks to execute/schedule, do not claim execution is complete unless EXECUTION_STATUS is explicitly provided in financial data.
- Prefer wording like "I can prepare this plan" or "ready to submit" when execution status is not provided.
`;
function buildDataContext(state) {
    const parts = [];
    const homeCurrency = state.userProfile?.homeCurrency ??
        state.plan?.userHomeCurrency ??
        "GBP";
    // Count prior assistant turns — reliable, no text-matching
    const priorAssistantTurns = (state.conversationHistory ?? []).filter((m) => m.role === "assistant").length;
    // --- User financial profile ---
    if (state.userProfile) {
        const up = state.userProfile;
        parts.push(`USER FINANCIAL PROFILE:`, up.monthlyIncome != null
            ? `- Monthly income: ${up.monthlyIncome.toLocaleString("en-GB")} ${homeCurrency}`
            : `- Monthly income: Unknown`, up.monthlyExpenses != null
            ? `- Monthly expenses: ${up.monthlyExpenses.toLocaleString("en-GB")} ${homeCurrency}`
            : `- Monthly expenses: Unknown`, `- Available savings: ${up.availableSavings.toLocaleString("en-GB")} ${homeCurrency}`);
        if (up.monthlyIncome != null && up.monthlyExpenses != null) {
            const leftover = up.monthlyIncome - up.monthlyExpenses;
            parts.push(`- Left after expenses: ${leftover.toLocaleString("en-GB")} ${homeCurrency}`);
        }
        if (priorAssistantTurns === 0) {
            // First reply — REQUIRE the financial snapshot to be shown explicitly
            parts.push(`MANDATORY OPENING: This is the FIRST affordability response. You MUST begin your reply with a short financial snapshot that states ALL of these numbers on their own line or sentence, in this order:`, `  1. Monthly income (e.g. "You bring in £4,200 a month")`, `  2. Monthly expenses (e.g. "your regular spending comes to about £3,700")`, `  3. Monthly leftover (e.g. "leaving you £500 each month")`, `  4. Savings (e.g. "and you have £5,800 saved up")`, `After showing these four numbers, THEN give the affordability analysis about the subject below.`);
        }
        else {
            // Follow-up — do NOT repeat the snapshot
            parts.push(`INSTRUCTION: The income/expenses/savings breakdown was ALREADY shown in this conversation. Do NOT repeat it. Continue directly from where the conversation left off.`);
        }
    }
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
    // --- Affordability ---
    if (state.affordabilityInfo) {
        const af = state.affordabilityInfo;
        parts.push(`AFFORDABILITY NOTES:`, af.analysis, `PRICE IN ${homeCurrency}: ${af.priceInHomeCurrency.toLocaleString("en-GB")} ${homeCurrency}`);
        if (af.emiSuggested || state.plan?.needsEmi) {
            const price = af.priceInHomeCurrency;
            parts.push(`EMI OPTIONS (${homeCurrency}):`, `- 3 months: ${Math.round(price / 3).toLocaleString("en-GB")} ${homeCurrency} per month`, `- 6 months: ${Math.round(price / 6).toLocaleString("en-GB")} ${homeCurrency} per month`, `- 12 months: ${Math.round(price / 12).toLocaleString("en-GB")} ${homeCurrency} per month`);
        }
    }
    // --- Treasury payment-run analysis ---
    if (state.treasuryAnalysis) {
        const t = state.treasuryAnalysis;
        parts.push(`TREASURY ANALYSIS:`, `- Available liquidity: ${t.availableLiquidity.toLocaleString("en-GB")} ${t.currency}`, `- Weekly outflow baseline: ${t.weeklyOutflow.toLocaleString("en-GB")} ${t.currency}`, `- Expected midweek inflow: ${t.expectedMidweekInflow.toLocaleString("en-GB")} ${t.currency}`, `- Late inflow events (last 4 weeks): ${t.lateInflowEventsLast4Weeks}`, `- Comfort threshold: ${t.comfortThreshold.toLocaleString("en-GB")} ${t.currency}`, `- Proposed payment: ${t.paymentAmount.toLocaleString("en-GB")} ${t.currency}`, `- Projected low balance: ${t.projectedLowBalance.toLocaleString("en-GB")} ${t.currency}`, `- Risk level: ${t.riskLevel}`, `- Suggested split now/later: ${t.suggestedNowAmount.toLocaleString("en-GB")} / ${t.suggestedLaterAmount.toLocaleString("en-GB")} ${t.currency}`, `- Analysis rationale: ${t.rationale}`);
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
