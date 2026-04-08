import {  DEFAULT_BASE_CURRENCY, toEnumValue, type GraphStateType } from "../../agent_orchastration/graph/state.js";
import { FinancialAssistantService } from "../../agent_orchastration/services/FinancialAssistantService.js";
import { UserService } from "../user.service.js";

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
  private readonly userService: UserService;

  constructor({
    assistantService,
    userService,
  }: {
    assistantService: FinancialAssistantService;
    userService: UserService;
  }) {
    this.assistantService = assistantService;
    this.userService = userService;

    console.log(
      "✅ assistantService REAL instance:",
      assistantService.constructor.name
    );
  }

  


  /**
   * Handles a single chat turn
   */
  async handleMessage(request: ChatRequest): Promise<ChatResponse> {

    

    const user = await this.userService.getUserById(request.userId);

    

    const initialState: GraphStateType = {
      userId: request.userId,
      question: request.message,
      knownFacts: request.knownFacts ?? {},
      missingFacts: [],
      queryFacets:[],
      baseCurrency: user?.base_currency  ?? DEFAULT_BASE_CURRENCY,
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