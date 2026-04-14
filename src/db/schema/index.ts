import { GraphStateTable } from "./graph_state.js";
import { MessagesTable } from "./message.js";
import {
  AccountBalancesTable,
  TreasuryCashflowDailyTable,
  TreasuryDecisionSnapshotsTable,
  TreasurySupplierPaymentCandidatesTable,
  TreasuryAccountTransactionsTable,
} from "./structured_finance_data.js";
import { FinancialDataSyncTable } from "./sync.js";
import { UsersTable } from "./user.js";
import { VectorDocumentsTable } from "./vector_documents.js";

export interface Database {
  users: UsersTable;
  messages: MessagesTable;
  graph_state: GraphStateTable;
  vector_documents: VectorDocumentsTable;
  account_balances: AccountBalancesTable;
  // Removed missing types: financial_summary_monthly, loan_accounts, investment_summary, credit_profile
  // Add them back if you define them in structured_finance_data.ts
  treasury_cashflow_daily: TreasuryCashflowDailyTable;
  treasury_decision_snapshots: TreasuryDecisionSnapshotsTable;
  treasury_supplier_payment_candidates: TreasurySupplierPaymentCandidatesTable;
  treasury_account_transactions: TreasuryAccountTransactionsTable;
  financial_data_sync: FinancialDataSyncTable;
}
