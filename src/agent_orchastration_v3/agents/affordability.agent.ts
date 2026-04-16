/**
 * Affordability Agent — intelligent retail financial analysis.
 *
 * IMPORTANT INVARIANT:
 * - This agent must NEVER run for corporate / treasury flows.
 * - Treasury questions use liquidity analysis, not affordability.
 */

import type { V3LlmClient } from "../llm/v3LlmClient.js";
import type { AgenticMessage } from "../types.js";
import type { FinancialState, AffordabilityInfo } from "../graph/state.js";

const SYSTEM_PROMPT = `You are an expert UK personal finance advisor.

Analyse whether the user can afford the described purchase based on their
financial profile.

Respond with ONLY this JSON (no explanation, no markdown):
{
  "verdict": "<'SAFE'|'BORDERLINE'|'RISKY'>",
  "priceInHomeCurrency": <number rounded to nearest whole number>,
  "canAfford": <true|false>,
  "analysis": "<3-5 sentences of specific, number-based analysis>",
  "emiSuggested": <true|false>
}

Verdict guidance (apply intelligently):
- SAFE        → affordable with comfortable buffer
- BORDERLINE  → affordable but tight, consider caution
- RISKY       → would materially strain savings or cashflow

Cite numbers from the profile wherever possible.`;

export async function runAffordabilityAgent(
  llmClient: V3LlmClient,
  state: FinancialState
): Promise<AffordabilityInfo> {

  // ── 🚨 HARD SAFETY GUARD — TREASURY MUST NEVER ENTER HERE ──────────
  if (state.intentType === "corporate_treasury") {
    throw new Error(
      "[AffordabilityAgent] Invalid invocation: affordability analysis must not run for treasury flows."
    );
  }

  // ── Required inputs ──────────────────────────────────────────────
  const profile = state.userProfile;
  const plan    = state.plan;
  const price   = state.priceInfo;
  const fx      = state.fxInfo;

  if (!plan) {
    throw new Error("[AffordabilityAgent] Missing supervisor plan.");
  }

  if (!profile) {
    throw new Error("[AffordabilityAgent] Missing user profile.");
  }

  if (!price || price.price <= 0) {
    throw new Error(
      "[AffordabilityAgent] No valid price available for affordability analysis."
    );
  }

  // ── Financial snapshot ───────────────────────────────────────────
  const savings  = Number(profile.availableLiquidity ?? 0);
  const income   = Number(profile.monthlyIncome ?? 0);
  const expenses = Number(profile.monthlyExpenses ?? 0);
  const surplus  =
    Number(profile.netMonthlySurplus ?? (income - expenses));

  const currency =
    String(profile.homeCurrency ?? plan.userHomeCurrency ?? "GBP");

  // ── ✅ Anchor-safe price calculation (RETAIL ONLY) ────────────────
  let priceInHome = price.price;

  if (fx && price.currency !== currency) {
    priceInHome = price.price * fx.rate;
  }

  priceInHome = Math.round(priceInHome);

  // ── LLM prompt ───────────────────────────────────────────────────
  const messages: AgenticMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `User question:
"${state.userMessage}"

User financial profile:
- Available savings:   ${savings.toLocaleString("en-GB")} ${currency}
- Monthly income:      ${income > 0 ? `${income.toLocaleString("en-GB")} ${currency}` : "not specified"}
- Monthly expenses:    ${expenses > 0 ? `${expenses.toLocaleString("en-GB")} ${currency}` : "not specified"}
- Net monthly surplus: ${surplus > 0 ? `${surplus.toLocaleString("en-GB")} ${currency}` : "not specified"}

Purchase:
- Item: ${plan.product ?? "item"}
- Price: ${price.price.toLocaleString("en-GB")} ${price.currency}
- Estimated price in ${currency}: ${priceInHome.toLocaleString("en-GB")} ${currency}

Provide a detailed affordability assessment.`,
    },
  ];

  console.log("[AffordabilityAgent] Running retail affordability analysis...");

  // ── LLM call ─────────────────────────────────────────────────────
  let parsed: Record<string, unknown> | null = null;

  try {
    parsed = await llmClient.chatJSON<Record<string, unknown>>(messages);
  } catch {
    parsed = null;
  }

  // ── Parse & validate output ──────────────────────────────────────
  if (
    parsed?.verdict &&
    ["SAFE", "BORDERLINE", "RISKY"].includes(parsed.verdict as string)
  ) {
    return {
      verdict:             parsed.verdict as AffordabilityInfo["verdict"],
      priceInHomeCurrency: Number(parsed.priceInHomeCurrency ?? priceInHome),
      canAfford:           Boolean(parsed.canAfford),
      analysis:            String(parsed.analysis ?? "Unable to generate analysis."),
      emiSuggested:        Boolean(parsed.emiSuggested),
    };
  }

  // ── Fallback (defensive) ─────────────────────────────────────────
  console.warn(
    "[AffordabilityAgent] Invalid LLM response — defaulting to RISKY."
  );

  return {
    verdict: "RISKY",
    priceInHomeCurrency: priceInHome,
    canAfford: false,
    analysis:
      "A reliable affordability assessment could not be completed with the available information.",
    emiSuggested: true,
  };
}