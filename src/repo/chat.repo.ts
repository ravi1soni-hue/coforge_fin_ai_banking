import { Kysely, sql } from "kysely";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export class ChatRepository {
  private tableReady?: Promise<void>;
  private readonly db: Kysely<unknown>;

  constructor({ db }: { db: Kysely<unknown> }) {
    this.db = db;
  }

  async saveMessage(
    userId: string,
    sessionId: string,
    role: "user" | "assistant",
    content: string
  ): Promise<void> {
    try {
      await this.ensureTable();
      await sql`
        INSERT INTO chat_messages (user_id, session_id, role, content)
        VALUES (${userId}, ${sessionId}, ${role}, ${content})
      `.execute(this.db);
    } catch (error) {
      console.warn("Failed to save chat message:", error);
    }
  }

  async getHistory(
    userId: string,
    sessionId: string,
    limit = 10
  ): Promise<ChatMessage[]> {
    try {
      await this.ensureTable();
      const result = await sql<{ role: string; content: string }>`
        SELECT role, content
        FROM chat_messages
        WHERE user_id = ${userId} AND session_id = ${sessionId}
        ORDER BY created_at ASC
        LIMIT ${limit}
      `.execute(this.db);

      return result.rows.map((row) => ({
        role: row.role as "user" | "assistant",
        content: row.content,
      }));
    } catch (error) {
      console.warn("Failed to load chat history from DB:", error);
      return [];
    }
  }

  private async ensureTable(): Promise<void> {
    if (!this.tableReady) {
      this.tableReady = sql`
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
