// Script to print problematic records in transactions and vector_documents
const { db } = require('../dist/src/db.js');

async function main() {
  // Transactions with non-positive or invalid amount
  const badTxns = await db.selectFrom('treasury_account_transactions')
    .selectAll()
    .where(({ eb }) => eb.or([
      eb('amount', '<=', 0),
      eb('amount', 'is', null)
    ]))
    .execute();

  // Vector documents missing user_id, content, or embedding
  const badVectors = await db.selectFrom('vector_documents')
    .selectAll()
    .where(({ eb }) => eb.or([
      eb('user_id', 'is', null),
      eb('content', 'is', null),
      eb('embedding', 'is', null)
    ]))
    .execute();

  console.log('\n=== Invalid Transactions (amount <= 0 or null) ===');
  if (badTxns.length === 0) {
    console.log('✅ None');
  } else {
    badTxns.forEach(t => console.log(t));
  }

  console.log('\n=== Invalid Vector Documents (missing user_id/content/embedding) ===');
  if (badVectors.length === 0) {
    console.log('✅ None');
  } else {
    badVectors.forEach(v => console.log(v));
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
