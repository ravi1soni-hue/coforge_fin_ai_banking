import pool from "../config/db.js";

const SEED_DATA = {
  user: {
    userId: "usr_uk_001",
    name: "Oliver Bennett",
    country: "UK",
    currency: "GBP",
    createdAt: "2021-04-12",
  },
  accounts: [
    {
      AccountId: "acc_gb_1001",
      AccountType: "Personal",
      SubType: "Salary",
      Nickname: "Barclays Salary",
      Currency: "GBP",
      AccountNumber: { SortCode: "20-11-82", AccountNumber: "******3456" },
      Servicer: { Name: "Barclays Bank UK PLC" },
      OpenedDate: "2020-03-14",
      Balance: { Amount: 18452.75, Type: "InterimAvailable" },
    },
    {
      AccountId: "acc_gb_1002",
      AccountType: "Personal",
      SubType: "Savings",
      Nickname: "Monzo Savings",
      Currency: "GBP",
      AccountNumber: { SortCode: "04-00-04", AccountNumber: "******2291" },
      Servicer: { Name: "Monzo Bank Ltd" },
      OpenedDate: "2021-08-01",
      Balance: { Amount: 42350.4, Type: "InterimAvailable" },
    },
    {
      AccountId: "acc_gb_1003",
      AccountType: "Business",
      SubType: "CurrentAccount",
      Nickname: "Starling Current",
      Currency: "GBP",
      AccountNumber: { SortCode: "60-83-71", AccountNumber: "******9084" },
      Servicer: { Name: "Starling Bank" },
      OpenedDate: "2022-02-11",
      Balance: { Amount: 98234.2, Type: "InterimAvailable" },
    },
    {
      AccountId: "acc_gb_1004",
      AccountType: "Personal",
      SubType: "Joint",
      Nickname: "HSBC Joint",
      Currency: "GBP",
      AccountNumber: { SortCode: "40-18-25", AccountNumber: "******7712" },
      Servicer: { Name: "HSBC UK" },
      OpenedDate: "2019-05-10",
      Balance: { Amount: 21200.0, Type: "InterimAvailable" },
    },
  ],
  investments: [
    {
      InvestmentId: "inv_uk_3001",
      ProductType: "StocksAndSharesISA",
      Provider: "Vanguard UK",
      Name: "FTSE Global All Cap Index Fund",
      InvestedAmount: 42000,
      CurrentValue: 53800,
    },
    {
      InvestmentId: "inv_uk_3002",
      ProductType: "GIA",
      Provider: "Trading212",
      Name: "Apple Inc",
      Units: 35,
      InvestedAmount: 39200,
      CurrentValue: 45500,
    },
    {
      InvestmentId: "inv_uk_3003",
      ProductType: "ETF",
      Provider: "Hargreaves Lansdown",
      Name: "iShares Core MSCI World ETF",
      InvestedAmount: 28000,
      CurrentValue: 33640,
    },
    {
      InvestmentId: "inv_uk_3004",
      ProductType: "Pension",
      Provider: "Nest",
      Name: "Workplace Pension",
      InvestedAmount: 76000,
      CurrentValue: 98200,
    },
    {
      InvestmentId: "inv_uk_3005",
      ProductType: "REIT",
      Provider: "Fidelity",
      Name: "UK Real Estate Fund",
      InvestedAmount: 15000,
      CurrentValue: 16850,
    },
    {
      InvestmentId: "inv_uk_3006",
      ProductType: "SavingsBond",
      Provider: "NS&I",
      Name: "Premium Bonds",
      InvestedAmount: 10000,
      CurrentValue: 10350,
    },
  ],
  loans: [
    {
      LoanId: "loan_uk_2001",
      LoanType: "Mortgage",
      Provider: "Nationwide",
      Principal: 385000,
      OutstandingBalance: 342800,
      InterestRate: 4.19,
      TermMonths: 300,
      EMI: 1890,
      NextPaymentDate: "2026-04-01",
      LinkedAccountId: "acc_gb_1001",
    },
    {
      LoanId: "loan_uk_2002",
      LoanType: "PersonalLoan",
      Provider: "Lloyds Bank",
      Principal: 18000,
      OutstandingBalance: 9200,
      InterestRate: 6.8,
      TermMonths: 60,
      EMI: 348,
      NextPaymentDate: "2026-03-28",
      LinkedAccountId: "acc_gb_1001",
    },
  ],
  subscriptions: [
    { SubscriptionId: "sub_uk_5001", Provider: "Netflix", Amount: 15.99, Cycle: "Monthly" },
    { SubscriptionId: "sub_uk_5002", Provider: "Spotify", Amount: 10.99, Cycle: "Monthly" },
    { SubscriptionId: "sub_uk_5003", Provider: "Amazon Prime", Amount: 8.99, Cycle: "Monthly" },
    { SubscriptionId: "sub_uk_5004", Provider: "Apple iCloud", Amount: 2.99, Cycle: "Monthly" },
    { SubscriptionId: "sub_uk_5005", Provider: "YouTube Premium", Amount: 12.99, Cycle: "Monthly" },
    { SubscriptionId: "sub_uk_5006", Provider: "Headspace", Amount: 9.99, Cycle: "Monthly" },
  ],
  transactions: [
    {
      TransactionId: "txn_uk_0001",
      AccountId: "acc_gb_1001",
      Amount: 5200,
      Currency: "GBP",
      CreditDebitIndicator: "Credit",
      Category: "Salary",
      Merchant: "Acme Software Ltd",
      BookingDateTime: "2025-10-28T10:02:00Z",
    },
    {
      TransactionId: "txn_uk_0002",
      AccountId: "acc_gb_1001",
      Amount: 1890,
      Currency: "GBP",
      CreditDebitIndicator: "Debit",
      Category: "Mortgage",
      Merchant: "Nationwide",
      BookingDateTime: "2025-11-01T08:00:00Z",
    },
    {
      TransactionId: "txn_uk_0003",
      AccountId: "acc_gb_1001",
      Amount: 98.4,
      Currency: "GBP",
      CreditDebitIndicator: "Debit",
      Category: "Groceries",
      Merchant: "Tesco",
      BookingDateTime: "2025-11-03T18:21:00Z",
    },
    {
      TransactionId: "txn_uk_0004",
      AccountId: "acc_gb_1001",
      Amount: 52.3,
      Currency: "GBP",
      CreditDebitIndicator: "Debit",
      Category: "Fuel",
      Merchant: "Shell",
      BookingDateTime: "2025-11-05T09:14:00Z",
    },
    {
      TransactionId: "txn_uk_0005",
      AccountId: "acc_gb_1001",
      Amount: 15.99,
      Currency: "GBP",
      CreditDebitIndicator: "Debit",
      Category: "Subscription",
      Merchant: "Netflix",
      BookingDateTime: "2025-11-06T06:30:00Z",
    },
  ],
};

const ensureSchema = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT,
      currency TEXT,
      created_at DATE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS accounts (
      account_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      account_type TEXT,
      sub_type TEXT,
      nickname TEXT,
      currency TEXT,
      sort_code TEXT,
      masked_account_number TEXT,
      servicer_name TEXT,
      opened_date DATE,
      balance_amount NUMERIC(14,2),
      balance_type TEXT,
      raw_json JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS investments (
      investment_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      product_type TEXT,
      provider TEXT,
      name TEXT,
      units NUMERIC(14,4),
      invested_amount NUMERIC(14,2),
      current_value NUMERIC(14,2),
      raw_json JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS loans (
      loan_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      linked_account_id TEXT REFERENCES accounts(account_id),
      loan_type TEXT,
      provider TEXT,
      principal NUMERIC(14,2),
      outstanding_balance NUMERIC(14,2),
      interest_rate NUMERIC(6,3),
      term_months INTEGER,
      emi NUMERIC(14,2),
      next_payment_date DATE,
      raw_json JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      subscription_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      provider TEXT,
      amount NUMERIC(14,2),
      cycle TEXT,
      raw_json JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      transaction_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      account_id TEXT REFERENCES accounts(account_id),
      amount NUMERIC(14,2),
      currency TEXT,
      credit_debit_indicator TEXT,
      category TEXT,
      merchant TEXT,
      booking_datetime TIMESTAMPTZ,
      raw_json JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
};

export const seedUkFinancialDataToPostgres = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSchema(client);

    const { userId, name, country, currency, createdAt } = SEED_DATA.user;

    await client.query(
      `
      INSERT INTO users (user_id, name, country, currency, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        country = EXCLUDED.country,
        currency = EXCLUDED.currency,
        created_at = EXCLUDED.created_at,
        updated_at = NOW();
      `,
      [userId, name, country, currency, createdAt]
    );

    for (const account of SEED_DATA.accounts) {
      await client.query(
        `
        INSERT INTO accounts (
          account_id, user_id, account_type, sub_type, nickname, currency,
          sort_code, masked_account_number, servicer_name, opened_date,
          balance_amount, balance_type, raw_json, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, NOW())
        ON CONFLICT (account_id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          account_type = EXCLUDED.account_type,
          sub_type = EXCLUDED.sub_type,
          nickname = EXCLUDED.nickname,
          currency = EXCLUDED.currency,
          sort_code = EXCLUDED.sort_code,
          masked_account_number = EXCLUDED.masked_account_number,
          servicer_name = EXCLUDED.servicer_name,
          opened_date = EXCLUDED.opened_date,
          balance_amount = EXCLUDED.balance_amount,
          balance_type = EXCLUDED.balance_type,
          raw_json = EXCLUDED.raw_json,
          updated_at = NOW();
        `,
        [
          account.AccountId,
          userId,
          account.AccountType,
          account.SubType,
          account.Nickname,
          account.Currency,
          account.AccountNumber?.SortCode || null,
          account.AccountNumber?.AccountNumber || null,
          account.Servicer?.Name || null,
          account.OpenedDate,
          account.Balance?.Amount || 0,
          account.Balance?.Type || null,
          JSON.stringify(account),
        ]
      );
    }

    for (const investment of SEED_DATA.investments) {
      await client.query(
        `
        INSERT INTO investments (
          investment_id, user_id, product_type, provider, name,
          units, invested_amount, current_value, raw_json, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
        ON CONFLICT (investment_id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          product_type = EXCLUDED.product_type,
          provider = EXCLUDED.provider,
          name = EXCLUDED.name,
          units = EXCLUDED.units,
          invested_amount = EXCLUDED.invested_amount,
          current_value = EXCLUDED.current_value,
          raw_json = EXCLUDED.raw_json,
          updated_at = NOW();
        `,
        [
          investment.InvestmentId,
          userId,
          investment.ProductType,
          investment.Provider,
          investment.Name,
          investment.Units || null,
          investment.InvestedAmount,
          investment.CurrentValue,
          JSON.stringify(investment),
        ]
      );
    }

    for (const loan of SEED_DATA.loans) {
      await client.query(
        `
        INSERT INTO loans (
          loan_id, user_id, linked_account_id, loan_type, provider,
          principal, outstanding_balance, interest_rate, term_months,
          emi, next_payment_date, raw_json, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, NOW())
        ON CONFLICT (loan_id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          linked_account_id = EXCLUDED.linked_account_id,
          loan_type = EXCLUDED.loan_type,
          provider = EXCLUDED.provider,
          principal = EXCLUDED.principal,
          outstanding_balance = EXCLUDED.outstanding_balance,
          interest_rate = EXCLUDED.interest_rate,
          term_months = EXCLUDED.term_months,
          emi = EXCLUDED.emi,
          next_payment_date = EXCLUDED.next_payment_date,
          raw_json = EXCLUDED.raw_json,
          updated_at = NOW();
        `,
        [
          loan.LoanId,
          userId,
          loan.LinkedAccountId,
          loan.LoanType,
          loan.Provider,
          loan.Principal,
          loan.OutstandingBalance,
          loan.InterestRate,
          loan.TermMonths,
          loan.EMI,
          loan.NextPaymentDate,
          JSON.stringify(loan),
        ]
      );
    }

    for (const subscription of SEED_DATA.subscriptions) {
      await client.query(
        `
        INSERT INTO subscriptions (
          subscription_id, user_id, provider, amount, cycle, raw_json, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
        ON CONFLICT (subscription_id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          provider = EXCLUDED.provider,
          amount = EXCLUDED.amount,
          cycle = EXCLUDED.cycle,
          raw_json = EXCLUDED.raw_json,
          updated_at = NOW();
        `,
        [
          subscription.SubscriptionId,
          userId,
          subscription.Provider,
          subscription.Amount,
          subscription.Cycle,
          JSON.stringify(subscription),
        ]
      );
    }

    for (const txn of SEED_DATA.transactions) {
      await client.query(
        `
        INSERT INTO transactions (
          transaction_id, user_id, account_id, amount, currency,
          credit_debit_indicator, category, merchant, booking_datetime,
          raw_json, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
        ON CONFLICT (transaction_id)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          account_id = EXCLUDED.account_id,
          amount = EXCLUDED.amount,
          currency = EXCLUDED.currency,
          credit_debit_indicator = EXCLUDED.credit_debit_indicator,
          category = EXCLUDED.category,
          merchant = EXCLUDED.merchant,
          booking_datetime = EXCLUDED.booking_datetime,
          raw_json = EXCLUDED.raw_json,
          updated_at = NOW();
        `,
        [
          txn.TransactionId,
          userId,
          txn.AccountId,
          txn.Amount,
          txn.Currency,
          txn.CreditDebitIndicator,
          txn.Category,
          txn.Merchant,
          txn.BookingDateTime,
          JSON.stringify(txn),
        ]
      );
    }

    await client.query("COMMIT");

    return {
      success: true,
      userId,
      inserted: {
        accounts: SEED_DATA.accounts.length,
        investments: SEED_DATA.investments.length,
        loans: SEED_DATA.loans.length,
        subscriptions: SEED_DATA.subscriptions.length,
        transactions: SEED_DATA.transactions.length,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
