// LLM-driven scenario state extraction for agentic memory
import { OpenAI } from "openai";

async function extractScenarioStateLLM(conversationHistory: {role: string, content: string}[], treasuryAnalysis: any, llmClient: V3LlmClient) {
  // Compose a prompt for the LLM to extract scenario state
  const prompt = `You are an agentic treasury assistant. Given the following conversation history, extract the current scenario state as a JSON object with these fields:
  - userChoseSplit (boolean)
  - userChoseFullRelease (boolean)
  - userRequestedSimulation (boolean)
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
    return scenario;
  } catch {
    // Fallback: return empty/default scenario
    return {
      userChoseSplit: false,
      userChoseFullRelease: false,
      userRequestedSimulation: false,
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
- Explain cashflow, payment, and liquidity decisions in clear, conversational UK English.
- If riskLevel is CAUTION or HIGH_RISK, suggest a two-batch release using the suggested amounts, and explain why simply.
- If the user asks to execute or schedule, do not claim execution is complete unless EXECUTION_STATUS is explicitly provided.
- Always mention that the analysis is based on real bank transaction behaviour (cashflow, supplier, and snapshot data), but do so conversationally.
// Never mention savings, retail, or personal context. (removed retail/personal context)
- Do not generate EMI, instalment, or product purchase plans.
- Do not answer non-corporate/treasury questions.
- Keep the tone friendly, clear, and neutral.
`;

// Async version: buildDataContext with LLM-driven scenario extraction
export async function buildDataContextAsync(state: FinancialState, llmClient: V3LlmClient): Promise<string> {
  const parts: string[] = [];
  const isTreasuryFlow = Boolean(state.treasuryAnalysis);
  const homeCurrency =
    state.userProfile?.homeCurrency ??
    state.plan?.userHomeCurrency ??
    "GBP";

  if (state.plan?.product) {
    parts.push(`SUBJECT: ${state.plan.product}`);
    parts.push(`(Answer ONLY about "${state.plan.product}" — do not mention any other product)`);
  }

  if (state.priceInfo && state.priceInfo.price > 0) {
    parts.push(
      `PRICE: ${state.plan?.product ?? "Item"} = ${state.priceInfo.price.toLocaleString(
        "en-GB"
      )} ${state.priceInfo.currency} (source: ${state.priceInfo.source})`
    );
  } else if (state.priceInfo && state.priceInfo.price === 0) {
    parts.push(
      `PRICE: No verified price found. Ask the user to confirm the amount instead of estimating.`
    );
  }

  if (state.fxInfo) {
    parts.push(
      `EXCHANGE RATE: 1 ${state.fxInfo.from} = ${state.fxInfo.rate.toFixed(
        4
      )} ${state.fxInfo.to}`
    );

    if (state.priceInfo && state.priceInfo.price > 0) {
      const converted = state.priceInfo.price * state.fxInfo.rate;
      parts.push(
        `CONVERTED PRICE: ${converted.toFixed(2)} ${state.fxInfo.to}`
      );
    }
  }

  if (state.treasuryAnalysis) {
    const t = state.treasuryAnalysis;
    const history = (state.conversationHistory ?? []).filter(m => m.role === "assistant").slice(-2).map(m => m.content.toLowerCase());
    const alreadyMentioned = (str: string) => history.some(msg => msg.includes(str.toLowerCase()));

    // Use LLM-driven scenario state
    const scenario = await extractScenarioStateLLM(state.conversationHistory ?? [], t, llmClient);

    let summary = "";

    if (scenario.userChoseSplit && t.suggestedNowAmount && t.suggestedLaterAmount) {
      summary += `Alright — here’s what that means.\n\n`;
      summary += `With £${t.suggestedNowAmount.toLocaleString("en-GB")} released today:`;
      summary += `\n* Your projected cash position stays above your usual buffer all week`;
      if (typeof t.projectedLowBalanceIfSplit === 'number') {
        summary += ` (projected low: £${t.projectedLowBalanceIfSplit.toLocaleString("en-GB")})`;
      }
      if (typeof t.historicalBuffer === 'number' && t.historicalBuffer > 0) {
        summary += `, which matches your historical buffer of £${t.historicalBuffer.toLocaleString("en-GB")}`;
      }
      summary += ".";
      if (t.suggestedLaterAmount > 0) {
        summary += `\nThe remaining £${t.suggestedLaterAmount.toLocaleString("en-GB")} can go mid-week, as long as at least £${t.minInflowForMidweekRelease.toLocaleString("en-GB")} of expected inflows arrive by then`;
        if (typeof t.releaseConditionHitRate10Weeks === 'number' && t.releaseConditionHitRate10Weeks > 0) {
          summary += ` — which has happened ${t.releaseConditionHitRate10Weeks} times out of the last 10 weeks`;
        }
        summary += ".";
      }
      summary += `\nI’ll:\n* Schedule £${t.suggestedNowAmount.toLocaleString("en-GB")} for today\n* Prepare £${t.suggestedLaterAmount.toLocaleString("en-GB")} for mid-week, pending cash confirmation`;
      summary += `\n* Alert you automatically if receipts arrive earlier or later than expected`;
      summary += `\nBefore I proceed — do you want:\n* Final confirmation alerts, or\n* Auto-release on mid-week if cash arrives as expected?`;
      parts.push(summary);
    } else if (scenario.userChoseFullRelease) {
      let summary = "";
      summary += `You have £${t.availableLiquidity.toLocaleString("en-GB")} available.\n`;
      summary += `Releasing the full £${t.paymentAmount.toLocaleString("en-GB")} today is within safe limits.`;
      if (typeof t.projectedLowBalanceIfFullRelease === 'number') {
        summary += ` Your projected low balance is £${t.projectedLowBalanceIfFullRelease.toLocaleString("en-GB")}.`;
      }
      summary += `\nWould you like to proceed with the full release, or see a split scenario for extra buffer?`;
      parts.push(summary);
    } else {
      let summaryParts: string[] = [];
      if (!alreadyMentioned(t.availableLiquidity.toLocaleString("en-GB"))) {
        summaryParts.push(`You have £${t.availableLiquidity.toLocaleString("en-GB")} available.`);
      }
      if (!alreadyMentioned(t.comfortThreshold.toLocaleString("en-GB"))) {
        summaryParts.push(`Your comfort threshold is £${t.comfortThreshold.toLocaleString("en-GB")}.`);
      }
      if (!alreadyMentioned(t.paymentAmount.toLocaleString("en-GB"))) {
        summaryParts.push(`The £${t.paymentAmount.toLocaleString("en-GB")} supplier run is well within safe limits.`);
      }
      if (t.lateInflowEventsLast4Weeks > 0) {
        if (!alreadyMentioned("late inflows")) {
          summaryParts.push(`There have been some late inflows recently, but even if midweek receipts are delayed, your lowest balance stays above £${typeof t.projectedLowIfLateInflow === 'number' ? t.projectedLowIfLateInflow.toLocaleString("en-GB") : t.projectedLowBalance.toLocaleString("en-GB")}.`);
        }
      } else {
        if (!alreadyMentioned("midweek inflows")) {
          summaryParts.push(`Even if midweek inflows are late, your lowest balance would be about £${typeof t.projectedLowIfLateInflow === 'number' ? t.projectedLowIfLateInflow.toLocaleString("en-GB") : t.projectedLowBalance.toLocaleString("en-GB")}.`);
        }
      }
      if (t.urgentSupplierTotal && t.deferableSupplierTotal && !alreadyMentioned("split")) {
        summaryParts.push(`If you want extra headroom, you could split: release £${t.urgentSupplierTotal.toLocaleString("en-GB")} now, defer £${t.deferableSupplierTotal.toLocaleString("en-GB")} until midweek.`);
      }
      summaryParts.push(`Want to proceed with the full release, or set up a split for treasury approval?`);
      let joined = summaryParts.join(' ');
      const words = joined.split(/\s+/);
      if (words.length > 120) joined = words.slice(0, 120).join(' ') + '...';
      parts.push(joined);
    }

    const execStatusRaw = (state.knownFacts?.executionStatus ?? state.knownFacts?.treasuryExecutionStatus ?? null) as unknown;
    if (typeof execStatusRaw === "string" && execStatusRaw.trim()) {
      parts.push(`EXECUTION_STATUS: ${execStatusRaw.trim()}`);
    }
  }

  return parts.join("\n");
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