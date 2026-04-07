/**
 * DB-backed conversation state store.
 * Stores V2State inside the existing chat_sessions table via SessionRepository,
 * using a namespaced key so it never conflicts with other fields.
 */

import type { SessionRepository } from "../repo/session.repo.js";
import type { V2State } from "./types.js";

const V2_STATE_KEY = "__v2_pipeline_state__";

export class ConversationStore {
  constructor(private readonly sessionRepo: SessionRepository) {}

  async load(userId: string, sessionId: string): Promise<V2State> {
    try {
      const facts = await this.sessionRepo.getKnownFacts(userId, sessionId);
      const raw = facts[V2_STATE_KEY];
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return raw as V2State;
      }
    } catch {
      // Fall through to default
    }
    return { stage: "GENERAL" };
  }

  async save(userId: string, sessionId: string, state: V2State): Promise<void> {
    try {
      const existing = await this.sessionRepo.getKnownFacts(userId, sessionId);
      await this.sessionRepo.setKnownFacts(userId, sessionId, {
        ...existing,
        [V2_STATE_KEY]: state,
      });
    } catch (err) {
      console.warn("[ConversationStore] Failed to save V2 state:", err);
    }
  }
}
