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
- When you receive a FINANCIAL SUMMARY block, present it naturally at the start of your reply — it is the first time the user is seeing their financial picture in this conversation, so lay it out briefly: income, spending, monthly leftover, and savings.
- When you receive a CALCULATION CONTEXT block (labelled "already presented"), do NOT repeat income or spending figures. Use the numbers for maths only (e.g. "that's 6 months of your monthly surplus", "would leave £2,800 in savings").
- Help the user see *why* something works (or doesn't) using the numbers in context.

Topic discipline:
- The financial data you receive includes a SUBJECT field — always answer ONLY about that subject.
- NEVER switch the subject to a different product or item. If the conversation is about a trip, discuss the trip. If it is about a phone, discuss the phone.
- If a product name appears in the financial data that does NOT match the current conversation topic, ignore it completely.

EMI / instalment plans:
- When instalments are relevant, present them as a proper plan.
- Always show 3, 6, and 12‑month options.
- Each plan must clearly state total cost, monthly amount, and duration.
- Explain instalments naturally, like a person would.
- CRITICAL: If the conversation history already shows instalment options (3/6/12 month plans), do NOT list them again. The user has already seen them. Respond to the user's actual question instead.

User intent:
- When the user says something positive ("yes", "priority", "I want it", "go for it", "I'm happy to") — acknowledge it warmly and give them a clear recommended path. Do NOT ask an open question back.
- When the user says something like "I can wait", "maybe later", "let me think", "I'll save up" — acknowledge it calmly, tell them what saving up towards the goal looks like, and close positively. Do NOT push them to buy.
- Read the user's intent clearly and respond to it directly.

Conversation rules:
- Don't repeat earlier explanations.
- Continue naturally from the last message.
- Avoid bullet points unless you're laying out options or plans.
- Keep it concise: simple answers under 80 words, EMI/plan breakdowns under 150 words total.
- Don't say "I don't have that information".
- After presenting EMI or instalment plans, do NOT ask another open-ended follow-up question. Close with a short invite such as "Happy to adjust these if you want different numbers" or just leave it open for the user to reply.
- Only ask one question when you genuinely need information the user has not yet given.
`;
//
function buildDataContext(state: FinancialState): string {
  const parts: string[] = [];
  const homeCurrency =
    state.userProfile?.homeCurrency ??
    state.plan?.userHomeCurrency ??
    "GBP";

  // --- User financial profile ---
  // First assistant reply in the session → label as FINANCIAL SUMMARY so synthesis
  // presents it naturally to the user (they haven't seen their profile yet).
  // Subsequent replies → label as CALCULATION CONTEXT so synthesis uses the
  // numbers for maths only and never repeats the income/expenses recap.
  if (state.userProfile) {
    const up = state.userProfile;
    const leftover =
      up.monthlyIncome != null && up.monthlyExpenses != null
        ? up.monthlyIncome - up.monthlyExpenses
        : null;

    // Count prior assistant turns — if zero, this is the first reply in the session.
    const priorAssistantTurns = (state.conversationHistory ?? []).filter(
      (m) => m.role === "assistant"
    ).length;
    const isFirstReply = priorAssistantTurns === 0;

    if (isFirstReply) {
      parts.push(
        `FINANCIAL SUMMARY (present this to the user — they have not seen it yet this session):`,
        up.monthlyIncome != null
          ? `- Monthly income: ${up.monthlyIncome.toLocaleString("en-GB")} ${homeCurrency}`
          : `- Monthly income: Unknown`,
        up.monthlyExpenses != null
          ? `- Monthly expenses: ${up.monthlyExpenses.toLocaleString("en-GB")} ${homeCurrency}`
          : `- Monthly expenses: Unknown`,
        `- Available savings: ${up.availableSavings.toLocaleString("en-GB")} ${homeCurrency}`,
      );
      if (leftover != null) {
        parts.push(`- Monthly surplus (leftover): ${leftover.toLocaleString("en-GB")} ${homeCurrency}`);
      }
    } else {
      // Follow-up — numbers for calculation only, never narrate back to the user.
      parts.push(
        `CALCULATION CONTEXT (already presented — do NOT repeat income/spending figures):`,
        up.monthlyIncome != null
          ? `- Monthly income: ${up.monthlyIncome.toLocaleString("en-GB")} ${homeCurrency}`
          : `- Monthly income: Unknown`,
        up.monthlyExpenses != null
          ? `- Monthly expenses: ${up.monthlyExpenses.toLocaleString("en-GB")} ${homeCurrency}`
          : `- Monthly expenses: Unknown`,
        `- Available savings: ${up.availableSavings.toLocaleString("en-GB")} ${homeCurrency}`,
      );
      if (leftover != null) {
        parts.push(`- Monthly surplus: ${leftover.toLocaleString("en-GB")} ${homeCurrency}`);
      }
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
    // Strip any sentences that restate income/expenses — the affordability agent
    // is instructed not to include them, but filter defensively in case it does.
    const cleanedAnalysis = af.analysis
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => {
        const lower = sentence.toLowerCase();
        return !(
          (lower.includes("earn") || lower.includes("income")) &&
          (lower.includes("spend") || lower.includes("expense") || lower.includes("surplus"))
        );
      })
      .join(" ");
    parts.push(
      `AFFORDABILITY NOTES:`,
      cleanedAnalysis,
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

/**
 * Remove the recurring "You earn £X a month, spend £Y..." opener from prior
 * assistant messages so the synthesis LLM cannot pattern-match against it and
 * reproduce the preamble on every follow-up turn.
 */
function stripFinancialPreamble(text: string): string {
  // Remove any leading sentence(s) that contain both "earn" and "spend"
  return text
    .split("\n")
    .filter((line) => {
      const lower = line.toLowerCase();
      return !(lower.includes("earn") && lower.includes("spend"));
    })
    .join("\n")
    .trim();
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
          .map((m) => {
            const raw = m.content.slice(0, 400);
            // Strip income/expense preamble from prior assistant messages to
            // prevent the LLM from treating it as a required opening pattern.
            const cleaned =
              m.role === "assistant" ? stripFinancialPreamble(raw) : raw;
            return `${m.role === "user" ? "User" : "Assistant"}: ${cleaned}`;
          })
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