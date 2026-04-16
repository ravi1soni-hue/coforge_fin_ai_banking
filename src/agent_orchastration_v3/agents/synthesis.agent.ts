/**
 * Synthesis Agent — final response generation (ANCHOR-SAFE).
 *
 * FINAL INVARIANT:
 * - treasuryAnchorAmount is the ONLY amount that may be discussed
 * - LLMs may determine intent/state, NEVER numbers
 */

import type { V3LlmClient } from "../llm/v3LlmClient.js";
import type { AgenticMessage } from "../types.js";
import type { FinancialState } from "../graph/state.js";

// ─────────────────────────────────────────────────────────────────────────────
// LLM-driven scenario flags ONLY (NO NUMBERS)
// ─────────────────────────────────────────────────────────────────────────────

async function extractScenarioFlagsLLM(
  conversationHistory: { role: string; content: string }[],
  llmClient: V3LlmClient
) {
  const prompt = `You are a treasury assistant.

From the conversation, extract ONLY these boolean flags:

{
  "userChoseSplit": boolean,
  "userChoseFullRelease": boolean,
  "userRequestedSimulation": boolean,
  "userConfirmedSchedule": boolean
}

Rules:
- Do NOT extract or infer any numbers
- Do NOT mention amounts
- If unsure, set false
- Respond ONLY with JSON

Conversation:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join("\n")}
`;

  try {
    const raw = await llmClient.chat([
      { role: "system", content: "You extract intent flags only." },
      { role: "user", content: prompt }
    ]);

    const parsed = JSON.parse(raw);
    return {
      userChoseSplit: Boolean(parsed.userChoseSplit),
      userChoseFullRelease: Boolean(parsed.userChoseFullRelease),
      userRequestedSimulation: Boolean(parsed.userRequestedSimulation),
      userConfirmedSchedule: Boolean(parsed.userConfirmedSchedule),
    };
  } catch {
    return {
      userChoseSplit: false,
      userChoseFullRelease: false,
      userRequestedSimulation: false,
      userConfirmedSchedule: false,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are a UK treasury and corporate cashflow assistant.

Rules:
- Answer ONLY corporate / treasury payment-run questions
- Use ONLY the financial data provided
- Never invent numbers
- Never change amounts
- Keep tone clear, neutral, and conversational
- Always reference analysis being based on real bank transaction behaviour
`;

// ─────────────────────────────────────────────────────────────────────────────
// Data context builder (ANCHOR ENFORCED)
// ─────────────────────────────────────────────────────────────────────────────

export async function buildDataContextAsync(
  state: FinancialState,
  llmClient: V3LlmClient
): Promise<string> {

  const parts: string[] = [];

  if (!state.treasuryAnalysis || state.treasuryAnchorAmount === null) {
    throw new Error(
      "[SynthesisAgent] Treasury synthesis requires treasuryAnalysis + treasuryAnchorAmount"
    );
  }

  const t = state.treasuryAnalysis;
  const anchorAmount = state.treasuryAnchorAmount;
  const currency = state.treasuryAnchorCurrency ?? "GBP";

  // 🔒 HARD ENFORCEMENT
  t.paymentAmount = anchorAmount;
  t.currency = currency;
  t.suggestedLaterAmount =
    anchorAmount - t.suggestedNowAmount;

  // ── Scenario flags (NO NUMBERS) ───────────────────────────────────
  const scenario = await extractScenarioFlagsLLM(
    state.conversationHistory ?? [],
    llmClient
  );

  // ── Core facts ────────────────────────────────────────────────────
  parts.push(
    `You are analysing a £${anchorAmount.toLocaleString("en-GB")} supplier payment run.`
  );

  parts.push(
    `Available liquidity is £${t.availableLiquidity.toLocaleString("en-GB")}, with a comfort threshold of £${t.comfortThreshold.toLocaleString("en-GB")}.`
  );

  // ── Conditional narratives ────────────────────────────────────────

  if (scenario.userConfirmedSchedule) {
    parts.push(
      `The user has asked to schedule the split. £${t.suggestedNowAmount.toLocaleString("en-GB")} is prepared for today, with the remainder held pending inflows.`
    );
  }
  else if (scenario.userChoseSplit) {
    parts.push(
      `A split release is requested. £${t.suggestedNowAmount.toLocaleString("en-GB")} today keeps projected balances above £${t.projectedLowBalanceIfSplit.toLocaleString("en-GB")}.`
    );

    parts.push(
      `The remaining £${t.suggestedLaterAmount.toLocaleString("en-GB")} can be released mid-week if inflows of at least £${t.minInflowForMidweekRelease.toLocaleString("en-GB")} arrive, which has occurred ${t.releaseConditionHitRate10Weeks} times in the last 10 weeks.`
    );
  }
  else if (scenario.userChoseFullRelease) {
    parts.push(
      `Releasing the full £${anchorAmount.toLocaleString("en-GB")} today leaves a projected low balance of £${t.projectedLowBalanceIfFullRelease.toLocaleString("en-GB")}.`
    );
  }
  else {
    parts.push(
      `Releasing £${anchorAmount.toLocaleString("en-GB")} today is within safe limits.`
    );

    if (t.riskLevel !== "SAFE") {
      parts.push(
        `If you prefer extra headroom, a split release can further reduce short-term liquidity risk.`
      );
    }

    parts.push(
      `Would you like to proceed with the full release, or set up a split for treasury approval?`
    );
  }

  // ── Execution status (if present) ─────────────────────────────────
  const execStatus =
    state.knownFacts?.executionStatus ??
    state.knownFacts?.treasuryExecutionStatus;

  if (typeof execStatus === "string" && execStatus.trim()) {
    parts.push(`EXECUTION_STATUS: ${execStatus}`);
  }

  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Synthesis Agent
// ─────────────────────────────────────────────────────────────────────────────

export async function runSynthesisAgent(
  llmClient: V3LlmClient,
  state: FinancialState
): Promise<string> {

  const dataContext = await buildDataContextAsync(state, llmClient);

  const historyText =
    state.conversationHistory && state.conversationHistory.length > 0
      ? "\n\nConversation history:\n" +
        state.conversationHistory
          .slice(-6)
          .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
          .join("\n")
      : "";

  const messages: AgenticMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${historyText}

Current message: "${state.userMessage}"

Treasury context:
${dataContext}

Write a clear, natural response.`,
    },
  ];

  const finalText = await llmClient.chat(messages);

  return finalText.trim() ||
    "Sorry — I couldn’t generate a response just now.";
}