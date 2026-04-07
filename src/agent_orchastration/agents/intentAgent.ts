import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

export const intentAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {

  const llm = config.configurable?.llm as LlmClient;
  if (!llm) {
    throw new Error("LlmClient not provided to graph");
  }

  // ── Step 0: Deterministic fast-path — _pendingOffer in knownFacts ────────
  // The sessionRepo persists knownFacts._pendingOffer across Railway restarts.
  // This is the most reliable confirmation signal: if a stored offer exists AND
  // the user is affirmative, skip ALL LLM calls and route to confirmationAgent.
  const prevMessages = state.conversationHistory ?? [];
  const lastAsstMsg  = [...prevMessages].reverse().find(m => m.role === "assistant")?.content ?? "";
  const wordCount    = state.question.trim().split(/\s+/).length;
  const isAffirmative = /^(yes|yeah|sure|ok|okay|please|yep|go ahead|do it|do that|yes please|sounds good|absolutely|of course|great|perfect|please do|definitely|run it|show me|go for it|lets? do it)\b/i.test(state.question.trim());
  const storedOffer  = typeof (state.knownFacts as Record<string, unknown>)?._pendingOffer === "string"
    ? (state.knownFacts as Record<string, unknown>)._pendingOffer as string
    : null;

  if (isAffirmative && wordCount <= 12 && storedOffer) {
    console.log(`[IntentAgent] STORED_OFFER fast-path → task="${storedOffer.slice(0, 80)}"`);
    return {
      intent: { domain: "general", action: "conversation", confidence: 0.97 },
      confirmedFollowUpAction: storedOffer,
      missingFacts: [],
      knownFacts: { ...(state.knownFacts as Record<string, unknown>), _pendingOffer: null },
    };
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── LLM-based confirmation detection ────────────────────────────────────
  // Pre-filter: only attempt LLM confirmation detection when the message is
  // short (≤10 words) AND there is a prior assistant message that contains an offer.
  const historyOffer = /want me to|shall i|would you like|let me|i can show|i can work|i can calculate|run the numbers/i.test(lastAsstMsg);
  const mightBeConfirmation =
    wordCount <= 10 &&
    lastAsstMsg.length > 0 &&
    (lastAsstMsg.includes("?") || historyOffer);

  console.log(`[IntentAgent] question="${state.question}" wordCount=${wordCount} mightBeConfirmation=${mightBeConfirmation}`);

  if (mightBeConfirmation) {
    try {
      const detection = await llm.generateJSON<{ isConfirmation: boolean; task: string | null }>(`
You are a conversation intent classifier for a banking assistant.

The assistant's PREVIOUS response (last ~300 characters shown):
"${lastAsstMsg.slice(-300)}"

The user's CURRENT message:
"${state.question}"

Question: Is the user CONFIRMING or ACCEPTING the specific offer made by the assistant?

Rules:
- Short affirmations like "yes", "yes please", "sure", "go ahead", "please do that", "ok",
  "sounds good", "let's do it", "please", "definitely" = confirmation.
- Answers that provide a new fact (e.g. "2200 euros", "next month", "Paris") = NOT a confirmation,
  they are answers to a question the assistant asked.
- New questions on a different topic = NOT a confirmation.

If it IS a confirmation, extract from the assistant's message the EXACT task that was offered.
Examples of task descriptions:
  "0% repayment schedule for EUR 2200 showing 3-month, 6-month, and 12-month options"
  "three concrete ways to reduce the Paris trip cost below EUR 1500"
  "post-trip savings recovery plan showing how long to rebuild the buffer"
  "cashflow forecast for the next 3 months"

If NOT a confirmation, set task to null.

Return ONLY valid JSON. No markdown, no explanation.
{ "isConfirmation": boolean, "task": string | null }`);

      console.log(`[IntentAgent] LLM detection → isConfirmation=${detection.isConfirmation} task="${detection.task ?? "none"}"`);

      if (detection.isConfirmation && detection.task) {
        return {
          intent: {
            domain: "general",
            action: "conversation",
            subject: (state.knownFacts?.destination as string | undefined) ?? undefined,
            confidence: 0.95,
          },
          // Store the natural-language task description — NOT a brittle keyword tag.
          confirmedFollowUpAction: detection.task,
          missingFacts: [],
          knownFacts: state.knownFacts,
        };
      }
    } catch (err) {
      // LLM detection failed (timeout / garbled JSON). Use a simple deterministic
      // safety net so the system doesn't silently fall into full affordability mode.
      // This is intentionally narrow: only fires when the LLM threw, not on every turn.
      console.warn("[IntentAgent] LLM confirmation detection failed, applying safety fallback:", err);

      const simpleAffirmation = /^(yes|sure|ok|okay|please|yep|yup|go ahead|do it|let's|let's do it|please do that|yes please|sounds good|definitely|absolutely|of course|great|perfect)\b/i;
      if (simpleAffirmation.test(state.question.trim()) && lastAsstMsg.includes("?")) {
        // Extract the offer text from common "Want me to / Shall I / Let me" patterns.
        const offerMatch = lastAsstMsg.match(
          /(?:want me to|shall i|would you like me to|let me)\s+([^.?!]{10,120})/i
        );
        const fallbackTask = offerMatch ? offerMatch[1].trim() : "continue from the previous offer";
        console.warn(`[IntentAgent] Safety fallback activated — task="${fallbackTask.slice(0, 60)}"`);
        return {
          intent: {
            domain: "general",
            action: "conversation",
            subject: (state.knownFacts?.destination as string | undefined) ?? undefined,
            confidence: 0.80,
          },
          confirmedFollowUpAction: fallbackTask,
          missingFacts: [],
          knownFacts: state.knownFacts,
        };
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const result = await llm.generateJSON<{
    domain: string;
    action: string;
    subject?: string;
    confidence: number;
  }>(`
You are an intent classification agent for a personal banking AI assistant.

Classify the user's request into ONE of the following intents:

DOMAIN / ACTION combinations (pick the single best match):
- travel / affordability       — can I afford a trip, holiday, flight, hotel
- travel / planning            — how to plan a trip budget
- travel / cost_optimization   — how to cut trip costs
- purchase / affordability     — can I afford a car, bike, house, phone, appliance, any purchase
- purchase / planning          — how to save up for a big purchase
- saving / planning            — savings plan, goal saving, building an emergency fund
- saving / recovery            — rebuild savings after a purchase or trip
- investing / review           — how are my investments doing, ISA performance, premium bonds
- investing / decision         — should I invest more, which fund, rebalancing
- loans / affordability        — can I take a loan, EMI affordability
- loans / repayment_planning   — repayment schedule, clear debt faster
- spending / optimization      — review subscriptions, cut spending, reduce expenses
- banking / statement          — account balance, transaction history, monthly summary, cashflow
- cashflow / forecast          — project next month's cashflow, surplus
- general / conversation       — greeting, unclear, off-topic

Rules:
- subject is optional — fill it only if clearly mentioned (e.g. "Paris trip", "Honda Civic", "ISA").
- confidence: 0.9+ for clear queries, 0.6-0.9 for partial match, below 0.6 = unsupported.
- Return ONLY valid JSON. No markdown, no explanation.

User message:
"${state.question}"

Return JSON:
{
  "domain": string,
  "action": string,
  "subject": string | null,
  "confidence": number
}
`);

  const nextIntent = {
    domain: result.domain,
    action: result.action,
    subject: result.subject ?? undefined,
    confidence: result.confidence,
  };

  // If intent is too low confidence, skip fact extraction and route directly.
  if (!nextIntent || nextIntent.confidence < 0.5) {
    return {
      intent: nextIntent,
      missingFacts: [],
      knownFacts: state.knownFacts,
    };
  }

  // Extract and merge structured facts so follow-up routing can happen without a separate planner node.
  const extraction = await llm.generateJSON<{
    extractedFacts: Record<string, unknown>;
    missingFacts: string[];
  }>(`You are a financial planning assistant that extracts facts from a user question.

User question:
"${state.question}"

Already known facts (do not ask for these again):
${JSON.stringify(state.knownFacts ?? {})}

Instructions:
1. Extract EVERY fact explicitly stated in the question:
   - goalType (trip, car, house, phone, electronics, education, wedding, medical, investment, general)
   - destination (city or country if mentioned)
   - targetAmount (numeric budget or cost)
   - currency (GBP, EUR, USD, JPY, etc. — infer from symbols or words like "euros", "pounds", "dollars")
   - duration (e.g. "3 days")
   - timeframe (e.g. "next month", "this year")
   - travelersCount (number of people; words like "alone", "solo", "by myself" = 1)
   - queryType: classify the overall intent as one of:
       "affordability"         — user wants to know if they can afford something
       "subscriptions"         — query is about subscriptions or recurring spending
       "investment_performance"— user asks about investment profit/loss/returns
       "bank_statement"        — user wants a statement or transaction summary
       "general_finance"       — everything else
2. Set a non-queryType fact to null if it is NOT in the question.
3. Determine missingFacts STRICTLY as follows:
   - A fact is missing ONLY when it is absent from BOTH the current question AND the already known facts above.
   - NEVER list a fact as missing if it already appears in the known facts, even if the user did not repeat it.
   - If the user's message is a short follow-up answer (e.g. a single word, a number, "alone", "yes", "no"),
     treat it as a reply to a previous question. In this case use the known facts as the primary context
     and extract only what the short answer adds.
   - For affordability/planning: need goalType AND targetAmount (only if absent from known facts)
   - For trip questions: also need destination (only if absent from known facts)
   - If queryType is subscriptions, investment_performance, or bank_statement — missingFacts = [].
   - If queryType is general_finance or the user message is a short confirmation — missingFacts = [].

Return ONLY valid JSON, no markdown:
{
  "extractedFacts": {
    "goalType": string | null,
    "destination": string | null,
    "targetAmount": number | null,
    "currency": string | null,
    "duration": string | null,
    "timeframe": string | null,
    "travelersCount": number | null,
    "queryType": string
  },
  "missingFacts": string[]
}`);

  const llmFacts = extraction.extractedFacts ?? {};
  const cleanLlmFacts = Object.fromEntries(
    Object.entries(llmFacts).filter(([, v]) => v !== null && v !== undefined)
  );

  if (cleanLlmFacts.currency) {
    const profileCurrency = state.knownFacts?.profileCurrency as string | undefined;
    if (profileCurrency && cleanLlmFacts.currency !== profileCurrency) {
      cleanLlmFacts.targetCurrency = cleanLlmFacts.currency;
      delete cleanLlmFacts.currency;
    }
  }

  const nonAffordabilityActions = [
    "planning", "forecast", "review", "optimization", "statement",
    "repayment_planning", "goal_impact", "recovery", "cost_optimization",
    "decision", "conversation",
  ];
  if (
    nonAffordabilityActions.includes(nextIntent.action ?? "") &&
    cleanLlmFacts.queryType === "affordability"
  ) {
    cleanLlmFacts.queryType = "general_finance";
  }

  const mergedKnownFacts = { ...state.knownFacts, ...cleanLlmFacts };
  const missingFacts = Array.isArray(extraction.missingFacts)
    ? extraction.missingFacts
    : [];

  return {
    intent: nextIntent,
    missingFacts,
    knownFacts: mergedKnownFacts,
  };
};