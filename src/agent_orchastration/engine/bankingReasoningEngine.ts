/**
 * Banking Reasoning Engine
 *
 * Single-class orchestration engine that replaces the 10-agent LangGraph chain.
 *
 * Pipeline per turn:
 *   1. classifyTurn  — LLM reads full history and decides: CONFIRM_OFFER | PROVIDE_FACT | NEW_QUESTION | GREETING
 *   2a. CONFIRM_OFFER → preComputeOffer (deterministic numbers) → LLM formats the output   ← KEY FIX
 *   2b. NEW_QUESTION / PROVIDE_FACT → extractFacts → maybe FOLLOW_UP → financialAnalysis
 *
 * Pre-computing confirmed-offer answers is the critical architectural change.
 * The LLM receives a table of repayment options / budget lines / recovery months —
 * not raw savings vs trip-cost figures — so it CANNOT revert to affordability mode.
 */

import { LlmClient } from "../llm/llmClient.js";
import { VectorQueryService } from "../services/vector.query.service.js";
import type { GraphStateType } from "../graph/state.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

type TurnType = "CONFIRM_OFFER" | "PROVIDE_FACT" | "NEW_QUESTION" | "GREETING";

interface TurnClassification {
  type: TurnType;
  offeredTask: string | null;
}

type OfferType =
  | "INSTALMENT_PLAN"   // 0% plan, repayment schedule, payment options
  | "BUDGET_PLAN"       // trip budget breakdown, daily budget, cost trimming
  | "SAVINGS_RECOVERY"  // rebuild savings after purchase
  | "GENERAL";          // everything else

export interface EngineResult {
  finalAnswer: string;
  missingFacts: string[];
  knownFacts: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// BankingReasoningEngine
// ─────────────────────────────────────────────────────────────────────────────

export class BankingReasoningEngine {
  constructor(
    private readonly llm: LlmClient,
    private readonly vectorQuery: VectorQueryService
  ) {}

  // ── Public entry point ─────────────────────────────────────────────────────

  async run(state: GraphStateType): Promise<EngineResult> {
    const history = state.conversationHistory ?? [];
    const hasHistory = history.some(m => m.role === "assistant");

    console.log(`[ReasoningEngine] question="${state.question}" historyLen=${history.length} hasHistory=${hasHistory}`);

    // ── 1. Turn classification ──────────────────────────────────────────────
    const turn: TurnClassification = hasHistory
      ? await this.classifyTurn(state.question, history)
      : { type: "NEW_QUESTION", offeredTask: null };

    console.log(`[ReasoningEngine] turn=${turn.type} task="${(turn.offeredTask ?? "").slice(0, 80)}"`);

    // ── 2. Greeting ─────────────────────────────────────────────────────────
    if (turn.type === "GREETING") {
      return {
        finalAnswer:
          "Hello! I'm your AI banking advisor. Ask me about affordability, investments, subscriptions, spending patterns, or financial planning.",
        missingFacts: [],
        knownFacts: state.knownFacts ?? {},
      };
    }

    // ── 3. Confirmed offer → pre-compute then format ─────────────────────────
    if (turn.type === "CONFIRM_OFFER" && turn.offeredTask) {
      return this.executeConfirmedOffer(state, turn.offeredTask, history);
    }

    // ── 4. New question or provided fact → analysis pipeline ────────────────
    return this.analysisPipeline(state, history);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Turn Classification
  // ─────────────────────────────────────────────────────────────────────────────

  private async classifyTurn(
    question: string,
    history: Array<{ role: string; content: string }>
  ): Promise<TurnClassification> {
    const wordCount = question.trim().split(/\s+/).length;
    const lastAssistant = [...history].reverse().find(m => m.role === "assistant")?.content ?? "";

    // Only attempt classification when the message is short and the last assistant
    // message contained an offer — avoids unnecessary LLM calls for clearly new questions.
    const lastMsgHasOffer = /want me to|shall i|would you like|let me|i can show|i can work|i can map|i can calculate/i.test(lastAssistant);
    if (wordCount > 15 || !lastMsgHasOffer) {
      return { type: "NEW_QUESTION", offeredTask: null };
    }

    const recentStr = history
      .slice(-6)
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    try {
      const result = await this.llm.generateJSON<TurnClassification>(`
You are a turn classifier for a banking AI assistant.

RECENT CONVERSATION:
${recentStr}

NEW USER MESSAGE: "${question}"

Classify this message into exactly one category:

CONFIRM_OFFER — the user is agreeing to the specific action the assistant offered.
  The assistant's last message must contain an explicit offer ("Want me to...", "Shall I...",
  "I can show you...", "Would you like me to...").
  Affirmative responses: "yes", "yes please", "sure", "go ahead", "please do that",
  "yes please check", "yes please map it out", "ok", "sounds good", "definitely".

PROVIDE_FACT — the user is answering a specific question the assistant asked.
  Example: assistant asked "How much will it cost?" → user replies "around 2200 euros".

NEW_QUESTION — user is asking something new or the message is a new query/statement.

GREETING — hello, thanks, goodbye, small talk.

Rules:
- A message beginning with "yes" after an explicit offer → CONFIRM_OFFER.
- A number, amount, date, or location as a reply to a direct question → PROVIDE_FACT.
- Do NOT set CONFIRM_OFFER if the last assistant message had no offer.
- For CONFIRM_OFFER: extract from the assistant's last message the EXACT task offered.
  Focus on the "Want me to..." or "Shall I..." clause.

Return ONLY valid JSON (no markdown):
{
  "type": "CONFIRM_OFFER" | "PROVIDE_FACT" | "NEW_QUESTION" | "GREETING",
  "offeredTask": "<exact task extracted from last assistant message, or null>"
}
`);
      return result;
    } catch {
      // LLM failed — fallback to regex
      const isAffirmative =
        /^(yes|sure|ok|okay|please|yep|go ahead|do it|yes please|sounds good|absolutely|of course|great|perfect|please do|definitely)\b/i.test(
          question.trim()
        );
      if (isAffirmative && lastMsgHasOffer) {
        const taskMatch = lastAssistant.match(
          /(?:want me to|shall i|i can show you|i can|would you like me to|let me)\s+([^.?!\n]{10,180})/i
        );
        return {
          type: "CONFIRM_OFFER",
          offeredTask: taskMatch ? taskMatch[1].trim() : "continue from the last offer",
        };
      }
      return { type: "NEW_QUESTION", offeredTask: null };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Confirmed Offer Execution
  // ─────────────────────────────────────────────────────────────────────────────

  private async executeConfirmedOffer(
    state: GraphStateType,
    offeredTask: string,
    history: Array<{ role: string; content: string }>
  ): Promise<EngineResult> {
    const kf = state.knownFacts ?? {};
    const offerType = this.classifyOfferType(offeredTask);

    console.log(
      `[ReasoningEngine] executeConfirmedOffer offerType=${offerType} task="${offeredTask.slice(0, 100)}"`
    );

    // Pre-compute deterministic numbers — the LLM gets these as FACTS not raw figures
    const precomputed = this.preComputeOffer(offerType, kf);

    // Fetch extra context from DB (non-blocking fallback)
    let dbContext = "";
    try {
      dbContext = await this.vectorQuery.getContext(
        state.userId,
        `${offeredTask} financial data for user ${state.userId}`,
        { topK: 5 }
      );
    } catch {
      // ignore — pre-computed data is sufficient
    }

    const recentStr = history
      .slice(-6)
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const deliveryInstructions = this.buildDeliveryInstructions(offerType, kf);

    const answer = await this.llm.generateText(`
You are a financial reasoning engine — a senior banking advisor delivering a specific analysis.
A user has CONFIRMED an offer made by the banking advisor. Your job is to deliver that specific thing.

CONVERSATION:
${recentStr}
User: ${state.question}

TASK TO DELIVER: "${offeredTask}"

PRE-COMPUTED DATA (use these numbers exactly — do not recalculate):
${precomputed}
${dbContext ? `\nADDITIONAL DATABASE CONTEXT:\n${dbContext.slice(0, 800)}\n` : ""}
DELIVERY INSTRUCTIONS:
${deliveryInstructions}

ABSOLUTE RULES (breaking any rule = invalid response):
1. Do NOT mention affordability. Do NOT say "you can afford", "you have X in savings", or restate whether the purchase is possible.
2. Do NOT start with "You", "Your", "Based", "Given", "Since", "As", "Covering", "The trip", "This trip".
3. Start with the first concrete number, option, or step from the pre-computed data.
4. Use bullet points or a short numbered list if presenting multiple options.
5. Maximum 6 lines or 4 bullet points.
6. End with ONE brief forward-looking offer on the NEXT decision in this financial journey.
   (e.g. "Want me to..." or "Shall I..." on a different aspect — not the same thing again.)
`);

    console.log(`[ReasoningEngine] confirmed-offer answer="${answer.slice(0, 120)}..."`);

    return {
      finalAnswer: answer,
      missingFacts: [],
      knownFacts: kf,
    };
  }

  private classifyOfferType(task: string): OfferType {
    const t = task.toLowerCase();
    if (/instalment|repayment|payment.?option|plan.?option|spread.*cost|0%|monthly.?payment|check.*plan|best.*plan/i.test(t))
      return "INSTALMENT_PLAN";
    if (/budget|map.*out|daily.*budget|spending.*plan|breakdown|trim.*cost|cut.*cost|return.*healthier|cheaper.*way|save.*on.*trip/i.test(t))
      return "BUDGET_PLAN";
    if (/recover|rebuild|restore|replenish|top.*up|after.*trip|post.*trip|savings.*after|bring.*back/i.test(t))
      return "SAVINGS_RECOVERY";
    return "GENERAL";
  }

  private preComputeOffer(offerType: OfferType, kf: Record<string, unknown>): string {
    const hc = String(kf.profileCurrency ?? kf.currency ?? "GBP");
    const gc = String(kf.targetCurrency ?? hc);
    const amount =
      typeof kf.targetAmount === "number" ? kf.targetAmount : null;
    const savings =
      typeof kf.availableSavings === "number"
        ? kf.availableSavings
        : typeof kf.spendable_savings === "number"
        ? kf.spendable_savings
        : typeof kf.currentBalance === "number"
        ? kf.currentBalance
        : null;
    const surplus =
      typeof kf.netMonthlySavings === "number"
        ? kf.netMonthlySavings
        : typeof kf.netMonthlySurplus === "number"
        ? kf.netMonthlySurplus
        : null;
    const destination = typeof kf.destination === "string" ? kf.destination : "the purchase";
    const duration = typeof kf.duration === "string" ? kf.duration : "";
    const days = Number(duration.replace(/\D/g, "")) || 3;

    const lines: string[] = [];

    if (offerType === "INSTALMENT_PLAN" && amount !== null) {
      const m3 = amount / 3;
      const m6 = amount / 6;
      const m12 = amount / 12;
      lines.push(`0% Instalment Plan options for ${gc}${amount.toFixed(0)}:`);
      lines.push(`  3 months:  ${gc}${m3.toFixed(0)}/month   (total: ${gc}${amount.toFixed(0)})`);
      lines.push(`  6 months:  ${gc}${m6.toFixed(0)}/month   (total: ${gc}${amount.toFixed(0)})`);
      lines.push(`  12 months: ${gc}${m12.toFixed(0)}/month  (total: ${gc}${amount.toFixed(0)})`);
      if (surplus !== null) {
        lines.push(`Monthly surplus available from income: ${hc}${surplus.toFixed(0)}`);
        const fits = ([3, 6, 12] as const).filter(m => amount / m <= surplus);
        if (fits.length > 0) {
          lines.push(`Plans fundable from monthly surplus alone: ${fits.map(m => `${m}-month`).join(", ")}`);
        } else {
          lines.push(`No option fits within monthly surplus — payments would draw from savings buffer`);
          lines.push(`Best option: 12-month plan (${gc}${m12.toFixed(0)}/month) minimises savings impact`);
        }
      }
      if (savings !== null) {
        lines.push(`Savings remaining if paid as a lump sum: ${hc}${(savings - amount).toFixed(0)}`);
      }
    } else if (offerType === "BUDGET_PLAN" && amount !== null) {
      const daily = amount / days;
      const accomFraction = 0.40;
      const foodFraction = 0.22;
      const transportFraction = 0.22;
      const actFraction = 0.16;
      lines.push(`Budget plan for ${gc}${amount.toFixed(0)} trip (${days} days):`);
      lines.push(`  Accommodation: ${gc}${(amount * accomFraction).toFixed(0)}  (${gc}${(amount * accomFraction / days).toFixed(0)}/night)`);
      lines.push(`  Food & drink:  ${gc}${(amount * foodFraction).toFixed(0)}`);
      lines.push(`  Flights + local transport: ${gc}${(amount * transportFraction).toFixed(0)}`);
      lines.push(`  Activities:    ${gc}${(amount * actFraction).toFixed(0)}`);
      lines.push(`  Daily rate:    ${gc}${daily.toFixed(0)}/day`);
      lines.push(`Trimming options:`);
      const trimmedAccom = amount * accomFraction * 0.65;
      const trimmedFood  = amount * foodFraction  * 0.70;
      const totalTrimmed = amount - (amount * accomFraction - trimmedAccom) - (amount * foodFraction - trimmedFood);
      lines.push(`  Mid-range hotel:               save ${gc}${(amount * accomFraction - trimmedAccom).toFixed(0)}`);
      lines.push(`  Self-catering 1-2 meals/day:   save ${gc}${(amount * foodFraction - trimmedFood).toFixed(0)}`);
      lines.push(`Trimmed total: ${gc}${totalTrimmed.toFixed(0)}  (vs original ${gc}${amount.toFixed(0)})`);
      if (savings !== null) {
        lines.push(`Savings remaining after trimmed trip: ${hc}${(savings - totalTrimmed).toFixed(0)}`);
      }
    } else if (offerType === "SAVINGS_RECOVERY" && savings !== null && amount !== null) {
      const afterTrip = savings - amount;
      lines.push(`Post-trip savings recovery:`);
      lines.push(`  Savings after trip:      ${hc}${afterTrip.toFixed(0)}`);
      lines.push(`  Amount to rebuild:       ${hc}${amount.toFixed(0)}`);
      if (surplus !== null && surplus > 0) {
        const baseMonths = Math.ceil(amount / surplus);
        lines.push(`  At current monthly surplus (${hc}${surplus.toFixed(0)}): ${baseMonths} months to rebuild`);
        const boosted = surplus + 200;
        const boostedMonths = Math.ceil(amount / boosted);
        lines.push(`  Boosted by ${hc}200/month (e.g. pause one investment): ${boostedMonths} months to rebuild`);
      }
      lines.push(`  Fastest route: use a 0% instalment plan for the trip — keep savings intact, spread cost over 6-12 months`);
    } else {
      // GENERAL — expose known numeric facts only
      if (amount !== null)  lines.push(`Goal cost: ${gc}${amount.toFixed(0)}`);
      if (savings !== null) lines.push(`Available savings: ${hc}${savings.toFixed(0)}`);
      if (surplus !== null) lines.push(`Monthly surplus: ${hc}${surplus.toFixed(0)}`);
      lines.push(`Goal/destination: ${destination}`);
    }

    return lines.join("\n") || "Insufficient data in session for deterministic pre-computation.";
  }

  private buildDeliveryInstructions(offerType: OfferType, kf: Record<string, unknown>): string {
    const gc = String(kf.targetCurrency ?? kf.profileCurrency ?? kf.currency ?? "GBP");
    switch (offerType) {
      case "INSTALMENT_PLAN":
        return (
          `Present the 3 instalment options as a clear comparison using the pre-computed table.\n` +
          `Identify which best fits the monthly surplus.\n` +
          `Recommend ONE specific option with a 1-line rationale.\n` +
          `Do NOT discuss whether the trip is affordable.`
        );
      case "BUDGET_PLAN":
        return (
          `Present the budget breakdown by category using the pre-computed numbers.\n` +
          `Highlight the 2 trimming opportunities with exact ${gc} savings.\n` +
          `State the total achievable saving and the resulting lower total cost.\n` +
          `Do NOT discuss whether the trip is affordable.`
        );
      case "SAVINGS_RECOVERY":
        return (
          `Present the 2 recovery timeline options (base + boosted) using the pre-computed data.\n` +
          `Recommend the most realistic path with a concrete action the user can take NOW.\n` +
          `Do NOT discuss whether the trip is affordable.`
        );
      default:
        return "Deliver the specific information the user confirmed. Be concrete and actionable.";
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Standard Analysis Pipeline  (new questions / provided facts)
  // ─────────────────────────────────────────────────────────────────────────────

  private async analysisPipeline(
    state: GraphStateType,
    history: Array<{ role: string; content: string }>
  ): Promise<EngineResult> {
    // 1. Extract and validate facts
    const factResult = await this.extractAndValidateFacts(state, history);
    const mergedFacts = { ...state.knownFacts, ...factResult.extractedFacts };

    // 2. Missing facts → FOLLOW_UP
    if (factResult.missingFacts.length > 0) {
      return {
        finalAnswer: factResult.followUpQuestion,
        missingFacts: factResult.missingFacts,
        knownFacts: mergedFacts,
      };
    }

    // 3. Fetch financial data from vector DB
    let financialContext = "";
    try {
      financialContext = await this.vectorQuery.getContext(
        state.userId,
        `full financial profile for ${state.userId}. Question: ${state.question}`,
        { topK: 10 }
      );
    } catch {
      // continue without DB context — LLM will note data is limited
    }

    // 4. Generate the analysis
    const recentStr = history
      .slice(-6)
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const hc = String(mergedFacts.profileCurrency ?? mergedFacts.currency ?? "GBP");
    const gc = String(mergedFacts.targetCurrency ?? hc);

    const answer = await this.llm.generateText(`
You are a senior banking advisor and financial reasoning engine.
Your role is to think through the user's financial situation and give a specific, data-driven answer.
You are NOT a chatbot that gives generic yes/no responses.

CONVERSATION CONTEXT:
${recentStr}

USER'S QUESTION: "${state.question}"

FINANCIAL DATA FROM DATABASE:
${financialContext.slice(0, 2500)}

EXTRACTED FACTS FROM THIS CONVERSATION:
${JSON.stringify(mergedFacts, null, 2)}

HOME CURRENCY: ${hc}   GOAL CURRENCY: ${gc}

HOW TO RESPOND — pick the right analysis mode:

AFFORDABILITY (can I afford X):
  - Use spendable_savings or availableSavings ONLY. Not the current account — that covers monthly living.
  - Subtract at minimum 1 month of expenses as an emergency buffer before calculating headroom.
  - Give a clear verdict (yes / conditional / not yet) with exact figures.
  - End with ONE actionable next-step offer ("Want me to...").

SUBSCRIPTIONS (recurring charges, streaming, SaaS):
  - List named subscriptions with amounts. Identify ones unused or duplicated.
  - Give the exact annual saving achievable by cutting waste.

INVESTMENTS (ISA, funds, Premium Bonds, performance):
  - Cite actual balance and contribution figures from the database.
  - Give a concrete return figure if available. Flag if data is insufficient.

BANK STATEMENT / CASHFLOW:
  - Give actual totals (income, expenses, net) for the relevant period.
  - Highlight the top spending category.

PLANNING / GOAL SAVING:
  - Give a concrete monthly savings target and a specific timeline.

FORMAT RULES:
- Lead with the most important finding or verdict.
- Back it with 2-3 specific numbers from the data.
- Max 5 sentences total.
- Close with ONE specific follow-up offer (start with "Want me to..." or "Shall I...").
- Use ${hc} for home-currency figures, ${gc} for goal-specific amounts.
- Never say "I don't have enough data" without also giving the best estimate available.
`);

    return {
      finalAnswer: answer,
      missingFacts: [],
      knownFacts: mergedFacts,
    };
  }

  private async extractAndValidateFacts(
    state: GraphStateType,
    history: Array<{ role: string; content: string }>
  ): Promise<{
    extractedFacts: Record<string, unknown>;
    missingFacts: string[];
    followUpQuestion: string;
    queryCategory: string;
  }> {
    const recentStr = history
      .slice(-4)
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const result = await this.llm.generateJSON<{
      queryCategory: string;
      extractedFacts: Record<string, unknown>;
      missingFacts: string[];
      followUpQuestion: string | null;
    }>(`
You are a fact extractor for a banking assistant.

CONVERSATION SO FAR:
${recentStr}

CURRENT USER MESSAGE: "${state.question}"

ALREADY KNOWN FACTS (do NOT ask for these again):
${JSON.stringify(state.knownFacts ?? {})}

STEP 1 — Classify the query type:
  affordability  — user wants to know if they can afford a specific purchase, trip, or item
  subscriptions  — subscriptions, recurring charges, streaming, SaaS
  investments    — ISA, funds, Premium Bonds, portfolio performance
  statement      — account balance, transactions, monthly cashflow
  general        — planning, advice, comparison, anything else

STEP 2 — Extract facts explicitly stated in the CURRENT message:
  goalType        : string | null   (trip, car, phone, house, etc.)
  destination     : string | null   (city or country if mentioned)
  targetAmount    : number | null   (numeric cost — parse "2200 euros" → 2200)
  targetCurrency  : string | null   (EUR, GBP, USD, etc.)
  duration        : string | null   ("3 days", "2 weeks", etc.)
  timeframe       : string | null   ("next month", "this year", etc.)
Set to null if NOT explicitly stated in this specific message.

STEP 3 — Determine genuinely missing facts:
  - For affordability ONLY: need targetAmount (numeric goal cost).
  - A fact is missing ONLY if absent from BOTH this message AND the already-known facts above.
  - If targetAmount is in known facts → missingFacts = [].
  - For subscriptions / investments / statement / general → missingFacts = [].

STEP 4 — If missingFacts is non-empty, write ONE concise, natural question to ask the user.
Example: "How much do you expect the entire trip to cost?"

Return ONLY valid JSON (no markdown):
{
  "queryCategory": "affordability" | "subscriptions" | "investments" | "statement" | "general",
  "extractedFacts": { "goalType": null, "destination": null, "targetAmount": null, "targetCurrency": null, "duration": null, "timeframe": null },
  "missingFacts": [],
  "followUpQuestion": null
}
`);

    // Strip nulls from extracted facts
    const cleanFacts = Object.fromEntries(
      Object.entries(result.extractedFacts ?? {}).filter(([, v]) => v !== null && v !== undefined)
    );

    // Currency safety: if a foreign goal currency was extracted, store as targetCurrency
    // so the user's home currency (profileCurrency) is never overwritten.
    if (cleanFacts.targetCurrency) {
      const home = (state.knownFacts?.profileCurrency ?? state.knownFacts?.currency) as string | undefined;
      if (home && cleanFacts.targetCurrency !== home) {
        delete cleanFacts.currency; // don't let goal currency pollute home currency field
      }
    }

    return {
      extractedFacts: cleanFacts,
      missingFacts: Array.isArray(result.missingFacts) ? result.missingFacts : [],
      followUpQuestion: result.followUpQuestion ?? "Could you give me a bit more detail?",
      queryCategory: result.queryCategory ?? "general",
    };
  }
}
