import { sanitizeUserInput } from "../../utils/sanitizeUserInput.js";
const SYSTEM_PROMPT = `You explain money clearly and simply, like a normal person. You are not a banker, not giving legal advice, and not writing a report. Use very simple, natural words. Calm, friendly, and neutral. No role‑play. Short sentences are fine. Use phrases like "to be honest", "the good news is", "this should be manageable", "this might feel a bit tight". Always explain numbers in plain language and what they mean in everyday terms. Use UK prices and £ for money. Be clear and honest about affordability. Start with the four numbers (income, expenses, leftover, savings) if MANDATORY OPENING is present. Only answer about the SUBJECT field. Present EMI options if relevant. Respond directly to user intent. Avoid repeating earlier explanations. Avoid bullet points unless laying out options or plans. Keep it under 180 words unless more detail is needed. Ask at most one follow‑up question, only if it genuinely helps.`;
function buildDataContext(state) {
    const parts = [];
    const homeCurrency = state.userProfile?.homeCurrency ?? state.plan?.userHomeCurrency ?? "GBP";
    if (state.userProfile) {
        const up = state.userProfile;
        parts.push(`USER FINANCIAL PROFILE:`);
        parts.push(`- Monthly income: ${up.monthlyIncome != null ? up.monthlyIncome.toLocaleString("en-GB") + " " + homeCurrency : "Unknown"}`);
        parts.push(`- Monthly expenses: ${up.monthlyExpenses != null ? up.monthlyExpenses.toLocaleString("en-GB") + " " + homeCurrency : "Unknown"}`);
        parts.push(`- Available savings: ${up.availableSavings.toLocaleString("en-GB")} ${homeCurrency}`);
        if (up.monthlyIncome != null && up.monthlyExpenses != null) {
            const leftover = up.monthlyIncome - up.monthlyExpenses;
            parts.push(`- Left after expenses: ${leftover.toLocaleString("en-GB")} ${homeCurrency}`);
        }
    }
    if (state.plan?.product) {
        parts.push(`SUBJECT: ${state.plan.product}`);
    }
    if (state.priceInfo && state.priceInfo.price > 0) {
        parts.push(`PRICE: ${state.plan?.product ?? "Item"} = ${state.priceInfo.price.toLocaleString("en-GB")} ${state.priceInfo.currency}`);
    }
    else if (state.priceInfo && state.priceInfo.price === 0) {
        parts.push(`PRICE: No verified price found. Ask the user to confirm the amount instead of estimating.`);
    }
    if (state.fxInfo) {
        parts.push(`EXCHANGE RATE: 1 ${state.fxInfo.from} = ${state.fxInfo.rate.toFixed(4)} ${state.fxInfo.to}`);
        if (state.priceInfo && state.priceInfo.price > 0) {
            const converted = state.priceInfo.price * state.fxInfo.rate;
            parts.push(`CONVERTED PRICE: ${converted.toFixed(2)} ${state.fxInfo.to}`);
        }
    }
    if (state.affordabilityInfo) {
        const af = state.affordabilityInfo;
        parts.push(`AFFORDABILITY NOTES:`);
        parts.push(af.analysis);
        parts.push(`PRICE IN ${homeCurrency}: ${af.priceInHomeCurrency.toLocaleString("en-GB")} ${homeCurrency}`);
        if (af.emiSuggested || state.plan?.needsEmi) {
            const price = af.priceInHomeCurrency;
            parts.push(`EMI OPTIONS (${homeCurrency}):`);
            parts.push(`- 3 months: ${Math.round(price / 3).toLocaleString("en-GB")} ${homeCurrency} per month`);
            parts.push(`- 6 months: ${Math.round(price / 6).toLocaleString("en-GB")} ${homeCurrency} per month`);
            parts.push(`- 12 months: ${Math.round(price / 12).toLocaleString("en-GB")} ${homeCurrency} per month`);
        }
    }
    return parts.join("\n");
}
export async function runSynthesisAgent(llmClient, state) {
    const dataContext = buildDataContext(state);
    const historyText = state.conversationHistory && state.conversationHistory.length > 0
        ? "\n\nConversation history (most recent last):\n" +
            state.conversationHistory
                .slice(-6)
                .map((m) => {
                let content = "";
                if (typeof m.content === "string") {
                    content = m.content.slice(0, 400);
                }
                else if (Array.isArray(m.content)) {
                    content = m.content.join(" ").slice(0, 400);
                }
                return `${m.role === "user" ? "User" : "Assistant"}: ${content}`;
            })
                .join("\n")
        : "";
    const sanitizedUserMessage = sanitizeUserInput(state.userMessage);
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
            role: "user",
            content: `${historyText}\n\nCurrent message: "${sanitizedUserMessage}"\n\nFinancial data:\n${dataContext}\n\nWrite a clear, natural response using this information.`,
        },
    ];
    const finalText = await llmClient.chat(messages);
    return finalText.trim() ? finalText : "Sorry — I couldn’t generate a response just now. Please try again.";
}
