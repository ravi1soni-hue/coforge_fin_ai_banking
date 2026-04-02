import { Generated, Selectable, Insertable } from "kysely";

export interface FinancialDataSyncTable {
  id: Generated<string>;
  
    // Links to UsersTable.id
  user_id: string;

  // External Reference (e.g., Plaid Item ID or Salt Edge Connection ID)
  external_connection_id: string;
  /**
   * Sync Status:
   * 1 = PENDING (Data received, not processed)
   * 2 = PROCESSING (Currently updating sub-tables)
   * 3 = COMPLETED (Success)
   * 4 = FAILED (Check error_log)
   */
  status: 1 | 2 | 3 | 4;

  error_log: string | null;

  // Performance tracking
  started_at: Generated<string>; // BIGINT
  completed_at: string | null;   // BIGINT
}

export type FinancialSync = Selectable<FinancialDataSyncTable>;
export type NewFinancialSync = Insertable<FinancialDataSyncTable>;
