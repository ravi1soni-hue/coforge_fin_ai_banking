'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // user_financial_profiles table
  const r1 = await c.query(
    'SELECT user_id, current_balance, monthly_income, monthly_expenses, currency FROM user_financial_profiles LIMIT 5'
  ).catch(e => ({ rows: [], err: e.message }));
  console.log('user_financial_profiles:', r1.err || JSON.stringify(r1.rows, null, 2));

  // James Walker balances
  const r2 = await c.query(
    "SELECT account_type, provider, balance FROM account_balances WHERE user_id = '57e64ee5-902a-431b-a3b2-a15a001522eb'"
  );
  console.log('\nJames balances:', JSON.stringify(r2.rows));

  // James latest 3 monthly summaries
  const r3 = await c.query(
    "SELECT month, total_income, total_expenses, net_cashflow FROM financial_summary_monthly WHERE user_id = '57e64ee5-902a-431b-a3b2-a15a001522eb' ORDER BY month DESC LIMIT 3"
  );
  console.log('\nJames monthly (latest 3):', JSON.stringify(r3.rows));

  // Corporate treasury snapshot
  const r4 = await c.query(
    "SELECT snapshot_date, weekly_outflow_baseline, midweek_inflow_baseline, comfort_threshold FROM treasury_decision_snapshots WHERE user_id = '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1'"
  );
  console.log('\nCorp treasury snapshot:', JSON.stringify(r4.rows));

  await c.end();
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
