import { GraphStateTable } from "./graph_state.js";
import { MessagesTable } from "./message.js";
import { AccountBalancesTable, CreditProfileTable, InvestmentSummaryTable, LoanAccountsTable,FinancialSummaryMonthlyTable } from "./structured_finance_data.js";
import { FinancialDataSyncTable } from "./sync.js";
import { UsersTable } from "./user.js";
import { VectorDocumentsTable } from "./vector_documents.js";

export interface Database {
    users: UsersTable
    messages: MessagesTable;
    graphStates: GraphStateTable;
    vectorDocuments: VectorDocumentsTable;
    account_balances: AccountBalancesTable;
    financial_summary_monthly: FinancialSummaryMonthlyTable;
    loan_accounts: LoanAccountsTable;
    investment_summary: InvestmentSummaryTable;
    credit_profile: CreditProfileTable;
    financial_data_sync: FinancialDataSyncTable;
  }
  