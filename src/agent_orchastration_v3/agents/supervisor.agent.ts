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
import type { AgenticMessage, UserProfile } from "../types.js";
import type { AgentPlan, ConversationTurn } from "../graph/state.js";

const SYSTEM_PROMPT = `You are a financial assistant supervisor serving UK-based clients exclusively.

CLIENT CONTEXT:
- This service operates in the UK only. The user's home currency is ALWAYS GBP.
- All product prices should be looked up in GBP at UK retail prices.
- priceCurrency defaults to "GBP". Only use a foreign currency if the user is explicitly buying abroad.
- targetCurrency is always "GBP".
- userHomeCurrency is always "GBP" unless the user explicitly states otherwise.

Analyze the user's current message AND the conversation history, then decide what work the downstream agents need to do.

Return ONLY a JSON object — no explanation, no markdown:
{
  "needsWebSearch": <true|false>,
  "needsFxConversion": <true|false>,
  "needsNews": <true|false>,
  "needsAffordability": <true|false>,
  "needsEmi": <true|false>,
  "conversationalOnly": <true|false>,
  "product": "<product or service name from this conversation ONLY, or null>",
  "searchQuery": "<optimised web search query, max 8 words, or null>",
  "priceCurrency": "<3-letter ISO currency code or null>",
  "targetCurrency": "<3-letter ISO currency code or null>",
  "userHomeCurrency": "<3-letter ISO currency code>",
  "userStatedPrice": <number — price the user explicitly mentioned, or 0 if not stated>
}

Decision rules:

userStatedPrice:
- Extract a number ONLY if the user stated an explicit amount in the current message OR the immediately previous user turn in history.
- Examples: "around 3000 GBP" → 3000, "it costs £500" → 500, "the trip is £1,200" → 1200.
- Set to 0 if no price was stated.

conversationalOnly:
- ONLY true for very short responses with zero financial intent: "yes", "ok", "sounds good", "go ahead", "thanks".
- If the message contains ANY of: "?", "afford", "buy", "cost", "price", "how much", "EMI", "instalment", "spread", "month", "pay", "run the numbers", "numbers" — set to FALSE.
- When conversationalOnly=true, set ALL other booleans to false.

needsWebSearch:
- true ONLY when the user asks about a specific product/service AND userStatedPrice is 0.
- false when userStatedPrice > 0 — user already gave the price, do NOT search.
- false when this is a follow-up about an item whose price was established in history.

needsAffordability:
- true when user asks "can I afford", "should I buy", or any purchase/affordability decision.

needsEmi:
- true when user asks about EMI, instalments, spreading payments, monthly payments.
- Do NOT set needsWebSearch=true just because needsEmi=true if userStatedPrice > 0.

needsWebSearch + needsAffordability together:
- ONLY force needsWebSearch=true alongside needsAffordability/needsEmi when userStatedPrice is 0 AND no price is in history.

product:
- Extract ONLY from the current conversation context. For trips: "Lisbon trip", "Paris holiday".
- NEVER invent a product from your training knowledge.
- If this is a follow-up about something already established in history, use THAT item.
- Set to null if nothing is identifiable.

searchQuery:
- Only set when needsWebSearch=true.
- For physical products: "<product> UK price 2025".
- For travel/trips/holidays: "<destination> trip UK cost 2025 budget".
- NEVER set a searchQuery when needsWebSearch=false.

IMPORTANT: Follow-ups like "spread it over 6 months", "run the numbers", "what about 12 months" are about the SAME item/price from history. Use userStatedPrice from history, set needsWebSearch=false.

If this is a greeting or general question with NO product or financial intent, set all booleans to false and userStatedPrice=0.`;

const DEFAULT_PLAN: AgentPlan = {
  needsWebSearch: false,
  needsFxConversion: false,
  needsNews: false,
  needsAffordability: false,
  needsEmi: false,
  conversationalOnly: false,
  userHomeCurrency: "GBP",
};

function extractStatedGbpPrice(text: string): number {
  const moneyPattern = /(£\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*GBP)/i;
  const m = text.match(moneyPattern);
  if (!m) return 0;
  const digits = m[0].replace(/[^\d.]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function inferTripProductFromUserHistory(
  userMessage: string,
  conversationHistory: ConversationTurn[],
): string | undefined {
  const userTurns = conversationHistory
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .concat(userMessage)
    .reverse();

  for (const text of userTurns) {
    const lower = text.toLowerCase();
    if (!/(trip|travel|holiday|flight|hotel)/.test(lower)) continue;

    const toMatch = text.match(/trip\s+to\s+([a-zA-Z\s'-]{2,40})/i);
    if (toMatch?.[1]) {
      const destination = toMatch[1].trim().replace(/[?.!,]$/, "");
      return `${destination} trip`;
    }
    return "trip";
  }
  return undefined;
}

export async function runSupervisorAgent(
  llmClient: V3LlmClient,
  userMessage: string,
  userProfile: UserProfile | null,
  conversationHistory: ConversationTurn[] = [],
): Promise<AgentPlan> {
  const homeCurrency = String(userProfile?.homeCurrency ?? "GBP");

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
    product:            (parsed.product as string)        || undefined,
    searchQuery:        (parsed.searchQuery as string)    || undefined,
    priceCurrency:      (parsed.priceCurrency as string)  || undefined,
    targetCurrency:     (parsed.targetCurrency as string) || undefined,
    userHomeCurrency:   (parsed.userHomeCurrency as string) || homeCurrency,
    userStatedPrice:    Number(parsed.userStatedPrice)    || 0,
  };

  // Deterministic price fallback (GBP/£) from current or immediately previous user turn.
  if ((plan.userStatedPrice ?? 0) === 0) {
    const currentPrice = extractStatedGbpPrice(userMessage);
    if (currentPrice > 0) {
      plan.userStatedPrice = currentPrice;
    } else {
      const prevUser = [...conversationHistory].reverse().find((m) => m.role === "user")?.content ?? "";
      const prevPrice = extractStatedGbpPrice(prevUser);
      if (prevPrice > 0) {
        plan.userStatedPrice = prevPrice;
      }
    }
  }

  const inferredTrip = inferTripProductFromUserHistory(userMessage, conversationHistory);
  if ((!plan.product || plan.product.toLowerCase() === "item") && inferredTrip) {
    plan.product = inferredTrip;
  }

  // If this thread is trip/travel-related, don't let product drift to unrelated electronics.
  if (inferredTrip && plan.product && /iphone|apple|macbook|laptop|phone/i.test(plan.product)) {
    plan.product = inferredTrip;
  }

  // Safety guard: if user stated a price, never search (prevents hallucinating products)
  if ((plan.userStatedPrice ?? 0) > 0) {
    plan.needsWebSearch = false;
    plan.searchQuery    = undefined;
    plan.priceCurrency  = plan.priceCurrency ?? "GBP";
    plan.targetCurrency = plan.targetCurrency ?? "GBP";
  }

  console.log("[SupervisorAgent] Plan:", JSON.stringify(plan));
  return plan;
}
