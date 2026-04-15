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
const SYSTEM_PROMPT = `You are a financial assistant supervisor serving UK-based clients exclusively.

CLIENT CONTEXT:
- This service operates in the UK only. The user's home currency is ALWAYS GBP.
// Removed retail price reference
- priceCurrency defaults to "GBP". Only use a foreign currency if the user is explicitly buying abroad.
- targetCurrency is always "GBP".
- userHomeCurrency is always "GBP" unless the user explicitly states otherwise.

Analyze the user's current message AND the conversation history, then decide what work the downstream agents need to do.


Return ONLY a JSON object — no explanation, no markdown. The object MUST include:
{
  "intentType": "corporate_treasury" | "unknown", // Only corporate/treasury intent
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
- If the message contains ANY of: "?", "afford", "buy", "cost", "price", "how much", "EMI", "instalment", "spread", "month", "pay", "run the numbers", "numbers", "payment", "supplier", "release", "split", "batch", "cash buffer", "liquidity", "inflow", "outflow", "payroll", "auto-release" — set to FALSE.
- When conversationalOnly=true, set ALL other booleans to false.

needsWebSearch:
- true ONLY when the user asks about a specific physical product (phone, laptop, gadget, appliance) AND userStatedPrice is 0.
- false for travel, trips, holidays, flights, hotels — web search cannot return a reliable price for these. If no price is stated, synthesis will ask the user.
- false when userStatedPrice > 0 — user already gave the price, do NOT search.
- false when this is a follow-up about an item whose price was established in history.

needsAffordability:
- true when user asks "can I afford", "should I buy", or any purchase/affordability decision.
- true for treasury payment-run risk checks (supplier payment run, release timing, split batch, liquidity risk).

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
const DEFAULT_PLAN = {
    intentType: "unknown",
    needsWebSearch: false,
    needsFxConversion: false,
    needsNews: false,
    needsAffordability: false,
    needsEmi: false,
    conversationalOnly: false,
    userHomeCurrency: "GBP",
};
export async function runSupervisorAgent(llmClient, userMessage, userProfile, conversationHistory = [], ragContext) {
    const homeCurrency = String(userProfile?.homeCurrency ?? "GBP");
    // Pass ONLY user turns to the supervisor — the assistant's previous responses are outputs, not ground truth.
    // Feeding assistant history back in causes the LLM to anchor on whatever the assistant said before
    // (even if it was wrong), poisoning product detection for follow-up messages.
    const recentUserTurns = conversationHistory.filter(m => m.role === "user").slice(-5);
    const historyText = recentUserTurns.length > 0
        ? "\n\nWhat the user has said so far (most recent last):\n" +
            recentUserTurns
                .map(m => `User: ${m.content.slice(0, 300)}`)
                .join("\n")
        : "";
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
            role: "user",
            content: (ragContext ? `Relevant context:\n${ragContext}\n\n` : "") +
                `User's home currency: ${homeCurrency}${historyText}\n\nCurrent message: "${userMessage}"`,
        },
    ];
    console.log("[SupervisorAgent] Calling LLM to classify query...");
    let parsed = null;
    try {
        parsed = await llmClient.chatJSON(messages);
    }
    catch {
        console.warn("[SupervisorAgent] Could not parse LLM plan, using default.");
        return { ...DEFAULT_PLAN, userHomeCurrency: homeCurrency };
    }
    if (!parsed || typeof parsed !== "object") {
        return { ...DEFAULT_PLAN, userHomeCurrency: homeCurrency };
    }
    // --- LLM-based intent and product extraction only ---
    // Always use LLM for intent and product, never regex or keyword fallback.
    // If LLM does not return intentType or product, treat as unknown/new topic.
    let intentType = typeof parsed.intentType === "string" ? parsed.intentType : undefined;
    let product = typeof parsed.product === "string" ? parsed.product : undefined;
    // No static or regex fallback: product is LLM-only.
    // If LLM did not return intentType, treat as unknown
    if (!intentType) {
        intentType = 'unknown';
    }
    const plan = {
        needsWebSearch: Boolean(parsed.needsWebSearch),
        needsFxConversion: Boolean(parsed.needsFxConversion),
        needsNews: Boolean(parsed.needsNews),
        needsAffordability: Boolean(parsed.needsAffordability),
        needsEmi: Boolean(parsed.needsEmi),
        conversationalOnly: Boolean(parsed.conversationalOnly),
        product,
        searchQuery: parsed.searchQuery || undefined,
        priceCurrency: parsed.priceCurrency || undefined,
        targetCurrency: parsed.targetCurrency || undefined,
        userHomeCurrency: parsed.userHomeCurrency || homeCurrency,
        userStatedPrice: Number(parsed.userStatedPrice) || 0,
        intentType: (intentType === "corporate_treasury" ? "corporate_treasury" : "unknown")
    };
    // No regex fallback: userStatedPrice is now LLM-only. If LLM extraction fails, userStatedPrice remains 0 and downstream will use fallback logic.
    // Safety guard: if user stated a price, never search (prevents hallucinating products)
    if ((plan.userStatedPrice ?? 0) > 0) {
        plan.needsWebSearch = false;
        plan.searchQuery = undefined;
        plan.priceCurrency = plan.priceCurrency ?? "GBP";
        plan.targetCurrency = plan.targetCurrency ?? "GBP";
    }
    console.log("[SupervisorAgent] Plan:", JSON.stringify(plan));
    return plan;
}
