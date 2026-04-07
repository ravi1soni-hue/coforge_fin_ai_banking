import { sql } from "kysely";
export class ChatRepository {
    tableReady;
    db;
    constructor({ db }) {
        this.db = db;
    }
    async saveMessage(userId, sessionId, role, content) {
        try {
            await this.ensureTable();
            await sql `
        INSERT INTO chat_messages (user_id, session_id, role, content)
        VALUES (${userId}, ${sessionId}, ${role}, ${content})
      `.execute(this.db);
        }
        catch (error) {
            console.warn("Failed to save chat message:", error);
        }
    }
    async getHistory(userId, sessionId, limit = 10) {
        try {
            await this.ensureTable();
            const result = await sql `
        SELECT role, content
        FROM chat_messages
        WHERE user_id = ${userId} AND session_id = ${sessionId}
        ORDER BY created_at ASC
        LIMIT ${limit}
      `.execute(this.db);
            return result.rows.map((row) => ({
                role: row.role,
                content: row.content,
            }));
        }
        catch (error) {
            console.warn("Failed to load chat history from DB:", error);
            return [];
        }
    }
    async ensureTable() {
        if (!this.tableReady) {
            this.tableReady = sql `
        CREATE TABLE IF NOT EXISTS chat_messages (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
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
