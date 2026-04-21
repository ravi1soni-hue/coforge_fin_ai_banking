// This script auto-fixes supplier payment amounts stored as strings by converting them to numbers.
// Run with: node scripts/fix-supplier-amounts.cjs

const { Client } = require('pg');
const connectionString = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/yourdb';

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  // Find all rows with non-numeric amounts (stored as text)

  const selectQuery = `
    SELECT id, amount
    FROM treasury_supplier_payment_candidates
    WHERE amount IS NOT NULL
  `;

  const res = await client.query(selectQuery);
  let updated = 0;
  for (const row of res.rows) {
    if (typeof row.amount === 'string') {
      let fixedAmount = Number(row.amount);
      if (!isNaN(fixedAmount)) {
        // Update the row with the numeric value
        await client.query(
          'UPDATE treasury_supplier_payment_candidates SET amount = $1 WHERE id = $2',
          [fixedAmount, row.id]
        );
        updated++;
        console.log(`Fixed id=${row.id}: amount='${row.amount}' -> ${fixedAmount}`);
      } else {
        console.warn(`Could not fix id=${row.id}: amount='${row.amount}'`);
      }
    }
  }

  console.log(`\nTotal rows fixed: ${updated}`);
  await client.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
