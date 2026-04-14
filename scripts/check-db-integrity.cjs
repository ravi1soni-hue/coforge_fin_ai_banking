// DB integrity checker for all main tables
const { db } = require('../dist/src/db.js');

async function checkTable(table, checks) {
  const rows = await db.selectFrom(table).selectAll().execute();
  const errors = [];
  if (rows.length === 0) {
    errors.push('Table is empty');
    return { errors, rows };
  }
  for (const check of checks) {
    const result = await check(rows);
    if (result) errors.push(result);
  }
  return { errors, rows };
}

function hasDuplicates(arr, key) {
  const seen = new Set();
  for (const item of arr) {
    if (seen.has(item[key])) return true;
    seen.add(item[key]);
  }
  return false;
}

async function main() {
  const report = {};

  // Users
  report.users = await checkTable('users', [
    rows => hasDuplicates(rows, 'id') ? 'Duplicate user id' : null,
    rows => rows.some(u => !u.external_user_id) ? 'Missing external_user_id' : null,
    rows => rows.some(u => u.status !== 1) ? 'Non-active user(s) present' : null,
  ]);

  // Accounts
  report.account_balances = await checkTable('account_balances', [
    rows => hasDuplicates(rows, 'id') ? 'Duplicate account id' : null,
    rows => rows.some(a => !a.user_id) ? 'Missing user_id' : null,
    rows => rows.some(a => a.balance == null) ? 'Null balance' : null,
  ]);

  // Transactions
  report.treasury_account_transactions = await checkTable('treasury_account_transactions', [
    rows => hasDuplicates(rows, 'id') ? 'Duplicate txn id' : null,
    rows => hasDuplicates(rows, 'txn_ref') ? 'Duplicate txn_ref' : null,
    rows => rows.some(t => !t.user_id || !t.account_ref || !t.txn_ref) ? 'Missing user_id/account_ref/txn_ref' : null,
    rows => rows.some(t => typeof t.amount !== 'number' || t.amount <= 0) ? 'Non-positive or invalid amount' : null,
  ]);

  // Embeddings
  report.vector_documents = await checkTable('vector_documents', [
    rows => hasDuplicates(rows, 'id') ? 'Duplicate vector id' : null,
    rows => rows.some(v => !v.user_id || !v.content || !Array.isArray(v.embedding) || v.embedding.length === 0) ? 'Missing user_id/content/embedding' : null,
  ]);

  // Cashflow
  report.treasury_cashflow_daily = await checkTable('treasury_cashflow_daily', [
    rows => hasDuplicates(rows, 'id') ? 'Duplicate cashflow id' : null,
    rows => rows.some(c => !c.user_id || !c.business_date) ? 'Missing user_id/business_date' : null,
  ]);

  // Print summary
  for (const [table, { errors, rows }] of Object.entries(report)) {
    console.log(`\n=== ${table} ===`);
    if (errors.length === 0) {
      console.log('✅ OK:', rows.length, 'rows');
    } else {
      console.log('❌ ERRORS:', errors);
      console.log('Rows:', rows.length);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
