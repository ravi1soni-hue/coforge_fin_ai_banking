async function insertUserFinancialProfile(client, user) {
  // Calculate current_balance as the sum of all account balances for the user
  const { rows } = await client.query(
    'SELECT SUM(balance) as total FROM account_balances WHERE user_id = $1',
    [user.id]
  );
  const currentBalance = rows[0].total || 0;
  const monthlyIncome = user.metadata?.employment?.monthlyIncome || 0;
  // Demo values for all new fields
  const monthlyExpenses = 2500;
  const monthlySavings = 800;
  const monthlyInvestments = 300;
  const monthlyDebt = 570;
  await client.query(
    `INSERT INTO user_financial_profiles (
      user_id, profile_type, risk_score, current_balance, monthly_income, monthly_expenses, monthly_savings, monthly_investments, monthly_debt, currency, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (user_id, profile_type) DO NOTHING`,
    [
      user.id,
      'default',
      0.5,
      currentBalance,
      monthlyIncome,
      monthlyExpenses,
      monthlySavings,
      monthlyInvestments,
      monthlyDebt,
      user.base_currency || 'GBP',
      { segment: user.metadata.segment, isCorporate: user.metadata.isCorporate, isRetail: user.metadata.isRetail }
    ]
  );
}


async function insertFinancialSummaryMonthly(client, user) {
  // Seed 3 months for demo
  const months = [
    { month: '2026-02-01', income: 7800, expenses: 4800, savings: 1800, investments: 900, net: 2100 },
    { month: '2026-03-01', income: 7900, expenses: 4900, savings: 1900, investments: 950, net: 2050 },
    { month: '2026-04-01', income: 8000, expenses: 5000, savings: 2000, investments: 1000, net: 2000 }
  ];
  for (const m of months) {
    await client.query(
      `INSERT INTO financial_summary_monthly (user_id, month, total_income, total_expenses, total_savings, total_investments, net_cashflow, currency, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, month) DO NOTHING`,
      [
        user.id,
        m.month,
        m.income,
        m.expenses,
        m.savings,
        m.investments,
        m.net,
        'GBP',
        { note: 'Seeded summary' }
      ]
    );
  }
}

require('dotenv/config');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { require: true },
});

async function insertUser(client, user) {
  await client.query(
    `INSERT INTO users (id, external_user_id, full_name, country_code, base_currency, timezone, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    [user.id, user.external_user_id, user.full_name, user.country_code, user.base_currency, user.timezone, user.status, user.metadata]
  );
}

async function insertAccounts(client, accounts) {
  for (const acc of accounts) {
    await client.query(
      `INSERT INTO account_balances (id, user_id, account_type, provider, account_ref, balance, currency, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [acc.id, acc.user_id, acc.account_type, acc.provider, acc.account_ref, acc.balance, acc.currency, acc.metadata || {}]
    );
  }
}

async function insertLoans(client, loans) {
  for (const loan of loans) {
    await client.query(
      `INSERT INTO loan_accounts (id, user_id, loan_type, provider, emi_amount, tenure_months, currency, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        loan.id,
        loan.user_id,
        loan.type,
        loan.provider,
        loan.emi,
        loan.remainingTenureMonths,
        'GBP',
        1,
        {} // metadata
      ]
    );
  }
}

async function insertInvestments(client, investments) {
  for (const inv of investments) {
    await client.query(
      `INSERT INTO investment_summary (
        id, user_id, as_of_month, total_invested, total_current_value, total_unrealized_gain, currency, investment_info, metadata, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING`,
      [
        inv.id,
        inv.user_id,
        '2026-04-01', // as_of_month (static for demo)
        inv.currentValue || 0,
        inv.currentValue || 0,
        0, // total_unrealized_gain
        'GBP',
        JSON.stringify([{ type: inv.type, provider: inv.provider, monthlyContribution: inv.monthlyContribution }]),
        {},
        Date.now()
      ]
    );
  }
}



async function insertTreasuryCashflowDaily(client, user, cashflows) {
  if (!Array.isArray(cashflows)) return;
  for (const cf of cashflows) {
    await client.query(
      `INSERT INTO treasury_cashflow_daily (
        user_id, business_date, day_name, total_inflows, total_outflows, payroll_outflow, supplier_outflow, closing_balance, currency, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id, business_date) DO NOTHING`,
      [
        user.id,
        cf.business_date,
        cf.day_name,
        cf.total_inflows,
        cf.total_outflows,
        cf.payroll_outflow,
        cf.supplier_outflow,
        cf.closing_balance,
        cf.currency || 'GBP',
        cf.metadata || {},
        Date.now(),
        Date.now()
      ]
    );
  }
}

async function insertTreasuryDecisionSnapshots(client, user, snapshots) {
  if (!Array.isArray(snapshots)) return;
  for (const snap of snapshots) {
    await client.query(
      `INSERT INTO treasury_decision_snapshots (
        user_id, snapshot_date, weekly_outflow_baseline, midweek_inflow_baseline, late_inflow_count_last_4_weeks, comfort_threshold, min_inflow_for_midweek_release, release_condition_hit_rate_10_weeks, currency, metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id, snapshot_date) DO NOTHING`,
      [
        user.id,
        snap.snapshot_date,
        snap.weekly_outflow_baseline,
        snap.midweek_inflow_baseline,
        snap.late_inflow_count_last_4_weeks,
        snap.comfort_threshold,
        snap.min_inflow_for_midweek_release,
        snap.release_condition_hit_rate_10_weeks,
        snap.currency || 'GBP',
        snap.metadata || {},
        Date.now(),
        Date.now()
      ]
    );
  }
}

async function main() {
  const client = await pool.connect();
  try {
    const seedPath = path.join(process.cwd(), 'seed/unified_fin_user_seed.json');
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    await insertUser(client, seed.user);
    await insertUserFinancialProfile(client, seed.user);
    await insertAccounts(client, seed.accounts);
    await insertLoans(client, seed.loans);
    await insertInvestments(client, seed.investments);
    await insertFinancialSummaryMonthly(client, seed.user);
    await insertTreasuryCashflowDaily(client, seed.user, seed.treasury_cashflow_daily);
    await insertTreasuryDecisionSnapshots(client, seed.user, seed.treasury_decision_snapshots);
    // Skipping savingsGoals: not supported by financial_summary_monthly schema
    console.log('Unified user seed data inserted.');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

main();
