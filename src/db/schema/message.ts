import { Generated } from "kysely";

/**
 * messages table (numeric / long-based)
 */
export interface MessagesTable {
  // UUID
  id: Generated<string>;

  conversation_id: string;
  sender_id: string;

  // FK → graph_state.id
  graph_state_id: string | null;

  // Numeric role (1=user, 2=assistant, 3=system)
  role: MessageRoleCode;

  message: string;

  // JSONB for flexibility
  metadata: unknown | null;

  // Epoch milliseconds (BIGINT)
  created_at: Generated<bigint>;
}


export const MessageRole = {
    USER: 1,
    ASSISTANT: 2,
    SYSTEM: 3,
  } as const;
  
  export type MessageRoleCode =
    typeof MessageRole[keyof typeof MessageRole];

