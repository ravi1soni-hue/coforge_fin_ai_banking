/**
 * DB-backed conversation state store.
 * Stores V2State inside the existing chat_sessions table via SessionRepository,
 * using a namespaced key so it never conflicts with other fields.
 */
const V2_STATE_KEY = "__v2_pipeline_state__";
export class ConversationStore {
    sessionRepo;
    constructor(sessionRepo) {
        this.sessionRepo = sessionRepo;
    }
    async load(userId, sessionId) {
        try {
            const facts = await this.sessionRepo.getKnownFacts(userId, sessionId);
            const raw = facts[V2_STATE_KEY];
            if (raw && typeof raw === "object" && !Array.isArray(raw)) {
                return raw;
            }
        }
        catch {
            // Fall through to default
        }
        return { stage: "GENERAL" };
    }
    async save(userId, sessionId, state) {
        try {
            const existing = await this.sessionRepo.getKnownFacts(userId, sessionId);
            await this.sessionRepo.setKnownFacts(userId, sessionId, {
                ...existing,
                [V2_STATE_KEY]: state,
            });
        }
        catch (err) {
            console.warn("[ConversationStore] Failed to save V2 state:", err);
        }
    }
}
