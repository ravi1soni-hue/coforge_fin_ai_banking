// LLM-driven scenario state extraction for agentic memory
import { OpenAI } from "openai";



export async function extractScenarioStateLLM(
  conversationHistory: { role: string; content: string }[],
  treasuryAnalysis: any,
  llmClient: V3LlmClient
) {
  const prompt = `
From the conversation below, identify the current scenario state.

Return a JSON object with these fields:
- userChoseSplit (boolean)
- userChoseFullRelease (boolean)
- userRequestedSimulation (boolean)
- userConfirmedSchedule (boolean)
- lastSplitAmount (number|null)
- lastDeferAmount (number|null)
- lastUrgentAmount (number|null)
- lastUserMessage (string)

Conversation:
${conversationHistory.map(t => `${t.role}: ${t.content}`).join("\n")}

Return only valid JSON.
`;

  const response = await llmClient.chat([
    { role: "system", content: "You extract structured information from conversations." },
    { role: "user", content: prompt }
  ]);

  try {
    const scenario = JSON.parse(response);

    if (treasuryAnalysis?.usedUserAmount && treasuryAnalysis.paymentAmount > 0) {
      scenario.lastSplitAmount = treasuryAnalysis.paymentAmount;
      scenario.lastDeferAmount = 0;
      scenario.lastUrgentAmount = null;
    } else {
      if (!scenario.lastSplitAmount && treasuryAnalysis?.suggestedNowAmount) {
        scenario.lastSplitAmount = treasuryAnalysis.suggestedNowAmount;
      }
      if (!scenario.lastDeferAmount && treasuryAnalysis?.suggestedLaterAmount) {
        scenario.lastDeferAmount = treasuryAnalysis.suggestedLaterAmount;
      }
    }

    if (typeof scenario.userConfirmedSchedule !== "boolean") {
      scenario.userConfirmedSchedule = false;
    }

    scenario.lastUserMessage =
      scenario.lastUserMessage ??
      conversationHistory.filter(t => t.role === "user").slice(-1)[0]?.content ??
      "";

    return scenario;
  } catch {
    return {
      userChoseSplit: false,
      userChoseFullRelease: false,
      userRequestedSimulation: false,
      userConfirmedSchedule: false,
      lastSplitAmount:
        treasuryAnalysis?.usedUserAmount && treasuryAnalysis.paymentAmount > 0
          ? treasuryAnalysis.paymentAmount
          : treasuryAnalysis?.suggestedNowAmount ?? null,
      lastDeferAmount:
        treasuryAnalysis?.usedUserAmount && treasuryAnalysis.paymentAmount > 0
          ? 0
          : treasuryAnalysis?.suggestedLaterAmount ?? null,
      lastUrgentAmount: null,
      lastUserMessage:
        conversationHistory.filter(t => t.role === "user").slice(-1)[0]?.content ?? ""
    };
  }
}
/**
 * Synthesis Agent — final response generation.
 *
 * Takes the full financial graph state and produces a clear,
 * simple, human-readable response for the user.
 */

import type { V3LlmClient } from "../llm/v3LlmClient.js";
import type { AgenticMessage } from "../types.js";
import type { FinancialState } from "../graph/state.js";

const SYSTEM_PROMPT = `
You are responding as an experienced corporate banking professional in a real conversation with a client.

Guidelines:
- Keep the tone natural, professional, and concise.
- Focus only on the numbers and implications that matter for the current decision.
- When a payment split is involved, clearly explain amounts, timing, and resulting balances using the provided figures.
- When no split decision is involved, respond with a short, conversational explanation.
- Mention both full release and split options briefly, using the data provided.
- Use only numbers explicitly present in the provided context.
- If a figure is not present, do not introduce it.

Style:
- Avoid labels or risk flags.
- Do not repeat the user’s question.
- Avoid unnecessary repetition of figures unless they change.
- When the user’s intent is clear or a decision is confirmed, close naturally and professionally.

Context handling:
- Use only the structured data provided.
- Do not reference internal systems, agents, or tooling.
- Do not introduce or offer information that does not exist in the context.
`;




export async function buildDataContextAsync(
  state: FinancialState,
  llmClient: V3LlmClient
): Promise<string> {
  const scenario = state.treasuryAnalysis
    ? await extractScenarioStateLLM(
        state.conversationHistory ?? [],
        state.treasuryAnalysis,
        llmClient
      )
    : null;

  const splitContext =
    scenario?.userChoseSplit && scenario?.lastSplitAmount
      ? {
          splitTranche1Amount: scenario.lastSplitAmount,
          splitTranche2Amount:
            state.treasuryAnalysis?.paymentAmount
              ? state.treasuryAnalysis.paymentAmount - scenario.lastSplitAmount
              : scenario.lastDeferAmount,
          expectedMidweekInflow: state.treasuryAnalysis?.expectedMidweekInflow,
          projectedBalanceAfterTranche1:
            state.treasuryAnalysis?.availableLiquidity
              ? state.treasuryAnalysis.availableLiquidity - scenario.lastSplitAmount
              : null,
          projectedFinalBalance:
            state.treasuryAnalysis?.projectedLowBalanceIfSplit,
          comfortThreshold: state.treasuryAnalysis?.comfortThreshold
        }
      : null;

  return JSON.stringify(
    {
      plan: state.plan,
      priceInfo: state.priceInfo,
      fxInfo: state.fxInfo,
      treasuryAnalysis: {
        ...state.treasuryAnalysis,
        ...(state.treasuryAnalysis?.usedUserAmount &&
        state.treasuryAnalysis.paymentAmount > 0
          ? {
              suggestedNowAmount: state.treasuryAnalysis.paymentAmount,
              suggestedLaterAmount: 0,
              urgentSupplierTotal: null,
              deferableSupplierTotal: null
            }
          : {})
      },
      scenario,
      splitCalculation: splitContext,
      knownFacts: state.knownFacts,
      userProfile: state.userProfile,
      conversationHistory: state.conversationHistory,
      userMessage: state.userMessage
    },
    null,
    2
  );
}




export async function runSynthesisAgent(
  llmClient: V3LlmClient,
  state: FinancialState
): Promise<string> {
  const dataContext = await buildDataContextAsync(state, llmClient);

  const historyText =
    state.conversationHistory?.length
      ? "\n\nRecent conversation:\n" +
        state.conversationHistory
          .slice(-6)
          .map(
            m =>
              `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 400)}`
          )
          .join("\n")
      : "";

  const messages: AgenticMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `
${historyText}

Current message:
"${state.userMessage}"

Financial data:
${dataContext}

Write a clear, professional response using only this information.
`
    }
  ];

  const output = await llmClient.chat(messages);

  return output?.trim()
    ? output.trim()
    : "I’m sorry — I couldn’t generate a response just now. Please try again.";
}