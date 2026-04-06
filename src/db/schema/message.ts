import { Generated } from "kysely";

export interface MessagesTable {
  id: Generated<string>;

  conversation_id: string;
  sender_id: string;

  graph_state_id: string | null;

  /**
   * Role codes:
   * 1 = USER, 2 = ASSISTANT, 3 = SYSTEM
   */
  role: MessageRoleCode;

  message: string;

  metadata: unknown | null;

  created_at: Generated<bigint>;
}

export const MessageRole = {
  USER: 1,
  ASSISTANT: 2,
  SYSTEM: 3,
} as const;

export type MessageRoleCode = typeof MessageRole[keyof typeof MessageRole];
