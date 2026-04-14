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

function buildDataContext(state: FinancialState): string {
  const parts: string[] = [];
  const isTreasuryFlow = Boolean(state.treasuryAnalysis);
  const homeCurrency =
    state.userProfile?.homeCurrency ??
    state.plan?.userHomeCurrency ??
    "GBP";

  // Count prior assistant turns — reliable, no text-matching
  const priorAssistantTurns = (state.conversationHistory ?? []).filter(
    (m) => m.role === "assistant"
  ).length;

  // --- User financial profile ---
  // ...existing code...

  // --- Conversation subject (MUST appear first so LLM knows the topic) ---
  if (state.plan?.product) {
    parts.push(`SUBJECT: ${state.plan.product}`);
    parts.push(`(Answer ONLY about "${state.plan.product}" — do not mention any other product)`);
  }

  // --- Price info ---
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

  // --- FX info ---
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

  // ...existing code...

  // --- Treasury/corporate conversational context ---
  if (state.treasuryAnalysis) {
    const t = state.treasuryAnalysis;
    // Check last 2 assistant messages for repeated facts
    const history = (state.conversationHistory ?? []).filter(m => m.role === "assistant").slice(-2).map(m => m.content.toLowerCase());
    const alreadyMentioned = (str: string) => history.some(msg => msg.includes(str.toLowerCase()));

    let summaryParts: string[] = [];
    // Only mention liquidity if not just stated
    if (!alreadyMentioned(t.availableLiquidity.toLocaleString("en-GB"))) {
      summaryParts.push(`You have £${t.availableLiquidity.toLocaleString("en-GB")} available.`);
    }
    // Only mention comfort threshold if not just stated
    if (!alreadyMentioned(t.comfortThreshold.toLocaleString("en-GB"))) {
      summaryParts.push(`Your comfort threshold is £${t.comfortThreshold.toLocaleString("en-GB")}.`);
    }
    // Only mention payment amount if not just stated
    if (!alreadyMentioned(t.paymentAmount.toLocaleString("en-GB"))) {
      summaryParts.push(`The £${t.paymentAmount.toLocaleString("en-GB")} supplier run is well within safe limits.`);
    }
    // Only mention inflow reliability if not just stated
    if (t.lateInflowEventsLast4Weeks > 0) {
      if (!alreadyMentioned("late inflows")) {
        summaryParts.push(`There have been some late inflows recently, but even if midweek receipts are delayed, your lowest balance stays above £${typeof t.projectedLowIfLateInflow === 'number' ? t.projectedLowIfLateInflow.toLocaleString("en-GB") : t.projectedLowBalance.toLocaleString("en-GB")}.`);
      }
    } else {
      if (!alreadyMentioned("midweek inflows")) {
        summaryParts.push(`Even if midweek inflows are late, your lowest balance would be about £${typeof t.projectedLowIfLateInflow === 'number' ? t.projectedLowIfLateInflow.toLocaleString("en-GB") : t.projectedLowBalance.toLocaleString("en-GB")}.`);
      }
    }
    // Only mention split option if not just stated
    if (t.urgentSupplierTotal && t.deferableSupplierTotal && !alreadyMentioned("split")) {
      summaryParts.push(`If you want extra headroom, you could split: release £${t.urgentSupplierTotal.toLocaleString("en-GB")} now, defer £${t.deferableSupplierTotal.toLocaleString("en-GB")} until midweek.`);
    }
    // Always end with an actionable next step
    summaryParts.push(`Want to proceed with the full release, or set up a split for treasury approval?`);
    // Truncate to ~120 words
    let summary = summaryParts.join(' ');
    const words = summary.split(/\s+/);
    if (words.length > 120) summary = words.slice(0, 120).join(' ') + '...';
    parts.push(summary);
  }

  const execStatusRaw = (state.knownFacts?.executionStatus ?? state.knownFacts?.treasuryExecutionStatus ?? null) as unknown;
  if (typeof execStatusRaw === "string" && execStatusRaw.trim()) {
    parts.push(`EXECUTION_STATUS: ${execStatusRaw.trim()}`);
  }

  return parts.join("\n");
}

export async function runSynthesisAgent(
  llmClient: V3LlmClient,
  state: FinancialState
): Promise<string> {
  const dataContext = buildDataContext(state);

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