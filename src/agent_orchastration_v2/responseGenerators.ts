/**
 * All LLM response generators.
 * Each function takes structured data and returns a user-facing string.
 * NONE of these functions make routing decisions — only text generation.
 */

import type { LlmClient } from "../agent_orchastration/llm/llmClient.js";
import type { VectorQueryService } from "../agent_orchastration/services/vector.query.service.js";
import type { TripContext, UserProfile, ConversationTurn } from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const historyBlock = (turns: ConversationTurn[], max = 6): string =>
  turns
    .slice(-max)
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");

// ─── 1. FOLLOW-UP: ask for trip cost ──────────────────────────────────────────

export async function generateCostQuestion(
  llm: LlmClient,
  question: string,
  destination?: string,
): Promise<string> {
  return llm.generateText(
    `You are a friendly personal banking assistant. The user asked: "${question}"

They want to know if they can afford a trip or purchase${destination ? ` to ${destination}` : ""} but haven't mentioned the expected cost.
Write ONE short, natural, conversational question asking only for the total estimated cost.
No bullet points. No preamble. Just the question.`,
  );
}

// ─── 2. AFFORDABILITY ANALYSIS ────────────────────────────────────────────────

export async function generateAffordabilityAnswer(
  llm: LlmClient,
  profile: UserProfile,
  trip: TripContext,
  history: ConversationTurn[],
): Promise<string> {
  const { availableSavings, netMonthlySurplus, homeCurrency } = profile;
  const { cost, currency: tripCurrency, destination } = trip;

  const remainingAfterTrip = availableSavings - cost;
  const canAfford = remainingAfterTrip >= 0;

  const surplusLine =
    netMonthlySurplus && netMonthlySurplus > 0
      ? `Monthly surplus: ${homeCurrency}${netMonthlySurplus}`
      : "";

  const preComputed = [
    `Available savings: ${homeCurrency}${availableSavings}`,
    `Trip cost: ${tripCurrency}${cost}`,
    canAfford
      ? `Remaining after trip (lump sum): ${homeCurrency}${remainingAfterTrip}`
      : `Shortfall: ${homeCurrency}${Math.abs(remainingAfterTrip)}`,
    surplusLine,
  ]
    .filter(Boolean)
    .join("\n");

  const recentHistory = historyBlock(history);

  return llm.generateText(
    `You are a personal banking AI assistant. Give a clear affordability verdict for the user's question.

${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n\n` : ""}PRE-COMPUTED FIGURES (use ONLY these — do NOT recalculate):
${preComputed}

RULES:
1. Open with a direct verdict: can they afford it or not.
2. State the key numbers: savings, cost, what's left.
3. Mention briefly if it impacts their emergency buffer or goals.
4. End with EXACTLY ONE offer: "Want me to run the numbers on a 0% instalment plan?" — DO NOT rephrase this offer.
5. Plain prose only, 3–4 sentences max.
6. DO NOT start with "Yes", "Sure", "Great", or any filler word.
7. Use ${homeCurrency} for the user's money. Use ${tripCurrency} for the trip cost${tripCurrency !== homeCurrency ? " (they differ — keep them separate)" : ""}.
${destination ? `8. The trip destination is ${destination}.` : ""}`,
  );
}

// ─── 3. INSTALMENT SIMULATION ─────────────────────────────────────────────────

export async function generateInstalmentSimulation(
  llm: LlmClient,
  profile: UserProfile,
  trip: TripContext,
  history: ConversationTurn[],
): Promise<string> {
  const { availableSavings, netMonthlySurplus, homeCurrency } = profile;
  const { cost, currency: tripCurrency, destination } = trip;

  // Pre-compute all instalment scenarios in code — LLM only formats
  const plans = [3, 6, 12].map((months) => {
    const monthly = Math.ceil(cost / months);
    const savingsRetained = availableSavings;
    return { months, monthly, savingsRetained };
  });

  const upfrontRemaining = availableSavings - cost;
  const monthsToReplenishLump =
    netMonthlySurplus && netMonthlySurplus > 0
      ? Math.ceil(cost / netMonthlySurplus)
      : null;

  const preComputed = [
    `Trip cost: ${tripCurrency}${cost}`,
    `Current savings: ${homeCurrency}${availableSavings}`,
    `3-month plan: ${tripCurrency}${plans[0].monthly}/month (savings stay intact at ${homeCurrency}${availableSavings})`,
    `6-month plan: ${tripCurrency}${plans[1].monthly}/month (savings stay intact at ${homeCurrency}${availableSavings})`,
    `12-month plan: ${tripCurrency}${plans[2].monthly}/month (savings stay intact at ${homeCurrency}${availableSavings})`,
    `Lump-sum payment leaves: ${homeCurrency}${upfrontRemaining} in savings`,
    netMonthlySurplus && netMonthlySurplus > 0
      ? `Monthly surplus available: ${homeCurrency}${netMonthlySurplus}`
      : "",
    monthsToReplenishLump
      ? `Months to fully replenish savings after lump sum: ${monthsToReplenishLump} months`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const recentHistory = historyBlock(history);

  return llm.generateText(
    `You are a personal banking AI assistant. The user confirmed they want the instalment plan breakdown.

${recentHistory ? `RECENT CONVERSATION (for context only):\n${recentHistory}\n\n` : ""}PRE-COMPUTED FIGURES — use ONLY these exact numbers:
${preComputed}

CRITICAL OUTPUT RULES:
1. Start DIRECTLY with the plan options — e.g. "3-month plan: ..." or "Here are your options:".
2. DO NOT say: "Yes", "Sure", "Based on", "You've got", "Your savings", "With your", or any affordability restatement.
3. DO NOT repeat the affordability verdict. DO NOT say they can afford it. The user already knows.
4. List ALL THREE plan options (3, 6, 12 months) on separate lines with exact monthly amounts.
5. After listing options, add 2 sentences comparing instalment vs lump-sum on savings/goals${destination ? ` for the ${destination} trip` : ""}.
6. Use ONLY the pre-computed figures above.
7. Maximum 8 sentences total.
8. Plain prose, no markdown headers, no bold.`,
  );
}

// ─── 4. GENERAL QUESTION RESPONDER ────────────────────────────────────────────

export async function generateGeneralAnswer(
  llm: LlmClient,
  vectorQuery: VectorQueryService,
  userId: string,
  question: string,
  profile: UserProfile,
  history: ConversationTurn[],
): Promise<string> {
  const context = await vectorQuery.getContext(
    userId,
    `financial data: ${question}`,
    { topK: 8 },
  );

  const recentHistory = historyBlock(history);
  const { homeCurrency, availableSavings, monthlyIncome, monthlyExpenses, netMonthlySurplus } = profile;

  const profileSummary = [
    `Available savings: ${homeCurrency}${availableSavings}`,
    monthlyIncome ? `Monthly income: ${homeCurrency}${monthlyIncome}` : "",
    monthlyExpenses ? `Monthly expenses: ${homeCurrency}${monthlyExpenses}` : "",
    netMonthlySurplus ? `Monthly surplus: ${homeCurrency}${netMonthlySurplus}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return llm.generateText(
    `You are a personal banking AI assistant.

${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n\n` : ""}USER QUESTION:
"${question}"

USER FINANCIAL PROFILE:
${profileSummary}

RETRIEVED FINANCIAL CONTEXT:
${context || "No additional context available."}

RULES:
1. Give a clear, direct answer to the user's question using the data above.
2. Use only verified numbers from the context or profile — do not invent figures.
3. Currency: use ${homeCurrency} for the user's own money.
4. Plain prose, 3–5 sentences max.
5. End with ONE brief follow-up offer if relevant.`,
  );
}

// ─── 5. INTENT CLASSIFIER (minimal LLM call) ──────────────────────────────────

export type QuestionIntent =
  | "AFFORDABILITY"        // Can I afford X? / Do I have enough for Y?
  | "INSTALMENT_REQUEST"   // Show me payment plans / split the cost
  | "GENERAL";             // Anything else

export async function classifyIntent(
  llm: LlmClient,
  message: string,
  history: ConversationTurn[],
): Promise<QuestionIntent> {
  const recentHistory = historyBlock(history, 4);

  const result = await llm.generateJSON<{ intent: string }>(`Classify the user message into ONE of these intents:

INTENTS:
- "AFFORDABILITY" — user asks if they can afford something, has enough money, or budget for a trip/purchase
- "INSTALMENT_REQUEST" — user asks for payment plans, instalment options, spreading the cost, how to split payments
- "GENERAL" — anything else (balance, investments, subscriptions, savings goals, etc.)

${recentHistory ? `RECENT CONVERSATION:\n${recentHistory}\n\n` : ""}USER MESSAGE: "${message}"

Return ONLY valid JSON:
{ "intent": "AFFORDABILITY" | "INSTALMENT_REQUEST" | "GENERAL" }`);

  const raw = (result.intent ?? "GENERAL").toUpperCase();
  if (raw === "AFFORDABILITY" || raw === "INSTALMENT_REQUEST") return raw;
  return "GENERAL";
}
