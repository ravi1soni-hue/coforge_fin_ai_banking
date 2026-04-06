import { Generated, Selectable, Insertable } from "kysely";

export interface FinancialDataSyncTable {
  id: Generated<string>;
  user_id: string;
  external_connection_id: string;
  /**
   * Sync Status:
   * 1 = PENDING, 2 = PROCESSING, 3 = COMPLETED, 4 = FAILED
   */
  status: 1 | 2 | 3 | 4;
  error_log: string | null;
  started_at: Generated<string>;
  completed_at: string | null;
}

export type FinancialSync = Selectable<FinancialDataSyncTable>;
export type NewFinancialSync = Insertable<FinancialDataSyncTable>;
