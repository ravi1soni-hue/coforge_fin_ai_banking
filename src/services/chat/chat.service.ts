import type { GraphStateType } from "../../agent_orchastration/graph/state.js";
import { FinancialAssistantService } from "../../agent_orchastration/services/FinancialAssistantService.js";

/* ---------------- Types ---------------- */

export interface ChatRequest {
  userId: string;
  message: string;
  sessionId?: string;
  knownFacts?: Record<string, unknown>;
}

export interface ChatResponse {
  type: "FOLLOW_UP" | "FINAL" | "ERROR";
  message: string;
  missingFacts?: string[];
}

/* ---------------- Service ---------------- */

export class ChatService {

  private readonly assistantService: FinancialAssistantService;
  private readonly sessionKnownFacts = new Map<
    string,
    Record<string, unknown>
  >();

  constructor({
    assistantService,
  }: {
    assistantService: FinancialAssistantService;
  }) {
    this.assistantService = assistantService;

    console.log(
      "✅ assistantService REAL instance:",
      assistantService.constructor.name
    );
  }


  /**
   * Handles a single chat turn
   */
  async handleMessage(request: ChatRequest): Promise<ChatResponse> {
    const sessionKey = this.getSessionKey(
      request.userId,
      request.sessionId
    );

    const persistedFacts =
      this.sessionKnownFacts.get(sessionKey) ?? {};
    const extractedFacts = this.extractFactsFromMessage(
      request.message
    );
    const mergedKnownFacts = {
      ...persistedFacts,
      ...(request.knownFacts ?? {}),
      ...extractedFacts,
    };

    this.sessionKnownFacts.set(sessionKey, mergedKnownFacts);

    const initialState: GraphStateType = {
      userId: request.userId,
      question: request.message,
      knownFacts: mergedKnownFacts,
      missingFacts: [],
    };

    let resultState: GraphStateType;

    try {
      resultState =
        await this.assistantService.run(initialState);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);

      console.error("❌ ChatService error:", message);

      return {
        type: "ERROR",
        message:
          "Sorry, I ran into an internal problem while answering. Please try again.",
      };
    }

    /* ---------------- FOLLOW‑UP CASE ---------------- */
    if (
      Array.isArray(resultState.missingFacts) &&
      resultState.missingFacts.length > 0
    ) {
      return {
        type: "FOLLOW_UP",
        message:
          resultState.finalAnswer ??
          "I need a bit more information to help you better.",
        missingFacts: resultState.missingFacts,
      };
    }

    /* ---------------- FINAL ANSWER CASE ---------------- */
    return {
      type: "FINAL",
      message:
        resultState.finalAnswer ??
        "I couldn’t generate an answer. Please try again.",
    };
  }

  private getSessionKey(
    userId: string,
    sessionId?: string
  ): string {
    return `${userId}::${sessionId ?? "default"}`;
  }

  private extractFactsFromMessage(
    message: string
  ): Record<string, unknown> {
    const text = message.trim();
    const lowerText = text.toLowerCase();
    const facts: Record<string, unknown> = {};

    if (/\balone\b|\bsolo\b/.test(lowerText)) {
      facts.travelersCount = 1;
    }

    const fromMatch = text.match(
      /\bfrom\s+([a-zA-Z\s]{2,30})(?:\bto\b|\bnext\b|\bthis\b|\bfor\b|$)/i
    );
    if (fromMatch?.[1]) {
      facts.departureLocation = fromMatch[1].trim();
    }

    if (/\bnext month\b/i.test(text)) {
      facts.timeframe = "next_month";
    }

    const budgetMatch = text.match(
      /(?:budget|under|around)\s*(?:is|of|about)?\s*([£$€]?\s?\d[\d,]*(?:\.\d{1,2})?)/i
    );
    if (budgetMatch?.[1]) {
      facts.budget = budgetMatch[1].replace(/\s+/g, "").trim();
    }

    if (/\bjapan\b/i.test(text)) {
      facts.destination = "Japan";
      facts.queryType = "affordability";
    }

    const amountPrefixMatch = text.match(/([£$€])\s?(\d[\d,]*(?:\.\d{1,2})?)/);
    const amountSuffixMatch = text.match(/(\d[\d,]*(?:\.\d{1,2})?)\s?([£$€])/);

    const amountValue = amountPrefixMatch?.[2] ?? amountSuffixMatch?.[1];
    const amountCurrency = amountPrefixMatch?.[1] ?? amountSuffixMatch?.[2];

    if (amountValue) {
      const normalized = Number(amountValue.replace(/,/g, ""));
      if (!Number.isNaN(normalized)) {
        facts.targetAmount = normalized;
      }

      if (amountCurrency === "$") {
        facts.currency = "USD";
      } else if (amountCurrency === "£") {
        facts.currency = "GBP";
      } else if (amountCurrency === "€") {
        facts.currency = "EUR";
      }

      facts.queryType = facts.queryType ?? "affordability";
    }

    if (facts.budget && !facts.targetAmount) {
      const budgetNumeric = String(facts.budget).match(/\d[\d,]*(?:\.\d{1,2})?/);
      if (budgetNumeric?.[0]) {
        const normalizedBudget = Number(budgetNumeric[0].replace(/,/g, ""));
        if (!Number.isNaN(normalizedBudget)) {
          facts.targetAmount = normalizedBudget;
        }
      }
    }

    if (/\bcar\b/i.test(text)) {
      facts.goalType = "car";
      facts.queryType = "affordability";
    }

    if (/\bholiday|trip|travel|vacation|afford|budget\b/i.test(text)) {
      facts.queryType = facts.queryType ?? "affordability";
    }

    if (/\bsubscription|subscriptions\b/i.test(text)) {
      facts.queryType = "subscriptions";
    }

    if (/\binvestment\b.*\bprofit\b|\bprofit\b.*\binvestment\b/i.test(text)) {
      facts.queryType = "investment_performance";
      if (/\blast month\b/i.test(text)) {
        facts.period = "last_month";
      }
    }

    if (/\bbank statement\b|\bstatement\b/i.test(text)) {
      facts.queryType = "bank_statement";
      if (/\b1 month\b|\bone month\b|\blast month\b/i.test(text)) {
        facts.period = "last_month";
      }
    }

    return facts;
  }
}