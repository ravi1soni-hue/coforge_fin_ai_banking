export interface ChatFeedback {
  id?: string;
  userId: string;
  sessionId: string;
  type: string;
  comment?: string;
  forMessageId?: string;
  createdAt?: Date;
}
  async saveFeedback(feedback: ChatFeedback): Promise<string | undefined> {
    try {
      await this.ensureFeedbackTable();
      const result = await sql`
        INSERT INTO chat_feedback (user_id, session_id, type, comment, for_message_id)
        VALUES (${feedback.userId}, ${feedback.sessionId}, ${feedback.type}, ${feedback.comment ?? null}, ${feedback.forMessageId ?? null})
        RETURNING id
      `.execute(this.db);
      return result.rows[0]?.id;
    } catch (error) {
      console.warn("Failed to save chat feedback:", error);
      return undefined;
    }
  }

  private async ensureFeedbackTable(): Promise<void> {
    if (!(this as any)._feedbackTableReady) {
      (this as any)._feedbackTableReady = sql`
        CREATE TABLE IF NOT EXISTS chat_feedback (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          comment TEXT,
          for_message_id TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `
        .execute(this.db)
        .then(() => undefined)
        .catch((error) => {
          (this as any)._feedbackTableReady = undefined;
          throw error;
        });
    }
    await (this as any)._feedbackTableReady;
  }
import { Kysely, sql } from "kysely";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export class ChatRepository {
    async saveFeedback(feedback: ChatFeedback): Promise<string | undefined> {
      try {
        await this.ensureFeedbackTable();
        const result = await sql`
          INSERT INTO chat_feedback (user_id, session_id, type, comment, for_message_id)
          VALUES (${feedback.userId}, ${feedback.sessionId}, ${feedback.type}, ${feedback.comment ?? null}, ${feedback.forMessageId ?? null})
          RETURNING id
        `.execute(this.db);
        return result.rows[0]?.id;
      } catch (error) {
        console.warn("Failed to save chat feedback:", error);
        return undefined;
      }
    }

    private async ensureFeedbackTable(): Promise<void> {
      if (!(this as any)._feedbackTableReady) {
        (this as any)._feedbackTableReady = sql`
          CREATE TABLE IF NOT EXISTS chat_feedback (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            type TEXT NOT NULL,
            comment TEXT,
            for_message_id TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `
          .execute(this.db)
          .then(() => undefined)
          .catch((error) => {
            (this as any)._feedbackTableReady = undefined;
            throw error;
          });
      }
      await (this as any)._feedbackTableReady;
    }
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
