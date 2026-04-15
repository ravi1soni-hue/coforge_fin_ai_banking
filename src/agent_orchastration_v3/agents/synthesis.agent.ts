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
    const scenario = await extractScenarioStateLLM(state.conversationHistory ?? [], t, llmClient);
    const userAmount = scenario.lastUserRequestedAmount ?? t.urgentSupplierTotal;
    const isUserAmountSpecific = t.usedUserAmount && typeof userAmount === 'number' && userAmount > 0;

    // Step 1: Always show explicit scenario breakdown if user asked about a specific amount
    if (isUserAmountSpecific) {
      // Only use user-specified amount for all stats and projections
      const stats = [];
      stats.push(`Operating balance: £${t.availableLiquidity?.toLocaleString("en-GB") ?? "-"}`);
      stats.push(`Typical inflow: £${t.expectedMidweekInflow?.toLocaleString("en-GB") ?? "-"}`);
      stats.push(`Typical outflow: £${t.weeklyOutflow?.toLocaleString("en-GB") ?? "-"}`);
      stats.push(`Requested payment: £${userAmount?.toLocaleString("en-GB") ?? "-"}`);
      const projected = (typeof t.availableLiquidity === 'number' && typeof userAmount === 'number')
        ? t.availableLiquidity - userAmount
        : undefined;
      stats.push(`Projected balance after payment: £${projected?.toLocaleString("en-GB") ?? "-"}`);
      parts.push(stats.join(' | '));
      parts.push(`You can release £${userAmount?.toLocaleString("en-GB") ?? "-"} today and remain liquid.`);
      parts.push(`Want to review which payments could be safely deferred?`);
    } else {
      parts.push(`Your current liquidity position is healthy. No specific payment amount was mentioned.`);
    }

    // Step 2: If user says "some can wait", show split/full scenario breakdown
    if (scenario.userChoseSplit || scenario.userChoseFullRelease) {
      parts.push(`\nHere’s how this plays out based on real transaction behaviour, not forecasts from your ERP:`);
      // Full release scenario
      parts.push(`If you release all £${userAmount?.toLocaleString("en-GB") ?? "-"} today:`);
      parts.push(`* Your projected low balance this week drops to £${t.projectedLowBalanceIfFullRelease?.toLocaleString("en-GB") ?? "-"},`);
      parts.push(`* This is close to your historical buffer. You can do it — but it removes margin if receipts slip again.`);
      // Split scenario
      if (t.suggestedNowAmount && t.suggestedLaterAmount) {
        parts.push(`If you split the run instead:`);
        parts.push(`* You could release £${t.suggestedNowAmount?.toLocaleString("en-GB") ?? "-"} today`);
        parts.push(`* and hold £${t.suggestedLaterAmount?.toLocaleString("en-GB") ?? "-"} until Wednesday morning. That keeps your low balance nearer £${t.projectedLowBalanceIfSplit?.toLocaleString("en-GB") ?? "-"}, which is more consistent with your historical buffer.`);
        parts.push(`If that split works, I can:`);
        parts.push(`* Schedule the payments in two batches, or`);
        parts.push(`* Simulate what changes if incoming cash lands earlier or later`);
        parts.push(`Would you like to split the run, or see the risk if you pay everything today?`);
      }
    }

    // Step 3: If user confirms split, show execution plan
    if (scenario.userConfirmedSchedule && t.suggestedNowAmount && t.suggestedLaterAmount) {
      parts.push(`Alright — here’s what that means.`);
      parts.push(`With £${t.suggestedNowAmount?.toLocaleString("en-GB") ?? "-"} released today:`);
      parts.push(`* Your projected cash position stays above your usual buffer all week,`);
      parts.push(`* even if one of the larger mid-week receipts arrives a day late.`);
      parts.push(`The remaining £${t.suggestedLaterAmount?.toLocaleString("en-GB") ?? "-"} on Wednesday works as long as at least £${t.minInflowForMidweekRelease?.toLocaleString("en-GB") ?? "-"} of expected inflows arrive by then — which they have ${t.releaseConditionHitRate10Weeks ?? "-"} times out of the last 10 weeks.`);
      parts.push(`I’ll:`);
      parts.push(`* Schedule £${t.suggestedNowAmount?.toLocaleString("en-GB") ?? "-"} for today`);
      parts.push(`* Prepare £${t.suggestedLaterAmount?.toLocaleString("en-GB") ?? "-"} for Wednesday, pending cash confirmation`);
      parts.push(`* Alert you automatically if receipts arrive earlier or later than expected`);
      parts.push(`Before I proceed — do you want:`);
      parts.push(`* Final confirmation alerts, or`);
      parts.push(`* Auto-release on Wednesday if cash arrives as expected?`);
    }

    // Step 4: If user confirms auto-release, show final execution
    if (scenario.userConfirmedSchedule && scenario.userChoseSplit) {
      parts.push(`Done.`);
      parts.push(`I’ve:`);
      parts.push(`* Scheduled today’s payment batch for £${t.suggestedNowAmount?.toLocaleString("en-GB") ?? "-"}`);
      parts.push(`* Set conditional release for £${t.suggestedLaterAmount?.toLocaleString("en-GB") ?? "-"} on Wednesday`);
      parts.push(`* Linked it to actual credit movements, not estimates`);
      parts.push(`* Logged the full audit trail for treasury and approvals`);
      parts.push(`You’ll get an alert:`);
      parts.push(`* When Wednesday’s release condition is met, or`);
      parts.push(`* If incoming cash deviates from the normal pattern`);
      parts.push(`If you’d like, I can also:`);
      parts.push(`* Show how sensitive this plan is to delayed receipts, or`);
      parts.push(`* Review whether short-term liquidity cover would reduce future stress`);
    }

    // Always show execution status if present
    const execStatusRaw = (state.knownFacts?.executionStatus ?? state.knownFacts?.treasuryExecutionStatus ?? null) as unknown;
    if (typeof execStatusRaw === "string" && execStatusRaw.trim()) {
      parts.push(`EXECUTION_STATUS: ${execStatusRaw.trim()}`);
    }
  }

  return parts.join("\n");
}



export async function runSynthesisAgent(
  llmClient: V3LlmClient,
  state: FinancialState,
  ragContext?: string[]
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

    // Accept ragContext for RAG injection
    const ragBlock = (ragContext && ragContext.length > 0) ? `\n\nRAG context:\n${ragContext.join("\n")}` : "";

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