import { getEmbeddingForText } from "./embedding/embedding.helper.js";
export class SyncService {
    syncRepo;
    vectorRepo;
    bankProvider;
    constructor({ syncRepo, vectorRepo, bankProvider, }) {
        this.syncRepo = syncRepo;
        this.vectorRepo = vectorRepo;
        this.bankProvider = bankProvider;
    }
    async runSync(userId, externalConnectionId) {
        const syncJob = await this.syncRepo.createSync({ userId, externalConnectionId });
        try {
            await this.syncRepo.updateSyncStatus({ id: syncJob.id, status: 2 }); // PROCESSING
            const transactions = await this.bankProvider.fetchTransactions(externalConnectionId, null);
            for (const tx of transactions) {
                const content = `Transaction: ${tx.description} for ${tx.amount.value} ${tx.amount.currency} on ${tx.bookingDate}`;
                const embedding = await getEmbeddingForText(content);
                await this.vectorRepo.insertDb({
                    user_id: userId,
                    content,
                    embedding,
                    domain: "finance",
                    facet: "transaction",
                    source: this.bankProvider.name,
                    metadata: tx.metadata ?? {},
                    embedding_model: "text-embedding-3-small",
                });
            }
            await this.syncRepo.updateSyncStatus({ id: syncJob.id, status: 3 }); // COMPLETED
        }
        catch (error) {
            const errorLog = error instanceof Error ? error.message : String(error);
            await this.syncRepo.updateSyncStatus({
                id: syncJob.id,
                status: 4, // FAILED
                errorLog,
            });
            throw error;
        }
    }
}
