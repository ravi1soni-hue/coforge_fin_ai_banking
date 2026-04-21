// This script verifies supplier amounts and payment data in the DB for sanity.
// Run with: node scripts/verify-supplier-amounts.js

const { Client } = require('pg');
const connectionString = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/yourdb';

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  // Adjust table/column names as per your schema
  const supplierQuery = `
    SELECT id, amount, user_id, urgency, supplier_ref, supplier_name
    FROM treasury_supplier_payment_candidates
    WHERE amount IS NOT NULL
  `;

  const res = await client.query(supplierQuery);
  let issues = [];
  for (const row of res.rows) {
    let amt = row.amount;
    // Accept numbers or strings that can be parsed as numbers
    if (typeof amt === 'string') {
      const parsed = Number(amt);
      if (isNaN(parsed)) {
        issues.push({ id: row.id, issue: 'Non-numeric amount', amount: amt });
        continue;
      }
      amt = parsed;
    }
    if (typeof amt !== 'number' || isNaN(amt)) {
      issues.push({ id: row.id, issue: 'Non-numeric amount', amount: amt });
    } else if (amt < 0) {
      issues.push({ id: row.id, issue: 'Negative amount', amount: amt });
    } else if (amt > 1e8) {
      issues.push({ id: row.id, issue: 'Unrealistically large amount', amount: amt });
    }
  }

  if (issues.length === 0) {
    console.log('All supplier amounts are valid.');
  } else {
    console.log('Issues found in supplier amounts:');
    console.table(issues);
  }

  await client.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
