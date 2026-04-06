import {
  AccountBalancesTable,
  CreditProfileTable,
  FinancialSummaryMonthlyTable,
  InvestmentSummaryTable,
  LoanAccountsTable,
} from "../db/schema/structured_finance_data.js";

export interface StructuredFinancialData {
  balances: Partial<AccountBalancesTable>[];
  monthlySummaries: Partial<FinancialSummaryMonthlyTable>[];
  loans: Partial<LoanAccountsTable>[];
  investments: Partial<InvestmentSummaryTable>[];
  creditProfile?: Partial<CreditProfileTable>;
}

export type FinancialActivityType = "transaction" | "investment";

export interface OBBaseFinancialActivity {
  activityType: FinancialActivityType;
  activityId: string;
  userId: string;
  bookingDate: string; // YYYY-MM-DD
  amount: {
    value: number;
    currency: string;
  };
  description: string;
  source: string;
  metadata?: {
    rawText?: string;
    [key: string]: unknown;
  };
}

export interface OBTransactionActivity extends OBBaseFinancialActivity {
  activityType: "transaction";
  creditDebitIndicator: "credit" | "debit";
  merchant?: {
    name?: string;
    category?: string;
    countryCode?: string;
  };
}

export interface OBInvestmentActivity extends OBBaseFinancialActivity {
  activityType: "investment";
  instrument: {
    name: string;
    isin?: string;
    symbol?: string;
    assetClass?: string;
  };
}

export type OBFinancialActivityDTO = OBTransactionActivity | OBInvestmentActivity;

export interface IBankProvider {
  name: string;
  fetchTransactions(
    connectionId: string,
    fromDate: string | null
  ): Promise<OBBaseFinancialActivity[]>;
  fetchStructuredFinancialData(
    connectionId: string
  ): Promise<StructuredFinancialData>;
}
