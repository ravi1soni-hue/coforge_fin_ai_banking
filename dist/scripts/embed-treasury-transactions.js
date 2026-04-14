// Clean and re-embed treasury_account_transactions into vector_documents
import { db } from '../src/db.js';
import { VectorRepository } from '../src/repo/vector.repo.js';
import { getEmbeddingForText } from '../src/services/embedding/embedding.helper.js';
async function main() {
    const userId = process.env.SEED_USER_ID || '9c3c98be-9e6e-4eaf-9f0a-b28d5c4b10a1';
    const vectorRepo = new VectorRepository({ db });
    // 1. Deactivate all existing vectors for this user
    await vectorRepo.deactivateAllForUser(userId);
    // 2. Fetch all transactions for this user
    const txns = await db
        .selectFrom('treasury_account_transactions')
        .selectAll()
        .where('user_id', '=', userId)
        .execute();
    // 3. Prepare and embed each transaction in batches with retry
    const BATCH_SIZE = 10;
    const docs = [];
    async function embedWithRetry(content, maxRetries = 5) {
        let attempt = 0;
        let delay = 1000;
        while (attempt < maxRetries) {
            try {
                return await getEmbeddingForText(content);
            }
            catch (err) {
                if (err && err.message && typeof err.message === 'string' && err.message.includes('429')) {
                    attempt++;
                    console.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt})...`);
                    await new Promise(res => setTimeout(res, delay));
                    delay *= 2;
                }
                else {
                    throw err;
                }
            }
        }
        throw new Error('Failed to embed after retries');
    }
    for (let i = 0; i < txns.length; i += BATCH_SIZE) {
        const batch = txns.slice(i, i + BATCH_SIZE);
        const batchDocs = [];
        for (const txn of batch) {
            const content = `Transaction: ${txn.txn_date} | ${txn.direction} | ${txn.category} | Amount: ${txn.amount} ${txn.currency} | Counterparty: ${txn.counterparty || ''}`;
            const embedding = await embedWithRetry(content);
            batchDocs.push({
                user_id: userId,
                content,
                embedding,
                domain: 'treasury',
                facet: txn.category,
                source: 'treasury_account_transactions',
                metadata: txn,
                embedding_model: 'openai',
                embedding_version: 1,
            });
        }
        await vectorRepo.bulkInsertDb(batchDocs);
        docs.push(...batchDocs);
        console.log(`Embedded batch ${i / BATCH_SIZE + 1} (${docs.length}/${txns.length})`);
    }
    console.log(`Embedded ${docs.length} transactions into vector_documents for user ${userId}`);
    process.exit(0);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
