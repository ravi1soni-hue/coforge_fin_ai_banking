require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const uid = '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1';

  const recon = await c.query(
    `WITH ledger AS (
       SELECT
         txn_date AS d,
         SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS inflow,
         SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END) AS outflow
       FROM treasury_account_transactions
       WHERE user_id = $1
       GROUP BY txn_date
     ), agg AS (
       SELECT
         business_date AS d,
         total_inflows AS inflow,
         total_outflows AS outflow
       FROM treasury_cashflow_daily
       WHERE user_id = $1
     )
     SELECT
       COUNT(*)::INT AS days_compared,
       COALESCE(SUM(ABS(ledger.inflow - agg.inflow)), 0)::NUMERIC(18,2)::TEXT AS inflow_abs_diff_sum,
       COALESCE(SUM(ABS(ledger.outflow - agg.outflow)), 0)::NUMERIC(18,2)::TEXT AS outflow_abs_diff_sum
     FROM ledger
     JOIN agg ON ledger.d = agg.d`,
    [uid]
  );

  const accountDup = await c.query(
    `SELECT COUNT(*)::INT AS dup_accounts
     FROM (
       SELECT user_id, account_ref, COUNT(*)
       FROM account_balances
       WHERE account_ref IS NOT NULL
       GROUP BY user_id, account_ref
       HAVING COUNT(*) > 1
     ) t`
  );

  const retailMonthly = await c.query(
    `SELECT
       COUNT(*)::INT AS total,
       COUNT(DISTINCT month)::INT AS distinct_months
     FROM financial_summary_monthly f
     JOIN users u ON u.id = f.user_id
     WHERE u.external_user_id = 'uk_user_001'`
  );

  const txnCount = await c.query(
    `SELECT COUNT(*)::INT AS ledger_rows
     FROM treasury_account_transactions
     WHERE user_id = $1`,
    [uid]
  );

  const mismatchDays = await c.query(
    `WITH ledger AS (
       SELECT
         txn_date AS d,
         SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS inflow,
         SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END) AS outflow
       FROM treasury_account_transactions
       WHERE user_id = $1
       GROUP BY txn_date
     ), agg AS (
       SELECT
         business_date AS d,
         total_inflows AS inflow,
         total_outflows AS outflow
       FROM treasury_cashflow_daily
       WHERE user_id = $1
     )
     SELECT
       agg.d,
       agg.inflow::NUMERIC(15,2)::TEXT AS agg_inflow,
       COALESCE(ledger.inflow, 0)::NUMERIC(15,2)::TEXT AS ledger_inflow,
       (COALESCE(ledger.inflow, 0) - agg.inflow)::NUMERIC(15,2)::TEXT AS inflow_diff,
       agg.outflow::NUMERIC(15,2)::TEXT AS agg_outflow,
       COALESCE(ledger.outflow, 0)::NUMERIC(15,2)::TEXT AS ledger_outflow,
       (COALESCE(ledger.outflow, 0) - agg.outflow)::NUMERIC(15,2)::TEXT AS outflow_diff
     FROM agg
     LEFT JOIN ledger ON ledger.d = agg.d
     WHERE ABS(COALESCE(ledger.inflow, 0) - agg.inflow) > 0.009
        OR ABS(COALESCE(ledger.outflow, 0) - agg.outflow) > 0.009
     ORDER BY agg.d
     LIMIT 20`,
    [uid]
  );

  console.log(
    JSON.stringify(
      {
        reconciliation: recon.rows[0],
        account_balance_duplicate_keys: accountDup.rows[0].dup_accounts,
        retail_financial_summary: retailMonthly.rows[0],
        treasury_account_transactions: txnCount.rows[0].ledger_rows,
        sample_mismatch_days: mismatchDays.rows,
      },
      null,
      2
    )
  );

  await c.end();
})();
