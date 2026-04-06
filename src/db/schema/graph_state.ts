import { Generated } from "kysely";

export interface GraphStateTable {
  id: Generated<string>;

  conversation_id: string;
  user_id: string;

  status: GraphStatusCode;

  current_node: number | null;
  last_agent: number | null;

  state: unknown;

  error_message: string | null;

  created_at: Generated<bigint>;
  updated_at: Generated<bigint>;
}

export const GraphStatus = {
  RUNNING: 1,
  WAITING_FOR_USER: 2,
  COMPLETED: 3,
  FAILED: 4,
} as const;

export type GraphStatusCode = typeof GraphStatus[keyof typeof GraphStatus];
