import { GraphStateType } from "../graph/state.js";
import { LlmClient } from "../llm/llmClient.js";
import { RunnableConfig } from "@langchain/core/runnables";

/**
 * Dedicated agent for handling user confirmations of prior follow-up offers.
 *
 * This is the ONLY agent that runs on the lightPath (when confirmedFollowUpAction is set).
 * It does NOT re-run affordability analysis — instead it reads the full conversation
 * and naturally continues from the last assistant offer.
 *
 * Replaces the previous 4-agent chain: reasoningAgent → productRecommendationAgent →
 * suggestionAgent → synthesisAgent (which confused affordability context with continuation).
 */
export const confirmationAgent = async (
  state: GraphStateType,
  config: RunnableConfig
): Promise<Partial<GraphStateType>> => {
  const llm = config.configurable?.llm as LlmClient;
  if (!llm) throw new Error("LlmClient not provided to graph");

  const kf = state.knownFacts ?? {};

  // Build full conversation including the current user confirmation
  const history = (state.conversationHistory ?? []).slice(-10);
  const historyText = history
    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  // Numeric context from known facts
  const homeCurrency = (kf.profileCurrency ?? kf.currency ?? "GBP") as string;
  const tripCurrency = (kf.targetCurrency ?? homeCurrency) as string;
  const targetAmt = kf.targetAmount;
  const availSavings = kf.availableSavings ?? kf.spendable_savings ?? kf.currentBalance;
  const monthlySurplus = kf.netMonthlySavings ?? kf.netMonthlySurplus;

  const figuresBlock = [
    availSavings !== undefined ? `Savings available: ${homeCurrency}${availSavings}` : null,
    targetAmt !== undefined ? `Goal cost: ${tripCurrency}${targetAmt}` : null,
    monthlySurplus !== undefined ? `Monthly surplus: ${homeCurrency}${monthlySurplus}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const task = state.confirmedFollowUpAction ?? "continue from the previous offer";

  console.log(`[ConfirmationAgent] task="${task.slice(0, 80)}" question="${state.question}"`);

  const answer = await llm.generateText(
    `You are a personal banking assistant. Below is an ongoing conversation.

CONVERSATION:
${historyText}
User: ${state.question}

CONFIRMED TASK — the user just said YES to this specific offer:
"${task}"

Execute this task RIGHT NOW. Do not offer to do it — deliver the actual output: concrete numbers, step-by-step plan, or breakdown.

${figuresBlock ? `AVAILABLE FIGURES:\n${figuresBlock}\n` : ""}
STRICT RULES:
- The affordability verdict is already settled. Do NOT restate it. Do NOT say "You can afford", "You have X in savings", or repeat any affordability conclusion.
- Do NOT offer to do the confirmed task again — you must execute it in this response.
- Open directly with the first concrete step, number, or timeline — not with "You", "Your", "Based", "Since", "Given", or "Covering".
- Show real numbers (monthly amounts, totals, timelines, percentages).
- Maximum 6 sentences.
- Close with one brief offer on a DIFFERENT aspect of the goal (not the same task you just delivered).`
  );

  console.log(`[ConfirmationAgent] answer="${answer.slice(0, 120)}..."`);

  // Persist any new offer embedded in this response so the next turn can detect it
  const newOffer = answer.match(
    /(?:want me to|shall i|would you like me to|let me|i can show you?)\s+([^.?!\n]{5,180})/i
  );
  const updatedKnownFacts = {
    ...(state.knownFacts as Record<string, unknown>),
    _pendingOffer: newOffer ? newOffer[1].trim() : null,
  };

  return {
    finalAnswer: answer,
    confirmedFollowUpAction: undefined,
    knownFacts: updatedKnownFacts,
  };
};
