/**
 * seed-new-db.cjs
 * Runs all SQL migrations then seeds:
 *   1. James Walker – retail banking user (banking_user_data.json)
 *   2. Northstar Retail Ltd Treasury – corporate treasury user
 *      (uk_treasury_conversation_seed_data.json + uk_treasury_cashflow_90_days.json)
 *
 * Usage:
 *   node scripts/seed-new-db.cjs
 *
 * Requires DATABASE_URL in .env (or environment).
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const { Client } = require('pg');

// Load .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.join(__dirname, '..');

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function readSql(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

async function runSql(client, label, sql) {
  try {
    await client.query(sql);
    console.log(`  ✓  ${label}`);
  } catch (err) {
    // surface the error but continue if object already exists
    if (err.code === '42P07' || err.message.includes('already exists')) {
      console.log(`  ~  ${label} (already exists – skipped)`);
    } else {
      console.error(`  ✗  ${label}:\n     ${err.message}`);
      throw err;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step 1 – Migrations
// ────────────────────────────────────────────────────────────────────────────
async function runMigrations(client) {
  console.log('\n═══ Running migrations ═══');
  const files = [
    'src/db/migrations/V1__create_user.sql',
    'src/db/migrations/V2__create_graph_state.sql',
    'src/db/migrations/V3__create_messages.sql',
    'src/db/migrations/V4__create_vector_documents.sql',
    'src/db/migrations/V5__create_user_finance_data.sql',
    'src/db/migrations/V6__create_data_sync.sql',
    'src/db/migrations/V8__create_treasury_conversation_tables.sql',
    'src/db/migrations/V9__dedupe_financial_summary_monthly.sql',
    'src/db/migrations/V10__create_treasury_transaction_ledger.sql',
    'src/db/migrations/V11__fix_account_balances_unique_index.sql',
  ];
  for (const file of files) {
    await runSql(client, file, readSql(file));
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2 – Seed James Walker (retail banking)
// ────────────────────────────────────────────────────────────────────────────
function groupByMonth(transactions) {
  const map = {};
  for (const tx of transactions) {
    const month = tx.date.substring(0, 7); // "YYYY-MM"
    if (!map[month]) {
      map[month] = { income: 0, expenses: 0, savings: 0, investments: 0 };
    }
    if (tx.type === 'CREDIT') {
      map[month].income += tx.amount;
    } else {
      const cat = (tx.category || '').toLowerCase();
      if (cat.includes('stocks') || cat.includes('isa')) {
        map[month].investments += tx.amount;
      } else if (cat.includes('premium bonds')) {
        map[month].savings += tx.amount;
      } else {
        map[month].expenses += tx.amount;
      }
    }
  }
  return map;
}

async function seedBankingUser(client, banking) {
  console.log('\n═══ Seeding James Walker (retail banking) ═══');
  const p = banking.userProfile;

  // users
    // Use a fixed UUID for the retail user
    const RETAIL_USER_UUID = 'b7e6e2e2-1111-4c4a-aaaa-000000000001';

    // users
    const uRes = await client.query(
      `INSERT INTO users (id, external_user_id, full_name, country_code, base_currency, timezone, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7)
       ON CONFLICT (id) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             external_user_id = EXCLUDED.external_user_id,
             updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [
        RETAIL_USER_UUID,
        p.userId,
        p.name,
        p.country,
        p.currency,
        'Europe/London',
        JSON.stringify({ employment: p.employment, savingsGoals: banking.savingsGoals }),
      ]
    );
    const userId = uRes.rows[0].id;
    console.log(`  ✓  users  id=${userId} (retail, fixed)`);

  // account_balances
  for (const acc of banking.accounts) {
    await client.query(
      `INSERT INTO account_balances
         (user_id, account_type, provider, account_ref, balance, currency, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id, account_ref)
       DO UPDATE SET
         account_type = EXCLUDED.account_type,
         provider = EXCLUDED.provider,
         balance = EXCLUDED.balance,
         currency = EXCLUDED.currency,
         metadata = EXCLUDED.metadata,
         updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
      [
        userId,
        acc.type,
        acc.bank,
        acc.accountId,
        acc.balance,
        p.currency,
        JSON.stringify({ averageMonthlyBalance: acc.averageMonthlyBalance }),
      ]
    );
  }
  console.log(`  ✓  account_balances (${banking.accounts.length} rows)`);

  // loan_accounts
  for (const loan of banking.loans) {
    await client.query(
      `INSERT INTO loan_accounts
         (user_id, loan_type, provider, principal_amount, outstanding_amount,
          emi_amount, tenure_months, status, currency, metadata)
       VALUES ($1,$2,$3,$4,$4,$5,$6,1,$7,$8)
       ON CONFLICT DO NOTHING`,
      [
        userId,
        loan.type,
        loan.provider,
        loan.emi * loan.remainingTenureMonths, // rough principal
        loan.emi,
        loan.remainingTenureMonths,
        p.currency,
        JSON.stringify({ loanId: loan.loanId }),
      ]
    );
  }
  console.log(`  ✓  loan_accounts (${banking.loans.length} rows)`);

  // investment_summary – aggregate all investments as of current month
  const totalInvested  = banking.investments.reduce((s, i) => s + i.currentValue, 0);
  await client.query(
    `INSERT INTO investment_summary
       (user_id, as_of_month, total_invested, total_current_value, total_unrealized_gain,
        currency, investment_info, metadata)
     VALUES ($1, DATE_TRUNC('month', CURRENT_DATE), $2, $2, 0, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [
      userId,
      totalInvested,
      p.currency,
      JSON.stringify(
        banking.investments.map(i => ({
          type: i.type,
          provider: i.provider,
          currentValue: i.currentValue,
          monthlyContribution: i.monthlyContribution,
        }))
      ),
      JSON.stringify({ subscriptions: banking.subscriptions }),
    ]
  );
  console.log(`  ✓  investment_summary`);

  // financial_summary_monthly (computed from transactions)
  const monthMap = groupByMonth(banking.transactions);
  let monthCount = 0;
  for (const [monthStr, sums] of Object.entries(monthMap)) {
    const monthDate = `${monthStr}-01`;
    const netCashflow = sums.income - sums.expenses - sums.savings - sums.investments;
    await client.query(
      `INSERT INTO financial_summary_monthly
         (user_id, month, total_income, total_expenses, total_savings,
          total_investments, net_cashflow, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id, month)
       DO UPDATE SET
         total_income = EXCLUDED.total_income,
         total_expenses = EXCLUDED.total_expenses,
         total_savings = EXCLUDED.total_savings,
         total_investments = EXCLUDED.total_investments,
         net_cashflow = EXCLUDED.net_cashflow,
         currency = EXCLUDED.currency`,
      [
        userId,
        monthDate,
        sums.income.toFixed(2),
        sums.expenses.toFixed(2),
        sums.savings.toFixed(2),
        sums.investments.toFixed(2),
        netCashflow.toFixed(2),
        p.currency,
      ]
    );
    monthCount++;
  }
  console.log(`  ✓  financial_summary_monthly (${monthCount} months)`);

  // credit_profile
  await client.query(
    `INSERT INTO credit_profile (user_id, credit_score, score_band, bureau, metadata)
     VALUES ($1, 720, 'Good', 'Experian', '{}')
     ON CONFLICT DO NOTHING`,
    [userId]
  );
  console.log(`  ✓  credit_profile`);

  return userId;
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3 – Seed Northstar Treasury
// ────────────────────────────────────────────────────────────────────────────
async function seedTreasury(client) {
  console.log('\n═══ Seeding Northstar Retail Ltd Treasury ═══');

  const conv   = readJson('docs/uk_treasury_conversation_seed_data.json');
  const hist   = readJson('docs/uk_treasury_cashflow_90_days.json');

  const tu = conv.users[0];

  // users – use the fixed UUID so treasury tables link correctly
    // Use a fixed UUID for the corporate user (from seed data)
    await client.query(
      `INSERT INTO users (id, external_user_id, full_name, country_code, base_currency, timezone, status, metadata)
       VALUES ($1,$2,$3,'GB','GBP','Europe/London',1,'{}')
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, external_user_id = EXCLUDED.external_user_id`,
      [tu.id, tu.external_user_id, tu.full_name]
    );
    console.log(`  ✓  users (treasury)  id=${tu.id} (corporate, fixed)`);

  // account_balances – 4.8m spread across 4 operating accounts
  const treasuryAccounts = [
    { ref: 'TRY-ACC-001', type: 'Operating', provider: 'Barclays Corporate',   balance: 1800000 },
    { ref: 'TRY-ACC-002', type: 'Operating', provider: 'HSBC Commercial',       balance: 1500000 },
    { ref: 'TRY-ACC-003', type: 'Operating', provider: 'NatWest Business',      balance: 900000  },
    { ref: 'TRY-ACC-004', type: 'Reserve',   provider: 'Lloyds Bank Corporate', balance: 600000  },
  ];
  for (const acc of treasuryAccounts) {
    await client.query(
      `INSERT INTO account_balances
         (user_id, account_type, provider, account_ref, balance, currency, metadata)
       VALUES ($1,$2,$3,$4,$5,'GBP','{}')
       ON CONFLICT (user_id, account_ref)
       DO UPDATE SET
         account_type = EXCLUDED.account_type,
         provider = EXCLUDED.provider,
         balance = EXCLUDED.balance,
         currency = EXCLUDED.currency,
         metadata = EXCLUDED.metadata,
         updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
      [tu.id, acc.type, acc.provider, acc.ref, acc.balance]
    );
  }
  console.log(`  ✓  account_balances (treasury, ${treasuryAccounts.length} accounts, total £4.8m)`);

  // treasury_cashflow_daily – 90-day historical dataset first
  let cashflowCount = 0;
  for (const row of hist.treasury_cashflow_daily) {
    await client.query(
      `INSERT INTO treasury_cashflow_daily
         (user_id, business_date, day_name, total_inflows, total_outflows,
          payroll_outflow, supplier_outflow, closing_balance, currency, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, business_date) DO NOTHING`,
      [
        tu.id,
        row.business_date,
        row.day_name,
        row.total_inflows,
        row.total_outflows,
        row.payroll_outflow,
        row.supplier_outflow,
        row.closing_balance,
        row.currency || 'GBP',
        JSON.stringify(row.metadata || {}),
      ]
    );
    cashflowCount++;
  }
  // also add the 4 curated sample rows from conversation seed (ON CONFLICT DO NOTHING handles duplicates)
  for (const row of conv.treasury_cashflow_daily) {
    await client.query(
      `INSERT INTO treasury_cashflow_daily
         (user_id, business_date, day_name, total_inflows, total_outflows,
          payroll_outflow, supplier_outflow, closing_balance, currency, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, business_date) DO NOTHING`,
      [
        tu.id,
        row.business_date,
        row.day_name,
        row.total_inflows,
        row.total_outflows,
        row.payroll_outflow,
        row.supplier_outflow,
        row.closing_balance,
        row.currency || 'GBP',
        JSON.stringify(row.metadata || {}),
      ]
    );
  }
  const cfTotal = await client.query(
    `SELECT COUNT(*) FROM treasury_cashflow_daily WHERE user_id = $1`, [tu.id]
  );
  console.log(`  ✓  treasury_cashflow_daily (${cfTotal.rows[0].count} rows total)`);

  // treasury_decision_snapshots
  for (const snap of conv.treasury_decision_snapshots) {
    await client.query(
      `INSERT INTO treasury_decision_snapshots
         (user_id, snapshot_date, weekly_outflow_baseline, midweek_inflow_baseline,
          late_inflow_count_last_4_weeks, comfort_threshold, min_inflow_for_midweek_release,
          release_condition_hit_rate_10_weeks, currency, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, snapshot_date) DO NOTHING`,
      [
        tu.id,
        snap.snapshot_date,
        snap.weekly_outflow_baseline,
        snap.midweek_inflow_baseline,
        snap.late_inflow_count_last_4_weeks,
        snap.comfort_threshold,
        snap.min_inflow_for_midweek_release,
        snap.release_condition_hit_rate_10_weeks,
        snap.currency || 'GBP',
        JSON.stringify(snap.metadata || {}),
      ]
    );
  }
  console.log(`  ✓  treasury_decision_snapshots (${conv.treasury_decision_snapshots.length} rows)`);

  // treasury_supplier_payment_candidates
  for (const cand of conv.treasury_supplier_payment_candidates) {
    await client.query(
      `INSERT INTO treasury_supplier_payment_candidates
         (user_id, supplier_ref, supplier_name, amount, currency,
          urgency, due_date, batch_hint, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT DO NOTHING`,
      [
        tu.id,
        cand.supplier_ref,
        cand.supplier_name,
        cand.amount,
        cand.currency || 'GBP',
        cand.urgency,
        cand.due_date,
        cand.batch_hint,
        JSON.stringify(cand.metadata || {}),
      ]
    );
  }
  console.log(`  ✓  treasury_supplier_payment_candidates (${conv.treasury_supplier_payment_candidates.length} rows)`);

  // treasury_account_transactions – account-level drilldown seeded from daily aggregates
  const round2 = (n) => Number((n || 0).toFixed(2));
  for (const row of hist.treasury_cashflow_daily) {
    const date = row.business_date;
    const inflow = Number(row.total_inflows || 0);
    const totalOutflow = Number(row.total_outflows || 0);
    let supplier = Number(row.supplier_outflow || 0);
    let payroll = Number(row.payroll_outflow || 0);

    // Some source rows can have component outflows larger than total_outflows.
    // Normalize components so ledger always reconciles exactly with daily totals.
    if (supplier + payroll > totalOutflow && (supplier + payroll) > 0) {
      const ratio = totalOutflow / (supplier + payroll);
      supplier = round2(supplier * ratio);
      payroll = round2(totalOutflow - supplier);
    }

    const otherOutflow = Math.max(0, round2(totalOutflow - supplier - payroll));

    const inflowA = round2(inflow * 0.65);
    const inflowB = round2(inflow - inflowA);
    const supA = round2(supplier * 0.6);
    const supB = round2(supplier - supA);

    const txns = [
      {
        ref: `${date}-IN-1`,
        accountRef: 'TRY-ACC-001',
        direction: 'CREDIT',
        category: 'CUSTOMER_RECEIPT',
        amount: inflowA,
        counterparty: 'Corporate Customers',
        metadata: { source: 'daily_aggregate_split', receiptPunctuality: row.metadata?.receiptPunctuality || 'UNKNOWN' },
      },
      {
        ref: `${date}-IN-2`,
        accountRef: 'TRY-ACC-002',
        direction: 'CREDIT',
        category: 'CUSTOMER_RECEIPT',
        amount: inflowB,
        counterparty: 'Corporate Customers',
        metadata: { source: 'daily_aggregate_split', receiptPunctuality: row.metadata?.receiptPunctuality || 'UNKNOWN' },
      },
      {
        ref: `${date}-SUP-1`,
        accountRef: 'TRY-ACC-001',
        direction: 'DEBIT',
        category: 'SUPPLIER_PAYMENT',
        amount: supA,
        counterparty: 'Supplier Batch A',
        metadata: { source: 'daily_aggregate_split' },
      },
      {
        ref: `${date}-SUP-2`,
        accountRef: 'TRY-ACC-003',
        direction: 'DEBIT',
        category: 'SUPPLIER_PAYMENT',
        amount: supB,
        counterparty: 'Supplier Batch B',
        metadata: { source: 'daily_aggregate_split' },
      },
      {
        ref: `${date}-PAY-1`,
        accountRef: 'TRY-ACC-002',
        direction: 'DEBIT',
        category: 'PAYROLL',
        amount: payroll,
        counterparty: 'Payroll Provider',
        metadata: { source: 'daily_aggregate_split' },
      },
      {
        ref: `${date}-OPEX-1`,
        accountRef: 'TRY-ACC-004',
        direction: 'DEBIT',
        category: 'OPERATING_EXPENSE',
        amount: round2(otherOutflow),
        counterparty: 'Operations',
        metadata: { source: 'daily_aggregate_split' },
      },
    ];

    for (const tx of txns) {
      if (tx.amount <= 0) continue;
      await client.query(
        `INSERT INTO treasury_account_transactions
           (user_id, account_ref, txn_ref, txn_date, direction, category, amount, currency, counterparty, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'GBP',$8,$9)
         ON CONFLICT (user_id, txn_ref)
         DO UPDATE SET
           account_ref = EXCLUDED.account_ref,
           txn_date = EXCLUDED.txn_date,
           direction = EXCLUDED.direction,
           category = EXCLUDED.category,
           amount = EXCLUDED.amount,
           currency = EXCLUDED.currency,
           counterparty = EXCLUDED.counterparty,
           metadata = EXCLUDED.metadata,
           updated_at = (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT`,
        [
          tu.id,
          tx.accountRef,
          tx.ref,
          date,
          tx.direction,
          tx.category,
          tx.amount,
          tx.counterparty,
          JSON.stringify(tx.metadata || {}),
        ]
      );
    }
  }
  const txnCount = await client.query(
    `SELECT COUNT(*)::INT AS c FROM treasury_account_transactions WHERE user_id = $1`,
    [tu.id]
  );
  console.log(`  ✓  treasury_account_transactions (${txnCount.rows[0].c} rows)`);
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    console.error('ERROR: DATABASE_URL not set in .env');
    process.exit(1);
  }

  console.log(`\nConnecting to: ${connStr.replace(/:([^@]+)@/, ':****@')}`);
  const client = new Client({ connectionString: connStr });
  await client.connect();

  // Wipe all relevant tables after connecting, before anything else
  console.log('\n==== WIPING ALL USER/PROFILE DATA ====');
  await client.query('DELETE FROM treasury_decision_snapshots');
  await client.query('DELETE FROM treasury_cashflow_daily');
  await client.query('DELETE FROM account_balances');
  await client.query('DELETE FROM loan_accounts');
  await client.query('DELETE FROM investment_summary');
  await client.query('DELETE FROM financial_summary_monthly');
  await client.query('DELETE FROM credit_profile');
  await client.query('DELETE FROM users');
  console.log('All relevant tables wiped.');

  console.log('Connected.\n');

  try {
    await runMigrations(client);
    const banking = readJson('banking_user_data.json');
    const retailUserId = await seedBankingUser(client, banking);
    const treasuryUserId = await seedTreasury(client);
    // Print both UUIDs for clarity
    console.log('\n==== FIXED USER IDS ====');
    console.log('Retail user UUID (James Walker):    b7e6e2e2-1111-4c4a-aaaa-000000000001');
    console.log('Corporate user UUID (Northstar):    ' + treasuryUserId);
    console.log('External user IDs: retail=uk_user_001, corporate=corp-northstar-001');
    console.log('\n✅  All done. New Neon DB is ready.\n');
  } catch (err) {
    console.error('\n❌  Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
