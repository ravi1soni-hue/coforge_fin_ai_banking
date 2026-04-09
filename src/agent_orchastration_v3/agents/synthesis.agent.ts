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
- Only introduce the income/expenses breakdown ("You earn £X a month...") the FIRST time you give an affordability summary. On follow-up messages about the same purchase, DO NOT repeat it — pick up directly where the conversation left off.
- Use savings as supporting context only when it adds new information.
- Help the user see *why* something works (or doesn't) using real numbers.

Topic discipline:
- The financial data you receive includes a SUBJECT field — always answer ONLY about that subject.
- NEVER switch the subject to a different product or item. If the conversation is about a trip, discuss the trip. If it is about a phone, discuss the phone.
- If a product name appears in the financial data that does NOT match the current conversation topic, ignore it completely.

EMI / instalment plans:
- When instalments are relevant, present them as a proper plan.
- Always show 3, 6, and 12‑month options.
- Each plan must clearly state total cost, monthly amount, and duration.
- Explain instalments naturally, like a person would.

User intent:
- When the user says something positive ("yes", "priority", "I want it", "go for it", "I'm happy to") — acknowledge it warmly and give them a clear recommended path. Do NOT ask an open question back.
- When the user says something like "I can wait", "maybe later", "let me think", "I'll save up" — acknowledge it calmly, tell them what saving up towards the goal looks like, and close positively. Do NOT push them to buy.
- Read the user's intent clearly and respond to it directly.

Conversation rules:
- Don't repeat earlier explanations.
- Continue naturally from the last message.
- Avoid bullet points unless you're laying out options or plans.
- Keep it under 180 words unless more detail is clearly needed.
- Don't say "I don't have that information".
- Ask at most one follow‑up question, only if it genuinely helps — do NOT ask a question if the user has already stated their intent clearly.
`;

function buildDataContext(state: FinancialState): string {
  const parts: string[] = [];
  const homeCurrency =
    state.userProfile?.homeCurrency ??
    state.plan?.userHomeCurrency ??
    "GBP";

  // --- User financial profile ---
  if (state.userProfile) {
    const up = state.userProfile;

    // Detect whether income/expenses were already stated in a prior assistant turn
    const alreadyShownProfile = (state.conversationHistory ?? [])
      .filter((m) => m.role === "assistant")
      .some((m) => m.content.includes("earn") && m.content.includes("spend"));

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

    if (alreadyShownProfile) {
      parts.push(
        `INSTRUCTION: The income/expenses breakdown ("You earn £X a month, spend £Y...") was ALREADY stated earlier in this conversation. DO NOT repeat it. Continue from where the conversation left off.`
      );
    }
  }

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