

export interface StructuredFinancialData {
  balances: any[];
  // Removed missing types: monthlySummaries, loans, investments, creditProfile
  // Add them back if you define them in structured_finance_data.ts
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
