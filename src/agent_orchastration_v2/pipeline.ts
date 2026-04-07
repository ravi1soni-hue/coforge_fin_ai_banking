/**
 * V2 Orchestration Pipeline — deterministic state machine.
 *
 * Routing decisions are NEVER made by the LLM.
 * The LLM is called ONLY to generate user-facing text.
 *
 * Stage transitions:
 *   GENERAL          + affordability question (no amount) → AWAITING_AMOUNT
 *   GENERAL          + affordability question (has amount) → AFFORDABILITY_DONE
 *   GENERAL          + instalment request                  → deliver plan (need trip context) or GENERAL
 *   AWAITING_AMOUNT  + message has numeric amount          → AFFORDABILITY_DONE
 *   AWAITING_AMOUNT  + non-numeric message                 → re-ask
 *   AFFORDABILITY_DONE + affirmative ("yes please do that") → GENERAL (deliver instalment plan)
 *   AFFORDABILITY_DONE + new unrelated question            → GENERAL (answer new question)
 */

import type { LlmClient } from "../agent_orchastration/llm/llmClient.js";
import type { VectorQueryService } from "../agent_orchastration/services/vector.query.service.js";
import type { ChatRepository } from "../repo/chat.repo.js";
import type { SessionRepository } from "../repo/session.repo.js";

import { ConversationStore } from "./conversationStore.js";
import { FinancialLoader } from "./financialLoader.js";
import { isAffirmative, extractAmount, extractDestination } from "./messageParser.js";
import {
  classifyIntent,
  generateCostQuestion,
  generateAffordabilityAnswer,
  generateInstalmentSimulation,
  generateGeneralAnswer,
} from "./responseGenerators.js";

import type { ChatRequestV2, ChatResponseV2, TripContext, UserProfile, ConversationTurn } from "./types.js";

export class PipelineV2 {
  private readonly store: ConversationStore;
  private readonly loader: FinancialLoader;

  /** In-process conversation history cache: sessionKey → turns */
  private readonly historyCache = new Map<string, ConversationTurn[]>();

  constructor(
    private readonly llm: LlmClient,
    private readonly vectorQuery: VectorQueryService,
    private readonly chatRepo: ChatRepository,
    private readonly sessionRepo: SessionRepository,
  ) {
    this.store = new ConversationStore(sessionRepo);
    this.loader = new FinancialLoader(vectorQuery, llm);
  }

  // ─── Public entry point ────────────────────────────────────────────────────

  async handle(req: ChatRequestV2): Promise<ChatResponseV2> {
    const sid = req.sessionId ?? "default";
    const sessionKey = `${req.userId}::${sid}`;

    // Load conversation state & history in parallel
    const [v2State, history] = await Promise.all([
      this.store.load(req.userId, sid),
      this.loadHistory(req.userId, sid, sessionKey),
    ]);

    console.log(
      `[PipelineV2] userId=${req.userId} stage="${v2State.stage}" message="${req.message.slice(0, 60)}"`,
    );

    // Load user financial profile from incoming knownFacts
    const profile = await this.loader.loadProfile(
      req.userId,
      req.knownFacts ?? {},
    );

    // ── ROUTE ──────────────────────────────────────────────────────────────────

    let response: ChatResponseV2;

    if (v2State.stage === "AFFORDABILITY_DONE" && isAffirmative(req.message)) {
      // ── PATH A: User consented to instalment plan ──────────────────────────
      console.log("[PipelineV2] PATH A — instalment simulation (consent detected)");
      response = await this.handleInstalmentSimulation(
        req,
        profile,
        v2State.trip,
        history,
      );
      // After delivering instalments, reset stage to GENERAL
      await this.store.save(req.userId, sid, { stage: "GENERAL", profile });

    } else if (v2State.stage === "AWAITING_AMOUNT") {
      // ── PATH B: We asked for amount last turn — user is replying ───────────
      const extracted = extractAmount(req.message);

      if (extracted) {
        console.log(
          `[PipelineV2] PATH B — amount received: ${extracted.amount} ${extracted.currency}`,
        );
        const trip: TripContext = {
          cost: extracted.amount,
          currency: extracted.currency,
          destination: v2State.trip?.destination,
        };
        const answer = await generateAffordabilityAnswer(
          this.llm,
          profile,
          trip,
          [...history, { role: "user", content: req.message }],
        );
        response = { type: "FINAL", message: answer };
        await this.store.save(req.userId, sid, {
          stage: "AFFORDABILITY_DONE",
          trip,
          profile,
        });
      } else {
        // Still no amount — re-ask politely
        console.log("[PipelineV2] PATH B — no amount found, re-asking");
        const question = await generateCostQuestion(
          this.llm,
          req.message,
          v2State.trip?.destination,
        );
        response = { type: "FOLLOW_UP", message: question, missingFacts: ["targetAmount"] };
        await this.store.save(req.userId, sid, {
          ...v2State,
          stage: "AWAITING_AMOUNT",
        });
      }

    } else {
      // ── PATH C: GENERAL stage (or AFFORDABILITY_DONE + non-affirmative) ───
      // Classify the new message with a minimal LLM call
      const intent = await classifyIntent(
        this.llm,
        req.message,
        history,
      );
      console.log(`[PipelineV2] PATH C — classified intent: ${intent}`);

      if (intent === "AFFORDABILITY") {
        const extracted = extractAmount(req.message);
        const destination = extractDestination(req.message);

        if (extracted) {
          // We have everything — run affordability now
          const trip: TripContext = {
            cost: extracted.amount,
            currency: extracted.currency,
            destination,
          };
          const answer = await generateAffordabilityAnswer(
            this.llm,
            profile,
            trip,
            [...history, { role: "user", content: req.message }],
          );
          response = { type: "FINAL", message: answer };
          await this.store.save(req.userId, sid, {
            stage: "AFFORDABILITY_DONE",
            trip,
            profile,
          });
        } else {
          // Need the amount — ask for it
          const question = await generateCostQuestion(this.llm, req.message, destination);
          response = {
            type: "FOLLOW_UP",
            message: question,
            missingFacts: ["targetAmount"],
          };
          await this.store.save(req.userId, sid, {
            stage: "AWAITING_AMOUNT",
            trip: destination ? { cost: 0, currency: "GBP", destination } : undefined,
            profile,
          });
        }

      } else if (intent === "INSTALMENT_REQUEST") {
        // Instalment request in GENERAL stage — do we have trip context?
        if (v2State.trip?.cost && v2State.trip.cost > 0) {
          response = await this.handleInstalmentSimulation(
            req,
            profile,
            v2State.trip,
            history,
          );
          await this.store.save(req.userId, sid, { stage: "GENERAL", profile });
        } else {
          // No trip context — treat as general message
          const answer = await generateGeneralAnswer(
            this.llm,
            this.vectorQuery,
            req.userId,
            req.message,
            profile,
            [...history, { role: "user", content: req.message }],
          );
          response = { type: "FINAL", message: answer };
          await this.store.save(req.userId, sid, { stage: "GENERAL", profile });
        }

      } else {
        // GENERAL question
        const answer = await generateGeneralAnswer(
          this.llm,
          this.vectorQuery,
          req.userId,
          req.message,
          profile,
          [...history, { role: "user", content: req.message }],
        );
        response = { type: "FINAL", message: answer };
        await this.store.save(req.userId, sid, { stage: "GENERAL", profile });
      }
    }

    // ── Persist conversation history ───────────────────────────────────────
    const updatedHistory: ConversationTurn[] = [
      ...history,
      { role: "user" as const, content: req.message },
      { role: "assistant" as const, content: response.message },
    ].slice(-12);

    this.historyCache.set(sessionKey, updatedHistory);
    void this.chatRepo.saveMessage(req.userId, sid, "user", req.message);
    void this.chatRepo.saveMessage(req.userId, sid, "assistant", response.message);

    return response;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async handleInstalmentSimulation(
    req: ChatRequestV2,
    profile: UserProfile,
    tripCtx: TripContext | undefined,
    history: ConversationTurn[],
  ): Promise<ChatResponseV2> {
    if (!tripCtx || tripCtx.cost <= 0) {
      // No trip context — ask
      const question = await generateCostQuestion(this.llm, req.message);
      return {
        type: "FOLLOW_UP",
        message: question,
        missingFacts: ["targetAmount"],
      };
    }

    const answer = await generateInstalmentSimulation(
      this.llm,
      profile,
      tripCtx,
      [...history, { role: "user", content: req.message }],
    );

    return { type: "FINAL", message: answer };
  }

  private async loadHistory(
    userId: string,
    sessionId: string,
    sessionKey: string,
  ): Promise<ConversationTurn[]> {
    const cached = this.historyCache.get(sessionKey);
    if (cached) return cached;

    const dbHistory = await this.chatRepo.getHistory(userId, sessionId, 12);
    this.historyCache.set(sessionKey, dbHistory);
    return dbHistory;
  }
}
