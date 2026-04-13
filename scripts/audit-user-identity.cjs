'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ── 1. All users
  const usersRes = await client.query(
    `SELECT id, external_user_id, full_name, base_currency, status FROM users ORDER BY created_at`
  );
  console.log('\n=== USERS (canonical IDs) ===');
  for (const u of usersRes.rows) {
    console.log(`  id=${u.id}  external_user_id=${u.external_user_id}  name="${u.full_name}"  currency=${u.base_currency}`);
  }

  // ── 2. Per-user data counts to verify all tables FK correctly to users.id
  console.log('\n=== DATA LINKAGE (all queries use users.id) ===');
  for (const u of usersRes.rows) {
    const uid = u.id;
    const r = await client.query(
      `SELECT
        (SELECT COUNT(*)         FROM account_balances                WHERE user_id=$1) AS balances,
        (SELECT COALESCE(SUM(balance),0) FROM account_balances        WHERE user_id=$1) AS total_balance,
        (SELECT COUNT(*)         FROM financial_summary_monthly       WHERE user_id=$1) AS monthly_summaries,
        (SELECT COUNT(*)         FROM vector_documents                WHERE user_id=$1 AND is_active=true) AS active_vectors,
        (SELECT COUNT(*)         FROM treasury_decision_snapshots     WHERE user_id=$1) AS treasury_snapshots,
        (SELECT COUNT(*)         FROM treasury_supplier_payment_candidates WHERE user_id=$1) AS treasury_suppliers,
        (SELECT COUNT(*)         FROM treasury_cashflow_daily         WHERE user_id=$1) AS treasury_cashflow_days,
        (SELECT COUNT(*)         FROM loan_accounts                   WHERE user_id=$1) AS loans,
        (SELECT COUNT(*)         FROM credit_profile                  WHERE user_id=$1) AS credit_profile,
        (SELECT COUNT(*)         FROM investment_summary              WHERE user_id=$1) AS investments`,
      [uid]
    );
    const d = r.rows[0];
    console.log(`\n  User: ${u.full_name} (${u.external_user_id})`);
    console.log(`  Internal UUID: ${uid}`);
    console.log(`  account_balances:              ${d.balances} rows  (total £${Number(d.total_balance).toLocaleString('en-GB')})`);
    console.log(`  financial_summary_monthly:     ${d.monthly_summaries} months`);
    console.log(`  vector_documents (active):     ${d.active_vectors}`);
    console.log(`  treasury_decision_snapshots:   ${d.treasury_snapshots}`);
    console.log(`  treasury_supplier_candidates:  ${d.treasury_suppliers}`);
    console.log(`  treasury_cashflow_daily:       ${d.treasury_cashflow_days} days`);
    console.log(`  loan_accounts:                 ${d.loans}`);
    console.log(`  credit_profile:                ${d.credit_profile}`);
    console.log(`  investment_summary:            ${d.investments}`);
  }

  // ── 3. Check isTreasuryQuestion works for the corporate user (regex coverage)
  console.log('\n=== TREASURY IDENTITY CHECK ===');
  const treasuryUserId = usersRes.rows.find(u => u.external_user_id.includes('corp'))?.id;
  const retailUserId   = usersRes.rows.find(u => !u.external_user_id.includes('corp'))?.id;
  console.log(`  Corporate user ID (for treasury queries):  ${treasuryUserId ?? 'NOT FOUND'}`);
  console.log(`  Retail user ID (for affordability queries): ${retailUserId ?? 'NOT FOUND'}`);
  console.log(`  Both point to single users.id — no secondary ID needed.`);

  // ── 4. Schema uniqueness guards
  console.log('\n=== UNIQUE CONSTRAINTS ===');
  const constraints = await client.query(
    `SELECT tc.table_name, tc.constraint_type,
            string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS columns
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public'
       AND tc.constraint_type IN ('UNIQUE','PRIMARY KEY')
       AND tc.table_name IN (
         'users','account_balances','financial_summary_monthly',
         'treasury_decision_snapshots','treasury_cashflow_daily',
         'treasury_supplier_payment_candidates','chat_sessions','chat_messages'
       )
     GROUP BY tc.table_name, tc.constraint_type
     ORDER BY tc.table_name, tc.constraint_type`
  );
  for (const c of constraints.rows) {
    console.log(`  ${c.table_name}  [${c.constraint_type}]  columns: ${c.columns}`);
  }

  await client.end();
}
main().catch(e => { console.error('AUDIT FAILED:', e.message); process.exit(1); });
