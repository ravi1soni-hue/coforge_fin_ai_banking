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

  // ── LLM-based confirmation detection ────────────────────────────────────
  // Replaces ALL brittle regex patterns. The LLM reads the actual conversation
  // history and decides whether the user is confirming a previous offer,
  // extracting the exact task description from the assistant's last message.
  // No stored keyword tags, no static pattern tables — just conversation context.
  const prevMessages = state.conversationHistory ?? [];
  const lastAsstMsg = [...prevMessages].reverse().find(m => m.role === "assistant")?.content ?? "";
  const wordCount = state.question.trim().split(/\s+/).length;

  // Pre-filter: only attempt LLM confirmation detection when the message is
  // short (≤10 words) AND there is a prior assistant message that asked a question.
  // This avoids the LLM overhead for clearly new or long questions.
  const mightBeConfirmation =
    wordCount <= 10 &&
    lastAsstMsg.length > 0 &&
    lastAsstMsg.includes("?");

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

  // ✅ Return only the patch
  return {
    intent: {
      domain: result.domain,
      action: result.action,
      subject: result.subject ?? undefined,
      confidence: result.confidence,
    },
  };
};