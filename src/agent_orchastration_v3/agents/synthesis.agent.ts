import type { V3LlmClient } from "../llm/v3LlmClient.js";
import type { FinancialState } from "../graph/state.js";
import type { AgenticMessage } from "../types.js";
import { sanitizeUserInput } from "../../utils/sanitizeUserInput.js";

const SYSTEM_PROMPT = `You are a financial assistant. Your response MUST:
 - Always start with these numbers: income, expenses, leftover, savings (in one line each, no extra words)
 - Give a direct, concise answer to the user's question (max 2-3 sentences)
 - If you need more info, ask a single, clear follow-up question. Never ask more than 2 follow-ups per topic.
 - After 2 clarifications, move to a summary and close the topic. Never ask again.
 - Never repeat numbers or explanations.
 - Never exceed 80 words total.
 - Never use bullet points or long lists.
 - Never repeat the user's question.
 - Never use phrases like "to be honest" or "the good news is".
 - Never role-play or add chit-chat.
 - If the user asks for a summary, give only the numbers and a one-line verdict.
 - If you lack context, say so directly and ask for the missing info ONCE.
 - If the user asks about a new topic, reset the follow-up count.
 - STRICT: If you have already asked 2 follow-up questions on this topic, do NOT ask again. Instead, summarize and close the topic.
This is a strict requirement. Your output will be checked for brevity and clarity.`;

function buildDataContext(state: FinancialState): string {
  const parts: string[] = [];
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
  } else if (state.priceInfo && state.priceInfo.price === 0) {
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

export async function runSynthesisAgent(
  llmClient: V3LlmClient,
  state: FinancialState
): Promise<string> {
  const dataContext = buildDataContext(state);
  const historyText =
    state.conversationHistory && state.conversationHistory.length > 0
      ? "\n\nConversation history (most recent last):\n" +
        state.conversationHistory
          .slice(-6)
          .map((m: any) => {
            let content = "";
            if (typeof m.content === "string") {
              content = m.content.slice(0, 400);
            } else if (Array.isArray(m.content)) {
              content = m.content.join(" ").slice(0, 400);
            }
            return `${m.role === "user" ? "User" : "Assistant"}: ${content}`;
          })
          .join("\n")
      : "";
  const sanitizedUserMessage = sanitizeUserInput(state.userMessage);
  const messages: AgenticMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${historyText}\n\nCurrent message: "${sanitizedUserMessage}"\n\nFinancial data:\n${dataContext}\n\nWrite a clear, natural response using this information.`,
    },
  ];
  const finalText = await llmClient.chat(messages);
  return finalText.trim() ? finalText : "Sorry — I couldn’t generate a response just now. Please try again.";
}
