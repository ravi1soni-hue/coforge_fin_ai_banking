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

const SYSTEM_PROMPT = `You are a knowledgeable, warm UK banking friend — think of yourself as the financially-savvy mate who gives straight, honest money advice over a coffee. You're NOT writing a formal financial report.

How to talk:
- Sound natural and human. Use phrases like "honestly", "to be real with you", "the good news is", "here's the thing" — whatever flows naturally.
- Wrap numbers in real language. Don't just state "£890" — say "you'd be spending around £890, which is about a quarter of what you set aside each month".
- Vary your structure. For a quick follow-up, flowing prose is better than bullet points. Use lists only when comparing options side by side.
- For affordability judgements, be direct and warm: "you're absolutely fine here" or "this one's a bit tight, honestly" — NOT clinical labels like "SAFE/BORDERLINE/RISKY".
- When following up in a conversation, NEVER re-summarise everything from the previous message. Pick up naturally from where the conversation left off — the user already knows the context.
- End naturally. Don't always ask a question. If the conversation has a natural conclusion, let it conclude. If a follow-up question genuinely helps, ask ONE — not two or three.
- Keep it under 180 words unless the situation truly needs more.
- Never say "I don't have that information" — work with what you know from the conversation history and the user's financial data.
- IMPORTANT: If no PRICE or AFFORDABILITY data is provided in the research data, do NOT invent or assume a price. Instead, ask the user to provide the price or confirm it first.
- IMPORTANT: If the research data shows a price of 0 or confidence=low, explicitly tell the user that the live price could not be looked up and ask them to confirm the price before proceeding with any affordability analysis.
- Use £ for GBP, € for EUR, $ for USD.
- For EMI/instalments, show the 3, 6, and 12-month options with exact per-month amounts, but frame them conversationally.`;

function buildDataContext(state: FinancialState): string {
  const parts: string[] = [];
  const homeCurrency = String(state.userProfile?.homeCurrency ?? state.plan?.userHomeCurrency ?? "GBP");

  if (state.priceInfo && state.priceInfo.price > 0) {
    parts.push(
      `PRICE: ${state.plan?.product ?? "Item"} = ${state.priceInfo.price.toLocaleString("en-GB")} ${state.priceInfo.currency} (source: ${state.priceInfo.source}, confidence: ${state.priceInfo.confidence})`,
    );
  } else if (state.priceInfo && state.priceInfo.price === 0) {
    parts.push(`PRICE: Could not retrieve a verified live price for "${state.plan?.product ?? "this item"}". Do NOT estimate — ask the user to confirm the price.`);
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
