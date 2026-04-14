// New generator script: generates transactions for any given seed file (argument)
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

if (process.argv.length < 3) {
  console.error('Usage: node generate_transactions_from_cashflow_v2.cjs <seed-file-path>');
  process.exit(1);
}

const seedPath = path.resolve(process.argv[2]);
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const userId = seed.user.id;
const accountRef = seed.accounts[0].account_ref;

const txns = [];
for (const day of seed.treasury_cashflow_daily) {
  // Inflow
  const inflowId = randomUUID();
  txns.push({
    id: inflowId,
    txn_ref: inflowId,
    user_id: userId,
    txn_date: day.business_date,
    amount: day.total_inflows,
    direction: 'CREDIT',
    category: 'INCOME',
    currency: day.currency,
    counterparty: 'Corporate Client',
    account_ref: accountRef,
    metadata: { source: 'synthetic_uk_treasury_90d' }
  });
  // Outflow
  const outflowId = randomUUID();
  txns.push({
    id: outflowId,
    txn_ref: outflowId,
    user_id: userId,
    txn_date: day.business_date,
    amount: day.total_outflows,
    direction: 'DEBIT',
    category: 'OUTFLOW',
    currency: day.currency,
    counterparty: 'Various',
    account_ref: accountRef,
    metadata: { source: 'synthetic_uk_treasury_90d' }
  });
  // Payroll
  if (day.payroll_outflow && day.payroll_outflow > 0) {
    const payrollId = randomUUID();
    txns.push({
      id: payrollId,
      txn_ref: payrollId,
      user_id: userId,
      txn_date: day.business_date,
      amount: day.payroll_outflow,
      direction: 'DEBIT',
      category: 'PAYROLL',
      currency: day.currency,
      counterparty: 'Payroll',
      account_ref: accountRef,
      metadata: { source: 'synthetic_uk_treasury_90d' }
    });
  }
  // Supplier
  if (day.supplier_outflow && day.supplier_outflow > 0) {
    const supplierId = randomUUID();
    txns.push({
      id: supplierId,
      txn_ref: supplierId,
      user_id: userId,
      txn_date: day.business_date,
      amount: day.supplier_outflow,
      direction: 'DEBIT',
      category: 'SUPPLIER',
      currency: day.currency,
      counterparty: 'Supplier Ltd',
      account_ref: accountRef,
      metadata: { source: 'synthetic_uk_treasury_90d' }
    });
  }
}
seed.treasury_account_transactions = txns;
fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));
console.log(`Wrote ${txns.length} transactions to treasury_account_transactions in seed file.`);
