import { Generated } from "kysely";


/**
 * graph_state table (numeric/long-based)
 */
export interface GraphStateTable {
  // UUID
  id: Generated<string>;

  conversation_id: string;
  user_id: string;

  // Numeric status code (SMALLINT / INT)
  status: GraphStatusCode;

  current_node: number | null;   // numeric node id
  last_agent: number | null;     // numeric agent id

  // LangGraph snapshot
  state: unknown;

  error_message: string | null;

  // Epoch milliseconds (BIGINT)
  created_at: Generated<bigint>;
  updated_at: Generated<bigint>;
}

export const GraphStatus = {
    RUNNING: 1,
    WAITING_FOR_USER: 2,
    COMPLETED: 3,
    FAILED: 4,
  } as const;
  
  export type GraphStatusCode =
    typeof GraphStatus[keyof typeof GraphStatus];