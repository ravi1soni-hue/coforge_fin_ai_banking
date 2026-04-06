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

  console.log(`[ConfirmationAgent] task="${(state.confirmedFollowUpAction ?? "").slice(0, 80)}" question="${state.question}"`);

  const answer = await llm.generateText(
    `You are a personal banking assistant. Below is an ongoing conversation.

CONVERSATION:
${historyText}
User: ${state.question}

The user just said YES to your last offer. Continue naturally from where the conversation left off.
Deliver the specific thing you offered — concrete numbers, a plan, or a breakdown.

${figuresBlock ? `RELEVANT FIGURES:\n${figuresBlock}\n` : ""}
STRICT RULES:
- Affordability has already been answered. Do NOT say "You can afford", "You have X in savings", or repeat the prior affordability verdict.
- Open with a concrete number, option, or step — not with "You", "Your", "Based", "Since", "Given", or "Covering".
- Show real numbers (monthly amounts, totals, percentages).
- Maximum 5 sentences.
- Close with one brief follow-up offer on a different aspect of the same goal.`
  );

  console.log(`[ConfirmationAgent] answer="${answer.slice(0, 120)}..."`);

  return {
    finalAnswer: answer,
    confirmedFollowUpAction: undefined,
  };
};
