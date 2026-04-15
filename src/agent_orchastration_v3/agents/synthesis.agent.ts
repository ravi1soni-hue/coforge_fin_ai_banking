// LLM-driven scenario state extraction for agentic memory
import { OpenAI } from "openai";

async function extractScenarioStateLLM(conversationHistory: {role: string, content: string}[], treasuryAnalysis: any, llmClient: V3LlmClient) {
  // Compose a prompt for the LLM to extract scenario state
  const prompt = `You are an agentic treasury assistant. Given the following conversation history, extract the current scenario state as a JSON object with these fields:
  - userChoseSplit (boolean)
  - userChoseFullRelease (boolean)
  - userRequestedSimulation (boolean)
  - userConfirmedSchedule (boolean) // true if the user has confirmed or requested to schedule, in any wording
  - lastSplitAmount (number|null)
  - lastDeferAmount (number|null)
  - lastUrgentAmount (number|null)
  - lastUserMessage (string)
  Respond ONLY with a valid JSON object.

Conversation history:
${conversationHistory.map(t => `${t.role}: ${t.content}`).join("\n")}
`;
  const response = await llmClient.chat([
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: prompt }
  ]);
  try {
    const scenario = JSON.parse(response);
    // Fallback to treasuryAnalysis if needed
    if (!scenario.lastSplitAmount && treasuryAnalysis?.suggestedNowAmount) scenario.lastSplitAmount = treasuryAnalysis.suggestedNowAmount;
    if (!scenario.lastDeferAmount && treasuryAnalysis?.suggestedLaterAmount) scenario.lastDeferAmount = treasuryAnalysis.suggestedLaterAmount;
    // Ensure userConfirmedSchedule is always present
    if (typeof scenario.userConfirmedSchedule !== "boolean") scenario.userConfirmedSchedule = false;
    return scenario;
  } catch {
    // Fallback: return empty/default scenario
    return {
      userChoseSplit: false,
      userChoseFullRelease: false,
      userRequestedSimulation: false,
      userConfirmedSchedule: false,
      lastSplitAmount: treasuryAnalysis?.suggestedNowAmount ?? null,
      lastDeferAmount: treasuryAnalysis?.suggestedLaterAmount ?? null,
      lastUrgentAmount: null,
      lastUserMessage: conversationHistory.filter(t => t.role === "user").slice(-1)[0]?.content || ""
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
 You are a treasury/corporate cashflow assistant. Only answer corporate/treasury payment-run and liquidity questions.
 
 Rules:
 - Use only the treasury analysis data provided.
 - Explain cashflow, payment, and liquidity decisions in clear, natural, conversational UK English — as if you are a trusted finance colleague, not a chatbot.
- Keep your reply under 100 words, focused and human, not robotic or list-based. Do NOT use bullet points or lists—write a single, natural conversational paragraph.
- If riskLevel is CAUTION or HIGH_RISK, suggest a two-batch release using the suggested amounts, and explain why simply.
- If the user asks to execute or schedule, do not claim execution is complete unless EXECUTION_STATUS is explicitly provided.
- Always mention that the analysis is based on real bank transaction behaviour (cashflow, supplier, and snapshot data), but do so conversationally.
- Never mention savings, retail, or personal context.
- Do not generate EMI, instalment, or product purchase plans.
- Do not answer non-corporate/treasury questions.
- Keep the tone friendly, clear, and neutral.
`;

// Async version: buildDataContext with LLM-driven scenario extraction
export async function buildDataContextAsync(state: FinancialState, llmClient: V3LlmClient): Promise<string> {
  // Build a structured context for the LLM
  const context: any = {
    plan: state.plan,
    priceInfo: state.priceInfo,
    fxInfo: state.fxInfo,
    treasuryAnalysis: state.treasuryAnalysis,
    scenario: state.treasuryAnalysis
      ? await extractScenarioStateLLM(state.conversationHistory ?? [], state.treasuryAnalysis, llmClient)
      : null,
    knownFacts: state.knownFacts,
    userProfile: state.userProfile,
    conversationHistory: state.conversationHistory,
    userMessage: state.userMessage
  };
  return JSON.stringify(context, null, 2);
}



export async function runSynthesisAgent(
  llmClient: V3LlmClient,
  state: FinancialState
): Promise<string> {
  const dataContext = await buildDataContextAsync(state, llmClient);

  const historyText =
    state.conversationHistory && state.conversationHistory.length > 0
      ? "\n\nConversation history (most recent last):\n" +
        state.conversationHistory
          .slice(-6)
          .map(
            (m) =>
              `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(
                0,
                400
              )}`
          )
          .join("\n")
      : "";

  const messages: AgenticMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${historyText}

Current message: "${state.userMessage}"

Financial data:
${dataContext}

Write a clear, natural response using this information.`,
    },
  ];

  const finalText = await llmClient.chat(messages);

  return finalText.trim()
    ? finalText
    : "Sorry — I couldn’t generate a response just now. Please try again.";
}