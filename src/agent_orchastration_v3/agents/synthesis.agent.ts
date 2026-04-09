/**
 * Synthesis Agent — final response generation.
 *
 * Receives the full graph state (all gathered data from every agent) and
 * generates a clear, concise, friendly final response for the user.
 *
 * This agent:
 *   - States actual numbers (prices, exchange rates, savings)
 *   - Gives a clear affordability verdict when relevant
 *   - Calculates and presents EMI options with real numbers
 *   - Adapts tone and content to what the user actually asked
 */

import type { V3LlmClient } from "../llm/v3LlmClient.js";
import type { AgenticMessage } from "../types.js";
import type { FinancialState } from "../graph/state.js";

const SYSTEM_PROMPT = `You are a helpful UK banking financial assistant. Generate a clear, specific, friendly response.

Guidelines:
- ALWAYS use the actual numbers from the research data — never say "I don't have information"
- Use £ for GBP, € for EUR, $ for USD
- For affordability, state the verdict clearly (SAFE / BORDERLINE / RISKY) with specific reasoning
- For EMI/instalments, calculate and show 3-month, 6-month, and 12-month options with exact monthly amounts
- Include the exchange rate and converted price clearly when currency conversion happened
- Keep the response under 300 words
- Be conversational but precise
- IMPORTANT: Read the conversation history carefully — if the user is following up on something previously discussed,
  continue that thread naturally. Never ask "what would you like to compare?" if the context is already clear from history.
- If this is a simple greeting or general question with no history, just be helpful and friendly`;

function buildDataContext(state: FinancialState): string {
  const parts: string[] = [];
  const homeCurrency = String(state.userProfile?.homeCurrency ?? state.plan?.userHomeCurrency ?? "GBP");

  if (state.priceInfo && state.priceInfo.price > 0) {
    parts.push(
      `PRICE: ${state.plan?.product ?? "Item"} = ${state.priceInfo.price.toLocaleString("en-GB")} ${state.priceInfo.currency} (source: ${state.priceInfo.source}, confidence: ${state.priceInfo.confidence})`,
    );
  }

  if (state.fxInfo) {
    parts.push(
      `EXCHANGE RATE: 1 ${state.fxInfo.from} = ${state.fxInfo.rate.toFixed(4)} ${state.fxInfo.to}`,
    );
    if (state.priceInfo && state.priceInfo.price > 0) {
      const converted = (state.priceInfo.price * state.fxInfo.rate).toFixed(2);
      parts.push(`CONVERTED PRICE: ${converted} ${state.fxInfo.to}`);
    }
  }

  if (state.newsInfo) {
    parts.push(`MARKET CONTEXT: ${state.newsInfo.context}`);
    if (state.newsInfo.headlines.length > 0) {
      parts.push(`NEWS HEADLINES: ${state.newsInfo.headlines.join(" | ")}`);
    }
  }

  if (state.affordabilityInfo) {
    const af = state.affordabilityInfo;
    parts.push(
      `AFFORDABILITY VERDICT: ${af.verdict} (can afford: ${af.canAfford})`,
      `ANALYSIS: ${af.analysis}`,
      `PRICE IN ${homeCurrency}: ${af.priceInHomeCurrency.toLocaleString("en-GB")} ${homeCurrency}`,
    );

    if (af.emiSuggested || state.plan?.needsEmi) {
      const price = af.priceInHomeCurrency;
      parts.push(
        `EMI OPTIONS (${homeCurrency}):`,
        `  - 3 months:  ${Math.round(price / 3).toLocaleString("en-GB")} ${homeCurrency}/month`,
        `  - 6 months:  ${Math.round(price / 6).toLocaleString("en-GB")} ${homeCurrency}/month`,
        `  - 12 months: ${Math.round(price / 12).toLocaleString("en-GB")} ${homeCurrency}/month`,
      );
    }
  }

  return parts.join("\n");
}

export async function runSynthesisAgent(
  llmClient: V3LlmClient,
  state: FinancialState,
): Promise<string> {
  const dataContext = buildDataContext(state);

  // Include last 3 turns so the LLM knows the full conversation thread
  const historyText = (state.conversationHistory ?? []).length > 0
    ? "\n\nConversation history (most recent last):\n" +
      (state.conversationHistory ?? [])
        .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 400)}`)
        .join("\n")
    : "";

  const messages: AgenticMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${historyText}

Current message: "${state.userMessage}"

Research data gathered by agents:
${dataContext || "(No specific financial data needed — answer based on conversation context)"}

Generate a helpful, specific response to the current message.`,
    },
  ];

  console.log("[SynthesisAgent] Generating final response...");

  const finalText = await llmClient.chat(messages);

  if (!finalText.trim()) {
    return "I'm sorry, I was unable to generate a response. Please try again.";
  }

  console.log(`[SynthesisAgent] Response: ${finalText.length} chars`);
  return finalText;
}
