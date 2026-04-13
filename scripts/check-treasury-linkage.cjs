require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const uid = '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1';
  const user = await c.query(
    'select id, external_user_id, full_name from users where id=$1',
    [uid]
  );
  const accounts = await c.query(
    'select account_ref, provider, account_type, balance::numeric::text as balance, currency from account_balances where user_id=$1 order by account_ref',
    [uid]
  );
  const accountTotal = await c.query(
    'select coalesce(sum(balance),0)::numeric::text as total_balance from account_balances where user_id=$1',
    [uid]
  );
  const cashflow = await c.query(
    'select count(*)::int as c, min(business_date) as min_d, max(business_date) as max_d from treasury_cashflow_daily where user_id=$1',
    [uid]
  );
  const snapshots = await c.query(
    'select count(*)::int as c, max(snapshot_date) as latest_snapshot from treasury_decision_snapshots where user_id=$1',
    [uid]
  );
  const suppliers = await c.query(
    'select count(*)::int as c, coalesce(sum(amount),0)::numeric::text as total_amount from treasury_supplier_payment_candidates where user_id=$1',
    [uid]
  );

  console.log(
    JSON.stringify(
      {
        user: user.rows[0],
        treasury_accounts: accounts.rows,
        treasury_account_total: accountTotal.rows[0].total_balance,
        cashflow_daily: cashflow.rows[0],
        decision_snapshots: snapshots.rows[0],
        supplier_candidates: suppliers.rows[0],
      },
      null,
      2
    )
  );

  await c.end();
})();
