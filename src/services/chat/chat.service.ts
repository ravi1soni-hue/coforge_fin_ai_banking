import type { GraphStateType } from "../../agent_orchastration/graph/state.js";
import { FinancialAssistantService } from "../../agent_orchastration/services/FinancialAssistantService.js";

/* ---------------- Types ---------------- */

export interface ChatRequest {
  userId: string;
  message: string;
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
    const initialState: GraphStateType = {
      userId: request.userId,
      question: request.message,
      knownFacts: request.knownFacts ?? {},
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
      resultState.missingFacts.length > 0 &&
      !resultState.finalAnswer
    ) {
      return {
        type: "FOLLOW_UP",
        message:
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
}