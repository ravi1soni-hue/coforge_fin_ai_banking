import { sql } from "kysely";
export class SessionRepository {
    tableReady;
    db;
    constructor({ db }) {
        this.db = db;
    }
    async getKnownFacts(userId, sessionId) {
        try {
            await this.ensureTable();
            const result = await sql `
        SELECT known_facts
        FROM chat_sessions
        WHERE user_id = ${userId} AND session_id = ${sessionId}
        LIMIT 1
      `.execute(this.db);
            const row = result.rows[0];
            if (!row)
                return {};
            if (typeof row.known_facts === "object" && row.known_facts !== null) {
                return row.known_facts;
            }
            if (typeof row.known_facts === "string") {
                return JSON.parse(row.known_facts);
            }
            return {};
        }
        catch (error) {
            console.warn("Failed to load session known facts from DB:", error);
            return {};
        }
    }
    async setKnownFacts(userId, sessionId, facts) {
        try {
            await this.ensureTable();
            await sql `
        INSERT INTO chat_sessions (user_id, session_id, known_facts, updated_at)
        VALUES (${userId}, ${sessionId}, ${JSON.stringify(facts)}::jsonb, NOW())
        ON CONFLICT (user_id, session_id)
        DO UPDATE SET
          known_facts = EXCLUDED.known_facts,
          updated_at = NOW()
      `.execute(this.db);
        }
        catch (error) {
            console.warn("Failed to persist session known facts to DB:", error);
        }
    }
    async ensureTable() {
        if (!this.tableReady) {
            this.tableReady = sql `
        CREATE TABLE IF NOT EXISTS chat_sessions (
          user_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          known_facts JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (user_id, session_id)
        )
      `
                .execute(this.db)
                .then(() => undefined)
                .catch((error) => {
                this.tableReady = undefined;
                throw error;
            });
        }
        await this.tableReady;
    }
}
