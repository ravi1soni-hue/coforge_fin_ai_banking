import type { V3LlmClient } from "../llm/v3LlmClient.js";
import type { FinancialState } from "../graph/state.js";
import type { AgenticMessage, UserProfile } from "../types.js";
import { sanitizeUserInput } from "../../utils/sanitizeUserInput.js";

const SYSTEM_PROMPT = `You are a warm, conversational financial assistant. Detect the user's intent (affordability, balance, investment, etc.) and respond naturally:
 - For affordability, show the numbers (income, expenses, savings, leftover) only on the first relevant response, blended into a natural sentence. Do not repeat them on follow-ups.
 - For balance, investment, or other queries, answer directly and conversationally, using context and warmth. Do not show unrelated numbers.
 - Use natural transitions and acknowledgments (e.g., "Thanks for sharing that detail.", "Here's what that means for you...").
 - Never sound scripted or robotic. Avoid rigid lists, bullet points, or repeated phrases.
 - If you need more info, ask a single, clear follow-up question, but never more than 2 per topic. After that, summarize and close.
 - Always adapt your tone and content to the user's intent and conversation history.
 - If the user changes topic, reset context and respond accordingly.
 - Never repeat the user's question. Never use phrases like "to be honest" or "the good news is". Never role-play.
 - Your output will be checked for warmth, clarity, and natural flow.`;

function buildDataContext(state: FinancialState): string {
  const parts: string[] = [];
  const up = state.userProfile as UserProfile;
  const homeCurrency = up?.homeCurrency ?? state.plan?.userHomeCurrency ?? "GBP";
  if (up) {
    parts.push(`USER FINANCIAL PROFILE:`);
    if (up.userName) parts.push(`- Name: ${up.userName}`);
    if (up.availableSavings !== undefined) parts.push(`- Available savings: £${up.availableSavings.toLocaleString("en-GB")} ${homeCurrency}`);
    if (up.monthlyIncome !== undefined) parts.push(`- Monthly income: £${up.monthlyIncome.toLocaleString("en-GB")} ${homeCurrency}`);
    if (up.monthlyExpenses !== undefined) parts.push(`- Monthly expenses: £${up.monthlyExpenses.toLocaleString("en-GB")} ${homeCurrency}`);
    if (up.netMonthlySurplus !== undefined) parts.push(`- Net monthly surplus: £${up.netMonthlySurplus.toLocaleString("en-GB")} ${homeCurrency}`);
    // All accounts
    if (up.accounts && up.accounts.length > 0) {
      parts.push(`\nACCOUNTS:`);
      up.accounts.forEach((acc: any) => {
        parts.push(`- ${acc.account_type || "Account"}: £${Number(acc.balance).toLocaleString("en-GB")} ${acc.currency || homeCurrency}`);
      });
    }
    // Investments
    if (up.investments && up.investments.length > 0) {
      parts.push(`\nINVESTMENTS:`);
      up.investments.forEach((inv: any) => {
        parts.push(`- ${inv.investment_type || "Investment"}: £${Number(inv.current_value).toLocaleString("en-GB")} ${inv.currency || homeCurrency}`);
      });
    }
    // Loans
    if (up.loans && up.loans.length > 0) {
      parts.push(`\nLOANS:`);
      up.loans.forEach((loan: any) => {
        parts.push(`- ${loan.loan_type || "Loan"}: £${Number(loan.outstanding_balance).toLocaleString("en-GB")} ${loan.currency || homeCurrency}`);
      });
    }
    // Credit profile
    if (up.creditProfile) {
      parts.push(`\nCREDIT PROFILE:`);
      Object.entries(up.creditProfile).forEach(([k, v]) => {
        if (v !== null && v !== undefined) parts.push(`- ${k}: ${v}`);
      });
    }
    // Monthly summaries
    if (up.monthlySummaries && up.monthlySummaries.length > 0) {
      parts.push(`\nMONTHLY SUMMARY:`);
      up.monthlySummaries.forEach((ms: any) => {
        parts.push(`- ${ms.month}: Income £${ms.income?.toLocaleString("en-GB") ?? "-"}, Expenses £${ms.expenses?.toLocaleString("en-GB") ?? "-"}, Savings £${ms.savings?.toLocaleString("en-GB") ?? "-"}`);
      });
    }
  }
  if (state.plan?.product) {
    parts.push(`SUBJECT: ${state.plan.product}`);
  }
  if (state.priceInfo && state.priceInfo.price > 0) {
    parts.push(`PRICE: ${state.plan?.product ?? "Item"} = ${state.priceInfo.price.toLocaleString("en-GB")} ${state.priceInfo.currency}`);
  } else if (state.priceInfo && state.priceInfo.price === 0) {
    parts.push(`PRICE: No verified price found. Ask the user to confirm the amount instead of estimating.`);
  }
  if (state.fxInfo) {
    parts.push(`EXCHANGE RATE: 1 ${state.fxInfo.from} = ${state.fxInfo.rate.toFixed(4)} ${state.fxInfo.to}`);
    if (state.priceInfo && state.priceInfo.price > 0) {
      const converted = state.priceInfo.price * state.fxInfo.rate;
      parts.push(`CONVERTED PRICE: ${converted.toFixed(2)} ${state.fxInfo.to}`);
    }
  }
  if (state.affordabilityInfo) {
    const af = state.affordabilityInfo;
    parts.push(`AFFORDABILITY NOTES:`);
    parts.push(af.analysis);
    parts.push(`PRICE IN ${homeCurrency}: ${af.priceInHomeCurrency.toLocaleString("en-GB")} ${homeCurrency}`);
    if (af.emiSuggested || state.plan?.needsEmi) {
      const price = af.priceInHomeCurrency;
      parts.push(`EMI OPTIONS (${homeCurrency}):`);
      parts.push(`- 3 months: ${Math.round(price / 3).toLocaleString("en-GB")} ${homeCurrency} per month`);
      parts.push(`- 6 months: ${Math.round(price / 6).toLocaleString("en-GB")} ${homeCurrency} per month`);
      parts.push(`- 12 months: ${Math.round(price / 12).toLocaleString("en-GB")} ${homeCurrency} per month`);
    }
  }
  return parts.join("\n");
}

export async function runSynthesisAgent(
  llmClient: V3LlmClient,
  state: FinancialState
): Promise<string> {
  console.log("[SynthesisAgent] runSynthesisAgent called");
  console.log("[SynthesisAgent] state.plan:", state.plan);
  const dataContext = buildDataContext(state);
  console.log("[SynthesisAgent] dataContext:\n", dataContext);
  const historyText =
    state.conversationHistory && state.conversationHistory.length > 0
      ? "\n\nConversation history (most recent last):\n" +
        state.conversationHistory
          .slice(-6)
          .map((m: any) => {
            let content = "";
            if (typeof m.content === "string") {
              content = m.content.slice(0, 400);
            } else if (Array.isArray(m.content)) {
              content = m.content.join(" ").slice(0, 400);
            }
            return `${m.role === "user" ? "User" : "Assistant"}: ${content}`;
          })
          .join("\n")
      : "";
  const sanitizedUserMessage = sanitizeUserInput(state.userMessage);

  // --- Unified Patch: Add cold start/fallback/generic intent handling ---
  if (state.plan?.dbWakingUp) {
    console.log("[SynthesisAgent] DB waking up fallback");
    return "I'm waking up your account data now—please hold on just a moment. This can take a few seconds if the system was idle.";
  }
  if (state.plan?.fallbackIntent) {
    console.log("[SynthesisAgent] Fallback intent");
    return "I'm not sure I understood your request fully, but I'm here to help with any banking, subscription, or investment questions. Could you clarify or rephrase?";
  }
  // --- Unified schema-driven responses for all major intents ---
  if (state.plan?.intent === "subscription") {
    console.log("[SynthesisAgent] Subscription intent");
    return "Here's a summary of your active subscriptions and recurring payments. If you want details or to manage any, just let me know!";
  }
  if ((state.plan?.intent as any) === "investment") {
    console.log("[SynthesisAgent] Investment intent, investments:", state.userProfile?.investments);
    if (state.userProfile?.investments && state.userProfile.investments.length > 0) {
      let msg = `Here are your investments:`;
      state.userProfile.investments.forEach((inv: any, idx: number) => {
        msg += `\n${idx + 1}. ${(inv.investment_name || inv.name || inv.investment_type || "Investment")} - £${Number(inv.current_value || inv.value || 0).toLocaleString("en-GB")} ${inv.currency || state.userProfile?.homeCurrency || "GBP"}`;
      });
      console.log("[SynthesisAgent] Investment response:", msg);
      return msg;
    }
    console.log("[SynthesisAgent] No investments found");
    return "No investments found for your account.";
  }
  if ((state.plan?.intent as any) === "balance") {
    console.log("[SynthesisAgent] Balance intent, accounts:", state.userProfile?.accounts);
    if (state.userProfile?.accounts && state.userProfile.accounts.length > 0) {
      let msg = `Here are your accounts:`;
      state.userProfile.accounts.forEach((acc: any, idx: number) => {
        msg += `\n${idx + 1}. ${(acc.account_type || "Account")} (${acc.provider || "Provider"}): £${Number(acc.balance || 0).toLocaleString("en-GB")} ${acc.currency || state.userProfile?.homeCurrency || "GBP"}`;
      });
      console.log("[SynthesisAgent] Accounts response:", msg);
      return msg;
    }
    if (typeof state.userProfile?.accountBalance === "number" && state.userProfile.accountBalance > 0) {
      const msg = `Your current account balance is £${state.userProfile.accountBalance.toLocaleString("en-GB")} GBP.`;
      console.log("[SynthesisAgent] Balance response:", msg);
      return msg;
    }
    console.log("[SynthesisAgent] No account balance data found");
    return "No account balance data found.";
  }
  if ((state.plan?.intent as any) === "loan" || (state.plan?.intent as any) === "loans") {
    console.log("[SynthesisAgent] Loan intent, loans:", state.userProfile?.loans);
    if (state.userProfile?.loans && state.userProfile.loans.length > 0) {
      let msg = `Here are your loans:`;
      state.userProfile.loans.forEach((loan: any, idx: number) => {
        msg += `\n${idx + 1}. ${loan.loan_type || "Loan"}: £${Number(loan.outstanding_amount || loan.outstanding_balance || 0).toLocaleString("en-GB")} ${loan.currency || state.userProfile?.homeCurrency || "GBP"}`;
      });
      console.log("[SynthesisAgent] Loan response:", msg);
      return msg;
    }
    console.log("[SynthesisAgent] No loans found");
    return "No loans found for your account.";
  }
  if ((state.plan?.intent as any) === "credit" || (state.plan?.intent as any) === "credit_profile") {
    console.log("[SynthesisAgent] Credit intent, creditProfile:", state.userProfile?.creditProfile);
    if (state.userProfile?.creditProfile) {
      let msg = `Here is your credit profile:`;
      Object.entries(state.userProfile.creditProfile).forEach(([k, v]) => {
        if (v !== null && v !== undefined) msg += `\n- ${k}: ${v}`;
      });
      console.log("[SynthesisAgent] Credit profile response:", msg);
      return msg;
    }
    console.log("[SynthesisAgent] No credit profile found");
    return "No credit profile found for your account.";
  }
  if ((state.plan?.intent as any) === "summary" || (state.plan?.intent as any) === "monthly_summary") {
    console.log("[SynthesisAgent] Summary intent, monthlySummaries:", state.userProfile?.monthlySummaries);
    if (state.userProfile?.monthlySummaries && state.userProfile.monthlySummaries.length > 0) {
      let msg = `Here is your monthly financial summary:`;
      state.userProfile.monthlySummaries.forEach((ms: any) => {
        msg += `\n- ${ms.month}: Income £${ms.total_income?.toLocaleString("en-GB") ?? "-"}, Expenses £${ms.total_expenses?.toLocaleString("en-GB") ?? "-"}, Savings £${ms.total_savings?.toLocaleString("en-GB") ?? "-"}, Investments £${ms.total_investments?.toLocaleString("en-GB") ?? "-"}, Net Cashflow £${ms.net_cashflow?.toLocaleString("en-GB") ?? "-"}`;
      });
      console.log("[SynthesisAgent] Summary response:", msg);
      return msg;
    }
    console.log("[SynthesisAgent] No monthly summary data found");
    return "No monthly summary data found.";
  }

  const messages: AgenticMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `${historyText}\n\nCurrent message: "${sanitizedUserMessage}"\n\nFinancial data:\n${dataContext}\n\nWrite a clear, natural response using this information.`,
    },
  ];
  const finalText = await llmClient.chat(messages);
  return finalText.trim() ? finalText : "Sorry — I couldn’t generate a response just now. Please try again.";
}
