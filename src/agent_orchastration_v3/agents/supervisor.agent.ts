/**
 * Supervisor Agent — the brain of the pipeline.
 *
 * Reads the user's query and decides exactly what research and analysis
 * the downstream agents need to perform.  Returns an AgentPlan that every
 * subsequent node reads to decide whether it should run.
 *
 * This is the ONLY place in the pipeline where routing decisions are made.
 * Everything else is determined by this agent's LLM reasoning.
 */

import type { V3LlmClient } from "../llm/v3LlmClient.js";
import type { AgenticMessage } from "../types.js";
import type { AgentPlan, ConversationTurn } from "../graph/state.js";

const SYSTEM_PROMPT = `You are a financial assistant supervisor serving UK-based clients exclusively.

CLIENT CONTEXT — read this before every decision:
- This service operates in the UK only. The user's home currency is ALWAYS GBP.
- All product prices should be looked up in GBP at UK retail prices.
- searchQuery MUST always include "UK" so web results return GBP prices (e.g. "iPhone 16 Pro Max UK price").
- priceCurrency defaults to "GBP" for products sold in UK retail. Only use a foreign currency if the user is explicitly buying abroad.
- targetCurrency is always "GBP".
- userHomeCurrency is always "GBP" unless the user explicitly states they live in a different country.

Analyze the user's current message and decide what work the downstream agents need to do.

Return ONLY a JSON object — no explanation, no markdown:
{
  "needsWebSearch": <true|false>,
  "needsFxConversion": <true|false>,
  "needsNews": <true|false>,
  "needsAffordability": <true|false>,
  "needsEmi": <true|false>,
  "conversationalOnly": <true|false>,
  "product": "<product name or null>",
  "searchQuery": "<optimised web search query for price, max 8 words, or null>",
  "priceCurrency": "<3-letter ISO currency code or null>",
  "targetCurrency": "<3-letter ISO currency code or null>",
  "userHomeCurrency": "<3-letter ISO currency code>"
}

Decision rules:
- conversationalOnly = true → ONLY for very short follow-ups or pure confirmations/affirmations with NO question about a product, price, or financial decision. Examples: "yes", "ok sure", "go ahead", "sounds good", "yes please", "that makes sense", "ok thanks". If the message is longer than ~6 words or contains ANY of: "?", "afford", "buy", "can I", "should I", "worth", "cost", "price", "how much", "EMI", "instalment", "pay" — set conversationalOnly=false. When conversationalOnly=true, set ALL other booleans to false.
- needsWebSearch = true → user asks about buying a SPECIFIC product and has NOT stated the price in the CURRENT message (even if a price was mentioned in prior history, search again to confirm)
- needsFxConversion = true → price currency differs from user's home currency
- needsNews = true → user explicitly asks for news or market context
- needsAffordability = true → user asks "can I afford", "should I buy", "is it worth it", or any affordability/purchase decision question. IMPORTANT: whenever needsAffordability=true you MUST also set needsWebSearch=true so the price is always looked up from a real source — NEVER assume the price.
- needsEmi = true → user asks about installments, EMI, monthly payments. IMPORTANT: whenever needsEmi=true you MUST also set needsWebSearch=true and needsAffordability=true.
- product → extract product name (use history if needed); null if conversationalOnly
- searchQuery → best web search query to find current retail price; null if conversationalOnly
- priceCurrency → currency the product is priced in; null if conversationalOnly
- targetCurrency → user's home currency; null if conversationalOnly

IMPORTANT: A message containing a question mark or an affordability/purchase intent is NEVER conversationalOnly, regardless of prior history. Prior history provides context but does NOT replace fresh research for new questions.

If this is a greeting or general question with NO product or financial intent, set all booleans to false.`;

const DEFAULT_PLAN: AgentPlan = {
  needsWebSearch: false,
  needsFxConversion: false,
  needsNews: false,
  needsAffordability: false,
  needsEmi: false,
  conversationalOnly: false,
  userHomeCurrency: "GBP",
};

export async function runSupervisorAgent(
  llmClient: V3LlmClient,
  userMessage: string,
  userProfile: Record<string, unknown>,
  conversationHistory: ConversationTurn[] = [],
): Promise<AgentPlan> {
  const homeCurrency = String(userProfile.homeCurrency ?? "GBP");

  // Format last 3 turns (6 messages) as context so LLM understands follow-ups
  const historyText = conversationHistory.length > 0
    ? "\n\nConversation history (most recent last):\n" +
      conversationHistory
        .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 300)}`)
        .join("\n")
    : "";

  const messages: AgenticMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `User's home currency: ${homeCurrency}${historyText}\n\nCurrent message: "${userMessage}"`,
    },
  ];

  console.log("[SupervisorAgent] Calling LLM to classify query...");

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = await llmClient.chatJSON<Record<string, unknown>>(messages);
  } catch {
    console.warn("[SupervisorAgent] Could not parse LLM plan, using default.");
    return { ...DEFAULT_PLAN, userHomeCurrency: homeCurrency };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ...DEFAULT_PLAN, userHomeCurrency: homeCurrency };
  }

  const plan: AgentPlan = {
    needsWebSearch:     Boolean(parsed.needsWebSearch),
    needsFxConversion:  Boolean(parsed.needsFxConversion),
    needsNews:          Boolean(parsed.needsNews),
    needsAffordability: Boolean(parsed.needsAffordability),
    needsEmi:           Boolean(parsed.needsEmi),
    conversationalOnly: Boolean(parsed.conversationalOnly),
    product:            (parsed.product as string)       || undefined,
    searchQuery:        (parsed.searchQuery as string)   || undefined,
    priceCurrency:      (parsed.priceCurrency as string) || undefined,
    targetCurrency:     (parsed.targetCurrency as string)|| undefined,
    userHomeCurrency:   (parsed.userHomeCurrency as string) || homeCurrency,
  };

  console.log("[SupervisorAgent] Plan:", JSON.stringify(plan));
  return plan;
}
