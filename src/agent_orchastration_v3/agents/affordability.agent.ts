/**
 * Affordability Agent — intelligent financial analysis.
 *
 * Takes the user profile + price + FX data and uses LLM reasoning to produce
 * a structured affordability verdict.  Nothing is hardcoded — the LLM evaluates
 * the full financial picture intelligently.
 *
 * Returns a structured AffordabilityInfo that the synthesis agent uses to
 * generate the final narrative.
 */

import type { V3LlmClient } from "../llm/v3LlmClient.js";
import type { AgenticMessage } from "../types.js";
import type { FinancialState, AffordabilityInfo } from "../graph/state.js";
import { sanitizeUserInput } from "../../utils/sanitizeUserInput.js";

const SYSTEM_PROMPT = `You are a warm, conversational financial advisor. Detect the user's intent (affordability, investment, etc.) and respond naturally:
 - For affordability, analyze the user's financial profile and purchase details, and provide a clear, friendly verdict (SAFE, BORDERLINE, RISKY) with a warm, specific explanation. Use numbers only when relevant, and never repeat them unnecessarily.
 - For investment or other queries, summarize findings conversationally, not as a list or script.
 - Use natural transitions and acknowledgments (e.g., "Based on your profile...", "Here's what this means for you...").
 - Never sound scripted or robotic. Avoid rigid lists, bullet points, or repeated phrases.
 - If you need more info, ask a single, clear follow-up question, but never more than 2 per topic. After that, summarize and close.
 - Always adapt your tone and content to the user's intent and conversation history.
 - If the user changes topic, reset context and respond accordingly.
 - Never repeat the user's question. Never use phrases like "to be honest" or "the good news is". Never role-play.
 - Your output will be checked for warmth, clarity, and natural flow.`

export async function runAffordabilityAgent(
  llmClient: V3LlmClient,
  state: FinancialState,
): Promise<AffordabilityInfo> {
  const profile = state.userProfile ;
  const plan    = state.plan!;
  const price   = state.priceInfo;
  const fx      = state.fxInfo;

  const savings   = Number(profile?.availableSavings ?? 0);
  const income    = Number(profile?.monthlyIncome    ?? 0);
  const expenses  = Number(profile?.monthlyExpenses  ?? 0);
  const surplus   = Number(profile?.netMonthlySurplus ?? (income - expenses));
  const currency  = String(profile?.homeCurrency ?? plan.userHomeCurrency ?? "GBP");

  // Calculate price in home currency
  let priceInHome = price?.price ?? 0;
  if (fx && price && price.currency !== currency) {
    priceInHome = price.price * fx.rate;
  }
  priceInHome = Math.round(priceInHome);

  // Sanitize the user message before LLM call
  const sanitizedUserMessage = sanitizeUserInput(state.userMessage);
  const messages: AgenticMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `User question: "${sanitizedUserMessage}"

User financial profile:
- Available savings:   ${savings.toLocaleString("en-GB")} ${currency}
- Monthly income:      ${income > 0 ? `${income.toLocaleString("en-GB")} ${currency}` : "not specified"}
- Monthly expenses:    ${expenses > 0 ? `${expenses.toLocaleString("en-GB")} ${currency}` : "not specified"}
- Net monthly surplus: ${surplus > 0 ? `${surplus.toLocaleString("en-GB")} ${currency}` : "not specified"}

Purchase details:
- Item: ${plan.product ?? "item"}
- Listed price: ${price?.price ?? "unknown"} ${price?.currency ?? "unknown"} (confidence: ${price?.confidence ?? "unknown"})
${fx ? `- Exchange rate: 1 ${fx.from} = ${fx.rate.toFixed(4)} ${fx.to}` : ""}
- Estimated price in ${currency}: ${priceInHome.toLocaleString("en-GB")} ${currency}

Provide a detailed affordability assessment.`,
    },
  ];

  console.log("[AffordabilityAgent] Calling LLM for analysis...");

  let parsed: Record<string, unknown> | null = null;
  try { parsed = await llmClient.chatJSON<Record<string, unknown>>(messages); } catch { /* fall through */ }

  if (parsed?.verdict && ["SAFE", "BORDERLINE", "RISKY"].includes(parsed.verdict as string)) {
    console.log(`[AffordabilityAgent] Verdict: ${parsed.verdict}, canAfford: ${parsed.canAfford}`);
    return {
      verdict:             (parsed.verdict as AffordabilityInfo["verdict"]),
      priceInHomeCurrency: Number(parsed.priceInHomeCurrency ?? priceInHome),
      canAfford:           Boolean(parsed.canAfford),
      analysis:            String(parsed.analysis ?? "Unable to generate analysis."),
      emiSuggested:        Boolean(parsed.emiSuggested),
    };
  }

  console.warn("[AffordabilityAgent] Could not parse verdict, defaulting to RISKY");
  return {
    verdict:             "RISKY",
    priceInHomeCurrency: priceInHome,
    canAfford:           false,
    analysis:            "Unable to perform a complete affordability analysis with the available data.",
    emiSuggested:        true,
  };
}
