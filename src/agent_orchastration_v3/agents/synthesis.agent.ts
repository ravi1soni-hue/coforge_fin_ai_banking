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
    // Use last 10 messages (user and assistant) for context awareness
    const history = (state.conversationHistory ?? []).slice(-10).map(m => m.content.toLowerCase());
    const alreadyMentioned = (str: string) => history.some(msg => msg.includes(str.toLowerCase()));

    // Use LLM-driven scenario state with full conversation history
    const scenario = await extractScenarioStateLLM(state.conversationHistory ?? [], t, llmClient);
    // Strict anchoring: if user specified an amount, enforce it in all splits/summaries
    const userAmount = scenario.lastUserRequestedAmount;
    const isUserAmountSpecific = t.usedUserAmount && typeof userAmount === 'number' && userAmount > 0;
    if (isUserAmountSpecific) {
      parts.push(`(Note: You asked about £${userAmount.toLocaleString("en-GB")}, so all advice below is strictly about that amount.)`);
    } else if (!t.usedUserAmount) {
      parts.push(`(No amount specified by user, using total supplier run.)`);
    }

    // Helper: always use user-requested amount for splits if specific, else use total
    const splitNow = isUserAmountSpecific ? userAmount : t.urgentSupplierTotal;
    const splitLater = isUserAmountSpecific ? 0 : t.deferableSupplierTotal;

    let summary = "";

    // NEW: If user has confirmed scheduling, give a clear scheduled message and do not ask further questions
    if (scenario.userConfirmedSchedule && splitNow) {
      summary += `The batch has been scheduled for review.\n`;
      summary += `* £${splitNow.toLocaleString("en-GB")} is scheduled for today.`;
      if (splitLater > 0) summary += `\n* £${splitLater.toLocaleString("en-GB")} is scheduled for mid-week, pending cash confirmation.`;
      summary += `\nI’ll notify you before release and monitor for incoming receipts.`;
      parts.push(summary);
    }
    else if (scenario.userChoseSplit && splitNow) {
      summary += `Alright — here’s what that means.\n\n`;
      summary += `With £${splitNow.toLocaleString("en-GB")} released today:`;
      summary += `\n* Your projected cash position stays above your usual buffer all week.`;
      if (typeof t.projectedLowBalanceIfSplit === 'number') {
        summary += ` (projected low: £${t.projectedLowBalanceIfSplit.toLocaleString("en-GB")})`;
      }
      if (typeof t.historicalBuffer === 'number' && t.historicalBuffer > 0) {
        summary += `, which matches your historical buffer of £${t.historicalBuffer.toLocaleString("en-GB")}`;
      }
      summary += ".";
      if (splitLater > 0) {
        summary += `\nThe remaining £${splitLater.toLocaleString("en-GB")} can go mid-week, as long as at least £${t.minInflowForMidweekRelease.toLocaleString("en-GB")} of expected inflows arrive by then`;
        if (typeof t.releaseConditionHitRate10Weeks === 'number' && t.releaseConditionHitRate10Weeks > 0) {
          summary += ` — which has happened ${t.releaseConditionHitRate10Weeks} times out of the last 10 weeks`;
        }
        summary += ".";
      }
      summary += `\nI’ll:\n* Schedule £${splitNow.toLocaleString("en-GB")} for today`;
      if (splitLater > 0) summary += `\n* Prepare £${splitLater.toLocaleString("en-GB")} for mid-week, pending cash confirmation`;
      summary += `\n* Alert you automatically if receipts arrive earlier or later than expected`;
      summary += `\nBefore I proceed — do you want:\n* Final confirmation alerts, or\n* Auto-release on mid-week if cash arrives as expected?`;
      parts.push(summary);
    } else if (scenario.userChoseFullRelease) {
      let summary = "";
      summary += `You have £${t.availableLiquidity.toLocaleString("en-GB")} available.\n`;
      summary += `Releasing the full £${(isUserAmountSpecific ? userAmount : t.paymentAmount).toLocaleString("en-GB")} today is within safe limits.`;
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
      if (!alreadyMentioned((isUserAmountSpecific ? userAmount : t.paymentAmount).toLocaleString("en-GB"))) {
        summaryParts.push(`The £${(isUserAmountSpecific ? userAmount : t.paymentAmount).toLocaleString("en-GB")} supplier run is well within safe limits.`);
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
      // Only suggest split if user is ambiguous (no specific amount) or explicitly requested a split
      if (!isUserAmountSpecific && t.urgentSupplierTotal && t.deferableSupplierTotal && !alreadyMentioned("split")) {
        summaryParts.push(`If you want extra headroom, you could split the total supplier run: release £${t.urgentSupplierTotal.toLocaleString("en-GB")} now, defer £${t.deferableSupplierTotal.toLocaleString("en-GB")} until midweek.`);
        summaryParts.push(`Want to proceed with the full release, or set up a split for treasury approval?`);
      } else if (isUserAmountSpecific && scenario.userChoseSplit && !alreadyMentioned("split")) {
        // Only mention splitting the user amount if user explicitly chose split
        summaryParts.push(`If you want extra headroom, you could split the £${userAmount.toLocaleString("en-GB")} run into smaller batches (e.g., part now, part later).`);
        summaryParts.push(`Want to proceed with the full release, or set up a split for treasury approval?`);
      } else {
        // No split suggestion if user was specific and did not request a split
        summaryParts.push(`Would you like to proceed with the full release?`);
      }
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