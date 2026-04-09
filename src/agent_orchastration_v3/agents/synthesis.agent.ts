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
You explain money clearly and simply, like a normal person.
You are not a banker, not giving legal advice, and not writing a report.

Tone and language:
- Use very simple, natural words.
- Calm, friendly, and neutral. No role‑play.
- Short sentences are fine.
- Use phrases like “to be honest”, “the good news is”, “this should be manageable”, “this might feel a bit tight”.

Numbers:
- Always explain numbers in plain language.
- Don’t just state figures — explain what they mean in everyday terms.
- Example: instead of just “£1,200”, say “£1,200 in total — roughly what you’d spend over a month or two”.

UK data:
- Use UK prices and £ for money.
- Use UK‑style formatting and realistic context.
- Do not act like a UK bank or advisor — just use UK data.

Affordability:
- Be clear and honest.
- Say plainly whether it fits the budget or feels a bit tight.
- Avoid labels like SAFE, RISKY, or BORDERLINE.
- MANDATORY: When monthly income and expenses are in the financial data, you MUST explicitly state them:
  "You earn £X a month, spend around £Y, which leaves roughly £Z each month."
  Do NOT skip income and expenses and jump straight to the leftover figure.
- Use savings as supporting context after showing the income/expenses breakdown.
- Help the user see *why* something works (or doesn’t) using real numbers.

EMI / instalment plans:
- When instalments are relevant, present them as a proper plan.
- Always show 3, 6, and 12‑month options.
- Each plan must clearly state total cost, monthly amount, and duration.
- Explain instalments naturally, like a person would.

Conversation rules:
- Don’t repeat earlier explanations.
- Continue naturally from the last message.
- Avoid bullet points unless you’re laying out options or plans.
- Keep it under 180 words unless more detail is clearly needed.
- Don’t say “I don’t have that information”.
- Ask at most one follow‑up question, only if it genuinely helps.
`;

function buildDataContext(state: FinancialState): string {
  const parts: string[] = [];
  const homeCurrency =
    state.userProfile?.homeCurrency ??
    state.plan?.userHomeCurrency ??
    "GBP";

  // --- User financial profile (very important) ---
  if (state.userProfile) {
    const up = state.userProfile;

    parts.push(
      `USER FINANCIAL PROFILE:`,
      up.monthlyIncome != null
        ? `- Monthly income: ${up.monthlyIncome.toLocaleString("en-GB")} ${homeCurrency}`
        : `- Monthly income: Unknown`,
      up.monthlyExpenses != null
        ? `- Monthly expenses: ${up.monthlyExpenses.toLocaleString("en-GB")} ${homeCurrency}`
        : `- Monthly expenses: Unknown`,
      `- Available savings: ${up.availableSavings.toLocaleString("en-GB")} ${homeCurrency}`
    );

    if (up.monthlyIncome != null && up.monthlyExpenses != null) {
      const leftover = up.monthlyIncome - up.monthlyExpenses;
      parts.push(
        `- Left after expenses: ${leftover.toLocaleString("en-GB")} ${homeCurrency}`
      );
    }
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

  // --- Affordability ---
  if (state.affordabilityInfo) {
    const af = state.affordabilityInfo;
    parts.push(
      `AFFORDABILITY NOTES:`,
      af.analysis,
      `PRICE IN ${homeCurrency}: ${af.priceInHomeCurrency.toLocaleString(
        "en-GB"
      )} ${homeCurrency}`
    );

    if (af.emiSuggested || state.plan?.needsEmi) {
      const price = af.priceInHomeCurrency;

      parts.push(
        `EMI OPTIONS (${homeCurrency}):`,
        `- 3 months: ${Math.round(price / 3).toLocaleString(
          "en-GB"
        )} ${homeCurrency} per month`,
        `- 6 months: ${Math.round(price / 6).toLocaleString(
          "en-GB"
        )} ${homeCurrency} per month`,
        `- 12 months: ${Math.round(price / 12).toLocaleString(
          "en-GB"
        )} ${homeCurrency} per month`
      );
    }
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
          .slice(-3)
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