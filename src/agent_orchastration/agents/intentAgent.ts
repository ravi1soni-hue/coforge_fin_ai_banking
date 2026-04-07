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

  // Build conversation history text (last 10 turns for context)
  const prevMessages = state.conversationHistory ?? [];
  const historyText = prevMessages.length > 0
    ? prevMessages.slice(-10)
        .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n")
    : "(none)";

  // Preserve planning facts already known so the LLM doesn't ask for them again
  const kf = (state.knownFacts ?? {}) as Record<string, unknown>;
  const PLANNING_KEYS = [
    "goalType", "destination", "targetAmount", "currency", "targetCurrency",
    "profileCurrency", "duration", "timeframe", "travelersCount",
    "monthlyIncome", "monthlyExpenses", "availableSavings", "currentBalance",
  ];
  const planningFacts: Record<string, unknown> = {};
  for (const key of PLANNING_KEYS) {
    if (kf[key] !== undefined && kf[key] !== null) planningFacts[key] = kf[key];
  }

  // ── Single LLM orchestration call ────────────────────────────────────────
  // One call does intent classification + fact extraction + routing decision.
  // No hardcoded regex, no sequential multi-call chains.
  const orchestration = await llm.generateJSON<{
    route: "answer" | "ask" | "confirm";
    domain: string;
    action: string;
    subject: string | null;
    taskDescription: string;
    clarification: string | null;
    confirmedTask: string | null;
    extractedFacts: {
      goalType: string | null;
      destination: string | null;
      targetAmount: number | null;
      currency: string | null;
      duration: string | null;
      timeframe: string | null;
      travelersCount: number | null;
    };
  }>(`You are the routing brain of a personal banking AI assistant.

Read the full conversation below and decide what to do next.

=== CONVERSATION HISTORY (newest last) ===
${historyText}

=== USER'S NEW MESSAGE ===
"${state.question}"

=== KNOWN FACTS SO FAR ===
${JSON.stringify(planningFacts)}

=== ROUTE OPTIONS ===
1. "answer"  — We have enough information. Proceed with the full financial analysis immediately.
2. "ask"     — We are TRULY missing ONE critical fact without which we cannot answer at all.
               (Example: user says "can I afford a trip?" but no cost anywhere in history)
3. "confirm" — User is accepting a specific action the assistant just offered.
               (Triggers: "yes", "yes please", "sure", "go ahead", "please do that", "ok", "do it")

=== ROUTING RULES ===
- Default to "answer" when in doubt. Be generous — proceed with analysis.
- Only use "ask" if the missing info is ABSOLUTELY required AND not in history or known facts.
- If message is short + affirmative AND the last assistant message ended with an offer → "confirm".
- If the user provides a fact in reply to a question (e.g. "€2200", "next month") → "answer".
- If route is "ask": write a single natural conversational question in "clarification".
- If route is "confirm": copy the exact offered task from the last assistant message into "confirmedTask".
- NEVER ask for something already present in known facts or conversation history.

=== INTENT CLASSIFICATION ===
Pick the best matching domain and action:
Domains: travel, purchase, saving, investing, loans, spending, banking, cashflow, general
Actions: affordability, planning, cost_optimization, review, decision, repayment_planning, optimization, statement, forecast, conversation

=== FACT EXTRACTION ===
Extract any facts the user mentioned in their new message.
Set to null if not mentioned.

Return ONLY valid JSON, no markdown:
{
  "route": "answer" | "ask" | "confirm",
  "domain": string,
  "action": string,
  "subject": string | null,
  "taskDescription": string,
  "clarification": string | null,
  "confirmedTask": string | null,
  "extractedFacts": {
    "goalType": string | null,
    "destination": string | null,
    "targetAmount": number | null,
    "currency": string | null,
    "duration": string | null,
    "timeframe": string | null,
    "travelersCount": number | null
  }
}`);

  console.log(`[IntentAgent] route="${orchestration.route}" domain="${orchestration.domain}" action="${orchestration.action}" task="${(orchestration.taskDescription ?? "").slice(0, 80)}"`);

  // ── Merge extracted facts (null values excluded) ──────────────────────
  const ef = orchestration.extractedFacts ?? {};
  const cleanFacts = Object.fromEntries(
    Object.entries(ef).filter(([, v]) => v !== null && v !== undefined)
  );

  // If user mentioned a currency that differs from profile currency → it's a target (trip) currency
  if (cleanFacts.currency) {
    const profileCurrency = kf.profileCurrency as string | undefined;
    if (profileCurrency && cleanFacts.currency !== profileCurrency) {
      cleanFacts.targetCurrency = cleanFacts.currency;
      delete cleanFacts.currency;
    }
  }

  const mergedKnownFacts = { ...kf, ...cleanFacts };

  const intent = {
    domain: orchestration.domain ?? "general",
    action: orchestration.action ?? "conversation",
    subject: orchestration.subject ?? undefined,
    confidence: 0.9,
  };

  // ── Route: user is confirming/accepting a previous offer ─────────────
  if (orchestration.route === "confirm" && orchestration.confirmedTask) {
    return {
      intent,
      confirmedFollowUpAction: orchestration.confirmedTask,
      missingFacts: [],
      knownFacts: mergedKnownFacts,
    };
  }

  // ── Route: we need one more fact ──────────────────────────────────────
  // Pass the natural-language question as the sole missingFacts item.
  // followUpQuestionAgent detects full sentences and uses them directly.
  if (orchestration.route === "ask" && orchestration.clarification) {
    return {
      intent,
      missingFacts: [orchestration.clarification],
      knownFacts: mergedKnownFacts,
    };
  }

  // ── Route: answer (default) ───────────────────────────────────────────
  return {
    intent,
    missingFacts: [],
    knownFacts: mergedKnownFacts,
  };
};