import { sanitizeUserInput } from "../../utils/sanitizeUserInput.js";
const SYSTEM_PROMPT = `You are a warm, conversational financial assistant. Detect the user's intent (affordability, balance, investment, etc.) and respond naturally:
 - For affordability, show the numbers (income, expenses, savings, leftover) only on the first relevant response, blended into a natural sentence. Do not repeat them on follow-ups.
 - For balance, investment, or other queries, answer directly and conversationally, using context and warmth. Do not show unrelated numbers.
 - Use natural transitions and acknowledgments (e.g., "Thanks for sharing that detail.", "Here's what that means for you...").
 - Never sound scripted or robotic. Avoid rigid lists, bullet points, or repeated phrases.
 - If you need more info, ask a single, clear follow-up question, but never more than 2 per topic. After that, summarize and close.
 - Always adapt your tone and content to the user's intent and conversation history.
 - If the user changes topic, reset context and respond accordingly.
 - Never repeat the user's question. Never use phrases like "to be honest" or "the good news is". Never role-play.
 - Your output will be checked for warmth, clarity, and natural flow.`;
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
