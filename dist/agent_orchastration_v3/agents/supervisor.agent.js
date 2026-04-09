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
const SYSTEM_PROMPT = `You are a financial assistant supervisor. Analyze the user's query and decide what research and analysis is needed.

Return ONLY a JSON object with this exact structure — no explanation, no markdown:
{
  "needsWebSearch": <true|false>,
  "needsFxConversion": <true|false>,
  "needsNews": <true|false>,
  "needsAffordability": <true|false>,
  "needsEmi": <true|false>,
  "product": "<product name or null>",
  "searchQuery": "<optimised web search query for price, max 8 words, or null>",
  "priceCurrency": "<3-letter ISO currency code or null>",
  "targetCurrency": "<3-letter ISO currency code or null>",
  "userHomeCurrency": "<3-letter ISO currency code>"
}

Decision rules:
- needsWebSearch = true  → user mentions buying something WITHOUT stating the exact price
- needsFxConversion = true → price currency differs from user's home currency
- needsNews = true → user asks for news/context or market conditions
- needsAffordability = true → any question about "can I afford", "budget", "is it too expensive"
- needsEmi = true → user asks about installments, EMI, monthly payment options
- product → extract the exact product name from the query (use conversation history if the current message is a follow-up)
- searchQuery → create the best web search query to find this product's current retail price
- priceCurrency → the currency the product is likely priced in (EUR for Europe, USD for US, etc.)
- targetCurrency → the user's home currency (what they want to convert TO)

IMPORTANT: If the current message is a short follow-up (e.g. "yes", "compare", "yes please compare"), 
read the conversation history to understand what was being discussed and infer the full intent.
For example, if the assistant previously mentioned comparing iPhone 17 Pro Max vs iPhone 17 Pro,
and the user says "yes please compare", set product/searchQuery accordingly.

If this is a greeting or general question with no prior context, set all booleans to false.`;
const DEFAULT_PLAN = {
    needsWebSearch: false,
    needsFxConversion: false,
    needsNews: false,
    needsAffordability: false,
    needsEmi: false,
    userHomeCurrency: "GBP",
};
export async function runSupervisorAgent(llmClient, userMessage, userProfile, conversationHistory = []) {
    const homeCurrency = String(userProfile.homeCurrency ?? "GBP");
    // Format last 3 turns (6 messages) as context so LLM understands follow-ups
    const historyText = conversationHistory.length > 0
        ? "\n\nConversation history (most recent last):\n" +
            conversationHistory
                .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 300)}`)
                .join("\n")
        : "";
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
            role: "user",
            content: `User's home currency: ${homeCurrency}${historyText}\n\nCurrent message: "${userMessage}"`,
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
    const plan = {
        needsWebSearch: Boolean(parsed.needsWebSearch),
        needsFxConversion: Boolean(parsed.needsFxConversion),
        needsNews: Boolean(parsed.needsNews),
        needsAffordability: Boolean(parsed.needsAffordability),
        needsEmi: Boolean(parsed.needsEmi),
        product: parsed.product || undefined,
        searchQuery: parsed.searchQuery || undefined,
        priceCurrency: parsed.priceCurrency || undefined,
        targetCurrency: parsed.targetCurrency || undefined,
        userHomeCurrency: parsed.userHomeCurrency || homeCurrency,
    };
    console.log("[SupervisorAgent] Plan:", JSON.stringify(plan));
    return plan;
}
