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

const SYSTEM_PROMPT = `You are a financial assistant supervisor. Analyze the user's current message and decide what work the downstream agents need to do.

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
- conversationalOnly = true → the message is a short follow-up, confirmation, or clarification where the full context is already in conversation history and NO new product research is needed. When conversationalOnly=true, set ALL other booleans to false. Examples: "yes", "ok sure", "yes please do that", "tell me more", "sounds good", "what about interest rates?", "show me the comparison", "yes please", "go ahead", "ok what if I pay in 6 months".
- needsWebSearch = true → user asks about buying a SPECIFIC NEW product and has NOT stated the price
- needsFxConversion = true → price currency differs from user's home currency AND this is a fresh product query (not a follow-up)
- needsNews = true → user explicitly asks for news or market context
- needsAffordability = true → user asks "can I afford" or similar AND this is a fresh query (not a follow-up)
- needsEmi = true → user asks about installments, EMI, monthly payments AND this is a fresh query
- product → extract product name (use history if follow-up); null if conversationalOnly
- searchQuery → best web search query to find current retail price; null if conversationalOnly
- priceCurrency → currency the product is priced in; null if conversationalOnly
- targetCurrency → user's home currency; null if conversationalOnly

IMPORTANT: When in doubt between conversationalOnly=true and a fresh query, prefer conversationalOnly if there is relevant conversation history. The key signal is whether new external research is actually needed.

If this is a greeting or general question with NO prior history, set all booleans to false.`;

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
